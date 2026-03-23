import * as vscode from 'vscode';
import * as Diff from 'diff';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import type { ExtensionMessage, WebviewMessage, ChatMessage, Conversation, ToolCall, DiffLine } from '../shared/types';
import { messageText } from '../core/message-text';
import { OpenRouterClient } from '../core/openrouter-client';
import { ContextBuilder } from '../core/context-builder';
import { Settings } from '../core/settings';
import { EditorToolExecutor, TOOL_DEFINITIONS, USE_SKILL_TOOL_DEFINITION, START_WORKTREE_TOOL_DEFINITION } from '../lsp/editor-tools';
import { WorktreeManager } from '../core/worktree-manager';
import { ConversationHistory } from './history';
import { NotificationService } from '../core/notifications';
import { TerminalBuffer } from '../core/terminal-buffer';
import { SkillRegistry } from '../skills/skill-registry';
import { SkillMatcher } from '../skills/skill-matcher';
import type { McpClientManager } from '../mcp/mcp-client-manager';
import type { Indexer } from '../search/indexer';

export class MessageHandler {
  private conversationMessages: ChatMessage[] = [];
  private abortController?: AbortController;
  private currentConversation?: Conversation;
  private pendingApply = new Map<string, string>(); // fileUri string → proposed code

  onStreamEnd?: () => void;

  private readonly pendingApprovals = new Map<string, (approved: boolean) => void>();
  private readonly skillMatcher = new SkillMatcher();
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
          resolve(message.approved);
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
    }
  }

  private async handleSendMessage(
    content: string,
    images: string[],
    model: string,
    postMessage: (msg: ExtensionMessage) => void
  ): Promise<void> {
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
      const advertisement = `\n\n## Available Skills\nThe following skills are available. Use the \`use_skill\` tool when a skill is relevant.\n\n${skillSummaries.map((s) => `- ${s.name}: ${s.description}`).join('\n')}`;
      systemMessage.content += advertisement;
    }

    // Handle @codebase semantic search
    let processedContent = content;
    if (content.startsWith('@codebase') && this.indexer) {
      const query = content.slice('@codebase'.length).trim();
      processedContent = query || content; // strip @codebase prefix; fall back to original if no query
      if (query) {
        try {
          const results = await this.indexer.searchAsync(query, 10);
          if (results.length > 0) {
            const contextBlock = results
              .map((r) => `${r.filePath}:${r.startLine}-${r.endLine}\n\`\`\`\n${r.content}\n\`\`\``)
              .join('\n\n');
            systemMessage.content += `\n\n<codebase-context query="${query}">\n${contextBlock}\n</codebase-context>`;
          }
        } catch {
          // Non-fatal — send message without codebase context
        }
      }
    }

    const skillMatches = this.skillRegistry
      ? this.skillMatcher.match(content, this.skillRegistry.getSummaries())
      : [];
    const skillBlocks = skillMatches
      .map((name) => this.skillRegistry!.get(name))
      .filter((s): s is NonNullable<typeof s> => s !== undefined)
      .map((s) => `<skill name="${s.name}">\n${s.content}\n</skill>`)
      .join('\n\n');

    const baseContent = skillBlocks ? `${skillBlocks}\n\n${processedContent}` : processedContent;
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
      const MAX_TOOL_ITERATIONS = 5;
      let completed = false;

      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        let fullContent = '';
        const toolCallAccumulator = new Map<number, { id: string; name: string; arguments: string }>();
        let finishReason: string | null = null;
        let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;

        const stream = this.client.chatStream(
          {
            model,
            messages: [systemMessage, ...this.conversationMessages],
            temperature: this.settings.temperature,
            max_tokens: this.settings.maxTokens,
            stream: true,
            tools,
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
          const pricing = this.modelPricing.get(model);
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
                const approved = await this.requestToolApproval(tc.function.name, args, postMessage);
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
              const approved = await this.requestToolApproval(tc.function.name, args, postMessage, diff);
              if (!approved) {
                this.conversationMessages.push({
                  role: 'tool',
                  tool_call_id: tc.id,
                  content: 'User denied this action.',
                });
                continue;
              }
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
        postMessage({ type: 'streamError', error: 'Tool execution loop exceeded maximum iterations' });
        return;
      }

      // Persist — save only user/assistant messages (filter out tool messages)
      if (this.history) {
        const savable = this.conversationMessages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ role: m.role, content: m.content })) as ChatMessage[];

        if (!this.currentConversation) {
          this.currentConversation = await this.history.create(model);
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
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (errorMessage.includes('402') || errorMessage.toLowerCase().includes('insufficient credits')) {
          postMessage({ type: 'noCredits' });
          postMessage({ type: 'streamEnd' });
        } else {
          await this.notifications.handleError(errorMessage);
          postMessage({ type: 'streamError', error: errorMessage });
        }
      }
    } finally {
      this.abortController = undefined;
    }
  }

  abort(): void {
    this.abortController?.abort();
    for (const resolve of this.pendingApprovals.values()) {
      resolve(false);
    }
    this.pendingApprovals.clear();
  }

  private handleCancel(): void {
    this.abort();
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
    diff?: DiffLine[]
  ): Promise<boolean> {
    const requestId = `approval-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve) => {
      this.pendingApprovals.set(requestId, resolve);
      postMessage({ type: 'toolApprovalRequest', requestId, toolName, args, diff });
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
