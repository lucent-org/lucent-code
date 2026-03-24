import * as vscode from 'vscode';
import * as Diff from 'diff';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import type { ExtensionMessage, WebviewMessage, ChatMessage, Conversation, ToolCall, DiffLine } from '../shared/types';
import { messageText } from '../core/message-text';
import { OpenRouterClient, OpenRouterError } from '../core/openrouter-client';
import { ContextBuilder } from '../core/context-builder';
import { Settings } from '../core/settings';
import { EditorToolExecutor, TOOL_DEFINITIONS, USE_SKILL_TOOL_DEFINITION, START_WORKTREE_TOOL_DEFINITION } from '../lsp/editor-tools';
import { WorktreeManager } from '../core/worktree-manager';
import { ConversationHistory } from './history';
import { NotificationService } from '../core/notifications';
import { TerminalBuffer } from '../core/terminal-buffer';
import { SkillRegistry } from '../skills/skill-registry';
import type { McpClientManager } from '../mcp/mcp-client-manager';
import type { Indexer } from '../search/indexer';
import { ToolApprovalManager } from './tool-approval-manager';

export class MessageHandler {
  private conversationMessages: ChatMessage[] = [];
  private abortController?: AbortController;
  private currentConversation?: Conversation;
  private pendingApply = new Map<string, string>(); // fileUri string → proposed code

  onStreamEnd?: () => void;
  onAuthInvalid?: () => void;

  resetConversation(): void {
    this.conversationMessages = [];
    this.currentConversation = undefined;
    this.sessionCost = 0;
  }

  private readonly pendingApprovals = new Map<string, (result: { approved: boolean; scope: 'once' | 'workspace' | 'global' }) => void>();
  private _autonomousMode = false;
  private _worktreeManager: WorktreeManager | null = null;

  private sessionCost = 0;
  private modelPricing = new Map<string, { prompt: string; completion: string }>();

  private static readonly GATED_TOOLS = new Set([
    'rename_symbol',
    'insert_code',
    'replace_range',
    'apply_code_action',
  ]);

  private static readonly APPROVAL_GATED_TOOLS = new Set([
    'write_file',
    'delete_file',
    'run_terminal_command',
    'use_model',
  ]);

  private readonly approvalManager: ToolApprovalManager;

  constructor(
    private readonly client: OpenRouterClient,
    private readonly contextBuilder: ContextBuilder,
    private readonly settings: Settings,
    private readonly toolExecutor?: EditorToolExecutor,
    private readonly history?: ConversationHistory,
    private readonly notifications: NotificationService = new NotificationService(),
    private readonly terminalBuffer?: TerminalBuffer,
    private readonly skillRegistry?: SkillRegistry,
    private readonly mcpClientManager?: McpClientManager,
    private readonly indexer?: Indexer
  ) {
    this._autonomousMode = this.settings.autonomousMode ?? false;
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    this.approvalManager = new ToolApprovalManager(wsRoot);
  }

  setWorktreeManager(manager: WorktreeManager): void {
    this._worktreeManager = manager;
  }

  setAutonomousMode(value: boolean): void {
    this._autonomousMode = value;
    if (value && this._worktreeManager?.state === 'idle' && this.currentConversation) {
      this._worktreeManager.create(this.currentConversation.id).catch((e: Error) => {
        console.error('[WorktreeManager] Failed to create worktree:', e.message);
      });
    }
  }

  setModelPricing(models: import('../shared/types').OpenRouterModel[]): void {
    for (const m of models) {
      this.modelPricing.set(m.id, m.pricing);
    }
  }

  get currentConversationId(): string | undefined {
    return this.currentConversation?.id;
  }

  get worktreeManager(): WorktreeManager | null {
    return this._worktreeManager;
  }

  async handleMessage(message: WebviewMessage, postMessage: (msg: ExtensionMessage) => void): Promise<void> {
    switch (message.type) {
      case 'sendMessage':
        await this.handleSendMessage(message.content, message.images ?? [], message.model, postMessage);
        break;
      case 'cancelRequest':
        this.handleCancel();
        break;
      case 'getModels':
        await this.handleGetModels(postMessage);
        break;
      case 'setModel':
        await this.settings.setChatModel(message.modelId);
        postMessage({ type: 'modelChanged', modelId: message.modelId });
        break;
      case 'newChat':
        // Call finishSession before switching conversations so user gets the merge/PR/discard prompt
        if (this._worktreeManager?.state === 'active') {
          this._worktreeManager.finishSession().catch((e: Error) => {
            console.error('[WorktreeManager] finishSession failed:', e.message);
          });
        }
        this.conversationMessages = [];
        this.currentConversation = undefined;
        break;
      case 'listConversations':
        await this.handleListConversations(postMessage);
        break;
      case 'loadConversation':
        await this.handleLoadConversation(message.id, postMessage);
        break;
      case 'deleteConversation':
        await this.handleDeleteConversation(message.id, postMessage);
        break;
      case 'exportConversation':
        await this.handleExportConversation(message.id, message.format, postMessage);
        break;
      case 'ready': {
        this.pendingApply.clear();
        await this.handleGetModels(postMessage);
        let context;
        try {
          context = await this.contextBuilder.buildEnrichedContext();
        } catch {
          context = this.contextBuilder.buildContext();
        }
        postMessage({ type: 'contextUpdate', context });
        const skillSummaries = this.skillRegistry?.getSummaries() ?? [];
        if (skillSummaries.length > 0) {
          postMessage({ type: 'skillsLoaded', skills: skillSummaries });
        }
        break;
      }
      case 'applyToFile':
        await this.handleApplyToFile(message.code, message.language, message.filename, postMessage);
        break;
      case 'confirmApply':
        await this.handleConfirmApply(message.fileUri);
        break;
      case 'toolApprovalResponse': {
        const resolve = this.pendingApprovals.get(message.requestId);
        if (resolve) {
          this.pendingApprovals.delete(message.requestId);
          resolve({ approved: message.approved, scope: message.scope ?? 'once' });
        }
        break;
      }
      case 'getTerminalOutput': {
        const content = this.terminalBuffer?.getActiveTerminalOutput() ?? null;
        postMessage({ type: 'terminalOutput', content });
        break;
      }
      case 'getSkillContent': {
        const skill = this.skillRegistry?.get(message.name);
        postMessage({ type: 'skillContent', name: message.name, content: skill?.content ?? null });
        break;
      }
      case 'setAutonomousMode':
        this.setAutonomousMode(message.enabled);
        break;
      case 'startWorktree': {
        const convId = this.currentConversation?.id ?? Date.now().toString();
        if (this._worktreeManager) {
          this._worktreeManager.create(convId).catch((e: Error) => {
            console.error('[WorktreeManager] Failed to create worktree:', e.message);
          });
        }
        break;
      }
      case 'compactConversation': {
        const model = message.model;
        let summary: string;
        try {
          const historyText = this.conversationMessages
            .map((m) => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
            .join('\n');
          const response = await this.client.chat({
            model,
            messages: [
              {
                role: 'user',
                content: `Summarize this conversation in 3–5 sentences. Capture key decisions, code changes discussed, and open questions. Be concise.\n\n${historyText}`,
              },
            ],
            max_tokens: 300,
          });
          const raw = response.choices?.[0]?.message?.content;
          summary = typeof raw === 'string' ? raw : (raw ? JSON.stringify(raw) : '[No summary generated]');
        } catch (e: unknown) {
          summary = `[Compaction failed: ${e instanceof Error ? e.message : String(e)}]`;
        }

        const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
        this.conversationMessages = [
          { role: 'user', content: `[Conversation compacted — ${timestamp}]\n\n${summary}` },
        ];
        postMessage({ type: 'conversationCompacted', summary });
        break;
      }
      case 'listFiles': {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
          postMessage({ type: 'fileList', files: [] });
          break;
        }
        const root = folders[0].uri.fsPath;
        const query = message.query.trim().toLowerCase();
        const uris = await vscode.workspace.findFiles('**/*', '**/node_modules/**', 500);
        const files = uris
          .map((uri) => {
            const rel = uri.fsPath.replace(root + '/', '').replace(root + '\\', '');
            const name = rel.split(/[\\/]/).pop() ?? rel;
            return { name, relativePath: rel };
          })
          .filter(({ relativePath }) => !query || relativePath.toLowerCase().includes(query))
          .slice(0, 30);
        postMessage({ type: 'fileList', files });
        break;
      }
      case 'readFileForAttachment': {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
          postMessage({ type: 'fileAttachment', name: '', relativePath: message.relativePath, content: '', error: 'No workspace' });
          break;
        }
        const uri = vscode.Uri.joinPath(folders[0].uri, message.relativePath);
        try {
          const bytes = await vscode.workspace.fs.readFile(uri);
          if (bytes.byteLength > 5 * 1024 * 1024) {
            postMessage({ type: 'fileAttachment', name: '', relativePath: message.relativePath, content: '', error: 'File exceeds 5 MB limit' });
            break;
          }
          // Detect binary files by scanning for null bytes in first 8 KB
          const probe = new Uint8Array(bytes.buffer, 0, Math.min(bytes.byteLength, 8192));
          if (probe.indexOf(0) !== -1) {
            const name = message.relativePath.split(/[\\/]/).pop() ?? message.relativePath;
            postMessage({ type: 'fileAttachment', name, relativePath: message.relativePath, content: '', error: 'Binary file — cannot attach as text' });
            break;
          }
          const content = new TextDecoder().decode(bytes);
          const name = message.relativePath.split(/[\\/]/).pop() ?? message.relativePath;
          postMessage({ type: 'fileAttachment', name, relativePath: message.relativePath, content });
        } catch {
          postMessage({ type: 'fileAttachment', name: '', relativePath: message.relativePath, content: '', error: 'Could not read file' });
        }
        break;
      }
    }
  }

  private async handleSendMessage(
    content: string,
    images: string[],
    model: string,
    postMessage: (msg: ExtensionMessage) => void
  ): Promise<void> {
    let activeModel = model;
    const context = await this.contextBuilder.buildEnrichedContext();
    const capabilities = this.contextBuilder.getCapabilities();
    const contextPrompt = this.contextBuilder.formatEnrichedPrompt(context, capabilities);

    const customInstructions = this.contextBuilder.getCustomInstructions();
    const systemMessage: ChatMessage = {
      role: 'system',
      content: [
        'You are a helpful coding assistant integrated into VSCode. You have access to the user\'s current editor context.',
        customInstructions ? `\n\n## Project Instructions:\n${customInstructions}` : '',
        `\n\n${contextPrompt}`,
      ].join(''),
    };

    const skillSummaries = this.skillRegistry?.getSummaries() ?? [];
    if (skillSummaries.length > 0) {
      const activatedSkills = this.contextBuilder.getActivatedSkills();
      // "Preferred" is a soft signal — the model still decides when to call use_skill.
      // This is intentional pull-only behaviour: no automatic injection, just a hint.
      const activatedNote = activatedSkills.length > 0
        ? `\n\n**Project-activated skills** (preferred for this workspace): ${activatedSkills.join(', ')}`
        : '';
      const advertisement = `\n\n## Available Skills\nThe following skills are available. Use the \`use_skill\` tool when relevant.${activatedNote}\n\n${skillSummaries.map((s) => `- **${s.name}**: ${s.description}`).join('\n')}`;
      systemMessage.content += advertisement;
    }

    // Handle @codebase semantic search
    let processedContent = content;
    if (content.startsWith('@codebase') && this.indexer) {
      const query = content.slice('@codebase'.length).trim();
      processedContent = query || content; // strip @codebase prefix; fall back to original if no query
      if (query) {
        try {
          const results = await this.indexer.searchAsync(query, 8);
          if (results.length > 0) {
            const MAX_CONTEXT_CHARS = 40_000;
            let used = 0;
            const parts: string[] = [];
            for (const r of results) {
              const entry = `${r.filePath}:${r.startLine}-${r.endLine}\n\`\`\`\n${r.content}\n\`\`\``;
              if (used + entry.length > MAX_CONTEXT_CHARS) break;
              parts.push(entry);
              used += entry.length;
            }
            if (parts.length > 0) {
              systemMessage.content += `\n\n<codebase-context query="${query}">\n${parts.join('\n\n')}\n</codebase-context>`;
            }
          }
        } catch {
          // Non-fatal — send message without codebase context
        }
      }
    }

    const baseContent = processedContent;
    const userContent = images.length > 0
      ? [
          { type: 'text' as const, text: baseContent },
          ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
        ]
      : baseContent;
    this.conversationMessages.push({ role: 'user', content: userContent });
    this.abortController = new AbortController();

    const skillTools    = this.skillRegistry      ? [USE_SKILL_TOOL_DEFINITION]       : [];
    const editorTools   = this.toolExecutor        ? TOOL_DEFINITIONS                  : [];
    const mcpTools      = this.mcpClientManager?.getTools() ?? [];
    const worktreeTools = [START_WORKTREE_TOOL_DEFINITION];
    const allTools      = [...editorTools, ...skillTools, ...mcpTools, ...worktreeTools];
    const tools         = allTools.length > 0 ? allTools : undefined;

    try {
      const MAX_TOOL_ITERATIONS = 15;
      let completed = false;

      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        let fullContent = '';
        const toolCallAccumulator = new Map<number, { id: string; name: string; arguments: string }>();
        let finishReason: string | null = null;
        let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;

        // On the last iteration, strip tools so the model is forced to produce a text response
        const isLastIteration = iteration === MAX_TOOL_ITERATIONS - 1;

        const stream = this.client.chatStream(
          {
            model: activeModel,
            messages: [systemMessage, ...this.conversationMessages],
            temperature: this.settings.temperature,
            max_tokens: this.settings.maxTokens,
            stream: true,
            tools: isLastIteration ? undefined : tools,
          },
          this.abortController.signal
        );

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;
          if (delta?.content) {
            fullContent += delta.content;
            postMessage({ type: 'streamChunk', content: delta.content });
          }
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (!toolCallAccumulator.has(tc.index)) {
                toolCallAccumulator.set(tc.index, { id: tc.id ?? '', name: tc.function?.name ?? '', arguments: '' });
              }
              const acc = toolCallAccumulator.get(tc.index)!;
              if (tc.id) acc.id = tc.id;
              if (tc.function?.name) acc.name = tc.function.name;
              if (tc.function?.arguments) acc.arguments += tc.function.arguments;
            }
          }
          finishReason = chunk.choices[0]?.finish_reason ?? finishReason;
          if (chunk.usage) usage = chunk.usage;
        }

        if (usage) {
          const pricing = this.modelPricing.get(activeModel);
          const promptCost = pricing ? usage.prompt_tokens * parseFloat(pricing.prompt) : 0;
          const completionCost = pricing ? usage.completion_tokens * parseFloat(pricing.completion) : 0;
          const lastMessageCost = promptCost + completionCost;
          this.sessionCost += lastMessageCost;

          let creditsUsed = 0;
          let creditsLimit: number | null = null;
          try {
            const balance = await this.client.getAccountBalance();
            creditsUsed = balance.usage;
            creditsLimit = balance.limit;
          } catch { /* non-fatal */ }

          postMessage({
            type: 'usageUpdate',
            lastMessageCost,
            lastMessageTokens: usage.total_tokens,
            sessionCost: this.sessionCost,
            creditsUsed,
            creditsLimit,
          });

          if (creditsLimit !== null && creditsUsed >= creditsLimit) {
            postMessage({ type: 'noCredits' });
          }
        }

        if (finishReason === 'tool_calls' && toolCallAccumulator.size > 0 && (this.toolExecutor || this.skillRegistry || this.mcpClientManager)) {
          const toolCalls: ToolCall[] = Array.from(toolCallAccumulator.values()).map((tc, i) => ({
            id: tc.id || `call_${i}`,
            type: 'function' as const,
            function: { name: tc.name, arguments: tc.arguments },
          }));

          this.conversationMessages.push({ role: 'assistant', content: fullContent, tool_calls: toolCalls });

          for (const tc of toolCalls) {
            let args: Record<string, unknown> = {};
            let parseError: string | undefined;
            try { args = JSON.parse(tc.function.arguments); } catch { parseError = `Failed to parse tool arguments: ${tc.function.arguments}`; }
            if (parseError) {
              this.conversationMessages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: `Error: ${parseError}`,
              });
              continue;
            }
            if (tc.function.name === 'start_worktree') {
              const convId = this.currentConversation?.id ?? Date.now().toString();
              if (!this._worktreeManager) {
                this.conversationMessages.push({ role: 'tool', tool_call_id: tc.id, content: 'Worktree not available (no workspace folder open).' });
              } else {
                try {
                  await this._worktreeManager.create(convId);
                  this.conversationMessages.push({ role: 'tool', tool_call_id: tc.id, content: 'Worktree created.' });
                } catch (e: any) {
                  this.conversationMessages.push({ role: 'tool', tool_call_id: tc.id, content: `Worktree creation failed: ${e.message}` });
                }
              }
              continue;
            }
            if (tc.function.name === 'use_skill') {
              const skillName = (args.name as string) ?? '';
              const skill = this.skillRegistry?.get(skillName);
              this.conversationMessages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: skill ? skill.content : `Skill not found: ${skillName}`,
              });
              continue;
            }
            // Remap uri to worktree if active
            if (this._worktreeManager?.state === 'active' && typeof args['uri'] === 'string') {
              args = { ...args, uri: this._worktreeManager.remapUri(args['uri'] as string) };
            }
            if (tc.function.name.startsWith('mcp__') && this.mcpClientManager) {
              if (!this._autonomousMode) {
                const { approved } = await this.requestToolApproval(tc.function.name, args, postMessage);
                if (!approved) {
                  this.conversationMessages.push({
                    role: 'tool',
                    tool_call_id: tc.id,
                    content: 'User denied this action.',
                  });
                  continue;
                }
              }
              const mcpResult = await this.mcpClientManager.callTool(tc.function.name, args);
              this.conversationMessages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: this.truncateToolOutput(mcpResult.content),
              });
              continue;
            }
            if (!this.toolExecutor) {
              this.conversationMessages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: `Error: No tool executor available`,
              });
              continue;
            }
            if (!this._autonomousMode && MessageHandler.GATED_TOOLS.has(tc.function.name)) {
              const diff = await this.computeToolDiff(tc.function.name, args);
              const { approved } = await this.requestToolApproval(tc.function.name, args, postMessage, diff);
              if (!approved) {
                this.conversationMessages.push({
                  role: 'tool',
                  tool_call_id: tc.id,
                  content: 'User denied this action.',
                });
                continue;
              }
            }
            if (!this._autonomousMode && MessageHandler.APPROVAL_GATED_TOOLS.has(tc.function.name)) {
              const alreadyApproved = await this.approvalManager.isApproved(tc.function.name);
              if (!alreadyApproved) {
                const currentModelForApproval = tc.function.name === 'use_model' ? activeModel : undefined;
                const { approved, scope } = await this.requestToolApproval(tc.function.name, args, postMessage, undefined, currentModelForApproval);
                if (!approved) {
                  this.conversationMessages.push({
                    role: 'tool',
                    tool_call_id: tc.id,
                    content: 'User denied this action.',
                  });
                  continue;
                }
                if (scope === 'workspace') {
                  await this.approvalManager.approveForWorkspace(tc.function.name);
                } else if (scope === 'global') {
                  await this.approvalManager.approveGlobally(tc.function.name);
                }
                if (scope === 'once') {
                  this.approvalManager.approveForSession(tc.function.name);
                }
              }
            }
            if (tc.function.name === 'use_model') {
              const newModelId = ((args as Record<string, unknown>).model_id as string | undefined)?.trim();
              if (!newModelId) {
                this.conversationMessages.push({
                  role: 'tool',
                  tool_call_id: tc.id,
                  content: 'Error: model_id must be a non-empty string.',
                });
                continue;
              }
              activeModel = newModelId;
              const result = await this.toolExecutor.execute(tc.function.name, args);
              this.conversationMessages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: this.truncateToolOutput(
                  result.success ? (result.message ?? 'Done') : `Error: ${result.error}`
                ),
              });
              postMessage({ type: 'modelChanged', modelId: newModelId });
              continue;
            }
            const result = await this.toolExecutor.execute(tc.function.name, args);
            this.conversationMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: this.truncateToolOutput(
                result.success ? (result.message ?? 'Done') : `Error: ${result.error}`
              ),
            });
          }
          continue;
        }

        // finish_reason === 'stop' — final response
        this.conversationMessages.push({ role: 'assistant', content: fullContent });
        completed = true;
        break;
      }

      if (!completed) {
        // Should not be reachable — last iteration always has tools stripped, forcing finish_reason: stop
        postMessage({ type: 'streamEnd' });
        return;
      }

      // Persist — save only user/assistant messages (filter out tool messages)
      if (this.history) {
        const savable = this.conversationMessages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ role: m.role, content: m.content })) as ChatMessage[];

        if (!this.currentConversation) {
          this.currentConversation = await this.history.create(activeModel);
        }
        this.currentConversation.messages = savable;
        await this.history.save(this.currentConversation);
        postMessage({ type: 'conversationSaved', id: this.currentConversation.id, title: this.currentConversation.title });

        if (savable.length === 2) {
          this.autoTitle(this.currentConversation, postMessage);
        }
      }

      postMessage({ type: 'streamEnd' });
      this.onStreamEnd?.();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        postMessage({ type: 'streamEnd' });
      } else if (error instanceof OpenRouterError) {
        await this.handleApiError(error, postMessage);
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await this.notifications.handleError(errorMessage);
        postMessage({ type: 'streamError', error: errorMessage });
      }
    } finally {
      this.abortController = undefined;
    }
  }

  abort(): void {
    this.abortController?.abort();
    for (const resolve of this.pendingApprovals.values()) {
      resolve({ approved: false, scope: 'once' });
    }
    this.pendingApprovals.clear();
  }

  private handleCancel(): void {
    this.abort();
  }

  private async handleApiError(error: OpenRouterError, postMessage: (msg: ExtensionMessage) => void): Promise<void> {
    switch (error.code) {
      case 401:
        this.onAuthInvalid?.();
        postMessage({ type: 'streamError', error: 'Authentication failed — please sign in again.' });
        break;
      case 402:
        postMessage({ type: 'noCredits' });
        postMessage({ type: 'streamError', error: 'Insufficient credits. Please top up your OpenRouter balance.' });
        break;
      case 400:
        postMessage({ type: 'streamError', error: `Bad request: ${error.message}` });
        break;
      case 403: {
        const reasons = (error.metadata as { reasons?: string[] } | undefined)?.reasons;
        const detail = reasons?.length ? ` Reason: ${reasons.join(', ')}.` : '';
        postMessage({ type: 'streamError', error: `Content flagged by moderation policy.${detail}` });
        break;
      }
      case 408:
        postMessage({ type: 'streamError', error: 'Request timed out. Please try again.' });
        break;
      case 429:
        postMessage({ type: 'streamError', error: 'Rate limit reached. Please wait a moment and try again.' });
        break;
      case 502:
        postMessage({ type: 'streamError', error: 'The model is temporarily unavailable. Try switching to a different model.' });
        break;
      case 503:
        postMessage({ type: 'streamError', error: 'No provider available for this model right now. Try a different model or try again later.' });
        break;
      default:
        await this.notifications.handleError(error.message);
        postMessage({ type: 'streamError', error: error.message });
    }
  }

  private async handleGetModels(postMessage: (msg: ExtensionMessage) => void): Promise<void> {
    try {
      const models = await this.client.listModels();
      this.setModelPricing(models);
      postMessage({ type: 'modelsLoaded', models });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch models';
      postMessage({ type: 'streamError', error: errorMessage });
      this.notifications.handleError(errorMessage);
    }
  }

  private async handleListConversations(postMessage: (msg: ExtensionMessage) => void): Promise<void> {
    if (!this.history) return;
    const conversations = await this.history.list();
    postMessage({ type: 'conversationList', conversations });
  }

  private async handleLoadConversation(id: string, postMessage: (msg: ExtensionMessage) => void): Promise<void> {
    if (!this.history) return;
    try {
      const conversation = await this.history.load(id);
      if (conversation) {
        this.currentConversation = conversation;
        this.conversationMessages = [...conversation.messages];
        postMessage({ type: 'conversationLoaded', conversation });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load conversation';
      postMessage({ type: 'streamError', error: errorMessage });
    }
  }

  private async handleDeleteConversation(id: string, postMessage: (msg: ExtensionMessage) => void): Promise<void> {
    if (!this.history) return;
    try {
      await this.history.delete(id);
      if (this.currentConversation?.id === id) {
        this.currentConversation = undefined;
        this.conversationMessages = [];
      }
      await this.handleListConversations(postMessage);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete conversation';
      postMessage({ type: 'streamError', error: errorMessage });
    }
  }

  private async handleExportConversation(id: string, format: 'json' | 'markdown', _postMessage: (msg: ExtensionMessage) => void): Promise<void> {
    if (!this.history) return;
    try {
      const content = format === 'json'
        ? await this.history.exportAsJson(id)
        : await this.history.exportAsMarkdown(id);

      if (content) {
        const doc = await vscode.workspace.openTextDocument({ content, language: format === 'json' ? 'json' : 'markdown' });
        await vscode.window.showTextDocument(doc);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to export conversation';
      _postMessage({ type: 'streamError', error: errorMessage });
    }
  }

  private async autoTitle(conversation: Conversation, postMessage: (msg: ExtensionMessage) => void): Promise<void> {
    try {
      const response = await this.client.chat({
        model: conversation.model,
        messages: [
          { role: 'system', content: 'Generate a short title (3-6 words) for this conversation. Output only the title, nothing else.' },
          ...conversation.messages.slice(0, 2).map((m) => ({ ...m, content: messageText(m.content) })),
        ],
        temperature: 0.3,
        max_tokens: 20,
      });

      const title = messageText(response.choices[0]?.message?.content ?? '').trim();
      if (title && this.history) {
        conversation.title = title;
        await this.history.save(conversation);
        postMessage({ type: 'conversationTitled', id: conversation.id, title });
      }
    } catch {
      // Silently fail — title stays as default
    }
  }

  private async computeToolDiff(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<DiffLine[] | undefined> {
    if (toolName !== 'replace_range' && toolName !== 'insert_code') return undefined;

    try {
      const uri = args['uri'];
      if (typeof uri !== 'string') return undefined;

      const vsUri = vscode.Uri.parse(uri);
      const bytes = await vscode.workspace.fs.readFile(vsUri);
      const original = new TextDecoder().decode(bytes);
      const lines = original.split('\n');

      let modified: string;

      if (toolName === 'replace_range') {
        const startLine = args['startLine'] as number;
        const startChar = args['startCharacter'] as number;
        const endLine = args['endLine'] as number;
        const endChar = args['endCharacter'] as number;
        const code = args['code'] as string;

        if (
          typeof startLine !== 'number' || typeof startChar !== 'number' ||
          typeof endLine !== 'number' || typeof endChar !== 'number' ||
          typeof code !== 'string'
        ) return undefined;

        const beforeLines = lines.slice(0, startLine).join('\n');
        const afterLines = lines.slice(endLine + 1).join('\n');
        const startLineText = lines[startLine] ?? '';
        const endLineText = lines[endLine] ?? '';
        const prefix = startLineText.slice(0, startChar);
        const suffix = endLineText.slice(endChar);
        const middle = prefix + code + suffix;
        const parts: string[] = [];
        if (beforeLines) parts.push(beforeLines);
        parts.push(middle);
        if (afterLines) parts.push(afterLines);
        modified = parts.join('\n');
      } else {
        // insert_code
        const line = args['line'] as number;
        const character = args['character'] as number;
        const code = args['code'] as string;

        if (typeof line !== 'number' || typeof character !== 'number' || typeof code !== 'string') {
          return undefined;
        }

        const targetLine = lines[line] ?? '';
        const newLine = targetLine.slice(0, character) + code + targetLine.slice(character);
        const newLines = [...lines.slice(0, line), newLine, ...lines.slice(line + 1)];
        modified = newLines.join('\n');
      }

      const rawDiff = Diff.diffLines(original, modified);

      const CONTEXT = 3;
      const result: DiffLine[] = [];
      let contextBuf: string[] = [];

      for (const part of rawDiff) {
        const partLines = part.value.replace(/\n$/, '').split('\n');
        if (part.added) {
          const ctx = contextBuf.slice(-CONTEXT);
          for (const l of ctx) result.push({ type: 'context', content: l });
          contextBuf = [];
          for (const l of partLines) result.push({ type: 'added', content: l });
        } else if (part.removed) {
          const ctx = contextBuf.slice(-CONTEXT);
          for (const l of ctx) result.push({ type: 'context', content: l });
          contextBuf = [];
          for (const l of partLines) result.push({ type: 'removed', content: l });
        } else {
          if (result.length > 0) {
            const leading = partLines.slice(0, CONTEXT);
            for (const l of leading) result.push({ type: 'context', content: l });
            contextBuf = partLines.slice(CONTEXT);
          } else {
            contextBuf.push(...partLines);
          }
        }
      }

      return result.length > 0 ? result : undefined;
    } catch {
      return undefined;
    }
  }

  private requestToolApproval(
    toolName: string,
    args: Record<string, unknown>,
    postMessage: (msg: ExtensionMessage) => void,
    diff?: DiffLine[],
    currentModel?: string
  ): Promise<{ approved: boolean; scope: 'once' | 'workspace' | 'global' }> {
    const requestId = `approval-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve) => {
      this.pendingApprovals.set(requestId, resolve);
      postMessage({ type: 'toolApprovalRequest', requestId, toolName, args, diff, currentModel });
    });
  }

  private truncateToolOutput(content: string): string {
    const LIMIT = 8000;
    if (content.length <= LIMIT) return content;

    const tmpFile = path.join(os.tmpdir(), `openrouter-tool-${Date.now()}.txt`);
    try {
      fs.writeFileSync(tmpFile, content, 'utf8');
    } catch { /* best effort */ }

    return `${content.slice(0, LIMIT)}\n\n[Output truncated: ${content.length.toLocaleString()} chars. Showing first 8,000.\nFull result saved to: ${tmpFile}]`;
  }

  private async handleApplyToFile(
    code: string,
    language: string,
    filename: string | undefined,
    postMessage: (msg: ExtensionMessage) => void
  ): Promise<void> {
    let fileUri: vscode.Uri | undefined;

    if (filename) {
      const folders = vscode.workspace.workspaceFolders;
      if (folders && folders.length > 0) {
        const candidate = vscode.Uri.joinPath(folders[0].uri, filename);
        try {
          await vscode.workspace.fs.stat(candidate);
          fileUri = candidate;
        } catch {
          // file not found — fall through to picker
        }
      }
    }

    if (!fileUri) {
      const picked = await vscode.window.showOpenDialog({ canSelectMany: false, openLabel: 'Apply to this file' });
      if (!picked || picked.length === 0) return;
      fileUri = picked[0];
    }

    let originalContent = '';
    try {
      const bytes = await vscode.workspace.fs.readFile(fileUri);
      originalContent = new TextDecoder().decode(bytes);
    } catch { /* new file */ }

    const hunks = this.countHunks(originalContent, code);
    const uriStr = fileUri.toString();

    if (hunks <= 1) {
      const lines = this.computeDiffLines(originalContent, code);
      this.pendingApply.set(uriStr, code);
      postMessage({ type: 'showDiff', lines, filename: fileUri.fsPath, fileUri: uriStr });
    } else {
      await this.showNativeDiff(fileUri, originalContent, code, language);
    }
  }

  private countHunks(original: string, proposed: string): number {
    if (!original.trim()) return 0;
    const changes = Diff.diffLines(original, proposed);
    let hunks = 0;
    let inHunk = false;
    for (const part of changes) {
      if (part.added || part.removed) {
        if (!inHunk) { hunks++; inHunk = true; }
      } else {
        inHunk = false;
      }
    }
    return hunks;
  }

  private computeDiffLines(original: string, proposed: string): DiffLine[] {
    const changes = Diff.diffLines(original, proposed);
    const lines: DiffLine[] = [];
    for (const part of changes) {
      const type = part.added ? 'added' : part.removed ? 'removed' : 'context';
      const partLines = part.value.split('\n');
      if (partLines[partLines.length - 1] === '') partLines.pop();
      for (const line of partLines) {
        lines.push({ type, content: line });
      }
    }
    return lines;
  }

  private async showNativeDiff(
    fileUri: vscode.Uri,
    _originalContent: string,
    code: string,
    language: string
  ): Promise<void> {
    vscode.window.setStatusBarMessage('Lucent Code: Opening diff editor...', 3000);
    const proposedDoc = await vscode.workspace.openTextDocument({ content: code, language });
    const filename = fileUri.path.split('/').pop() ?? fileUri.fsPath;
    await vscode.commands.executeCommand('vscode.diff', fileUri, proposedDoc.uri, `Review changes: ${filename}`);
    const choice = await vscode.window.showInformationMessage(
      `Apply changes to ${filename}?`,
      'Apply',
      'Discard'
    );
    if (choice === 'Apply') {
      await this.applyEdit(fileUri, code);
    }
  }

  private async handleConfirmApply(fileUri: string): Promise<void> {
    const code = this.pendingApply.get(fileUri);
    if (!code) return;
    this.pendingApply.delete(fileUri);
    await this.applyEdit(vscode.Uri.parse(fileUri), code);
  }

  private async applyEdit(fileUri: vscode.Uri, code: string): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    try {
      const doc = await vscode.workspace.openTextDocument(fileUri);
      const fullRange = new vscode.Range(
        new vscode.Position(0, 0),
        new vscode.Position(doc.lineCount, 0) // intentional: VSCode clamps to end of document
      );
      edit.replace(fileUri, fullRange, code);
    } catch {
      edit.createFile(fileUri, { overwrite: true });
      edit.insert(fileUri, new vscode.Position(0, 0), code);
    }
    await vscode.workspace.applyEdit(edit);
    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc);
  }
}
