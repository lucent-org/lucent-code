import * as vscode from 'vscode';
import type { ExtensionMessage, WebviewMessage, ChatMessage, Conversation, ToolCall } from '../shared/types';
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
      case 'ready':
        await this.handleGetModels(postMessage);
        const context = this.contextBuilder.buildContext();
        postMessage({ type: 'contextUpdate', context });
        break;
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
            const result = await this.toolExecutor.execute(tc.function.name, args);
            this.conversationMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: result.success ? (result.message ?? 'Done') : `Error: ${result.error}`,
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

  private handleCancel(): void {
    this.abortController?.abort();
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
}
