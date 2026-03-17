import * as vscode from 'vscode';
import * as Diff from 'diff';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import type { ExtensionMessage, WebviewMessage, ChatMessage, Conversation, ToolCall, DiffLine } from '../shared/types';
import { OpenRouterClient } from '../core/openrouter-client';
import { ContextBuilder } from '../core/context-builder';
import { Settings } from '../core/settings';
import { EditorToolExecutor, TOOL_DEFINITIONS } from '../lsp/editor-tools';
import { ConversationHistory } from './history';
import { NotificationService } from '../core/notifications';

export class MessageHandler {
  private conversationMessages: ChatMessage[] = [];
  private abortController?: AbortController;
  private currentConversation?: Conversation;
  private pendingApply = new Map<string, string>(); // fileUri string → proposed code

  onStreamEnd?: () => void;

  private readonly pendingApprovals = new Map<string, (approved: boolean) => void>();

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
    private readonly notifications: NotificationService = new NotificationService()
  ) {}

  async handleMessage(message: WebviewMessage, postMessage: (msg: ExtensionMessage) => void): Promise<void> {
    switch (message.type) {
      case 'sendMessage':
        await this.handleSendMessage(message.content, message.model, postMessage);
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
    }
  }

  private async handleSendMessage(
    content: string,
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

    this.conversationMessages.push({ role: 'user', content });
    this.abortController = new AbortController();

    const tools = this.toolExecutor ? TOOL_DEFINITIONS : undefined;

    try {
      const MAX_TOOL_ITERATIONS = 5;
      let completed = false;

      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        let fullContent = '';
        const toolCallAccumulator = new Map<number, { id: string; name: string; arguments: string }>();
        let finishReason: string | null = null;

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
        }

        if (finishReason === 'tool_calls' && toolCallAccumulator.size > 0 && this.toolExecutor) {
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
            if (MessageHandler.GATED_TOOLS.has(tc.function.name)) {
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
        postMessage({ type: 'streamError', error: errorMessage });
        this.notifications.handleError(errorMessage);
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
          ...conversation.messages.slice(0, 2),
        ],
        temperature: 0.3,
        max_tokens: 20,
      });

      const title = response.choices[0]?.message?.content?.trim();
      if (title && this.history) {
        conversation.title = title;
        await this.history.save(conversation);
        postMessage({ type: 'conversationTitled', id: conversation.id, title });
      }
    } catch {
      // Silently fail — title stays as default
    }
  }

  private requestToolApproval(
    toolName: string,
    args: Record<string, unknown>,
    postMessage: (msg: ExtensionMessage) => void
  ): Promise<boolean> {
    const requestId = `approval-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve) => {
      this.pendingApprovals.set(requestId, resolve);
      postMessage({ type: 'toolApprovalRequest', requestId, toolName, args });
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
    vscode.window.setStatusBarMessage('OpenRouter Chat: Opening diff editor...', 3000);
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
