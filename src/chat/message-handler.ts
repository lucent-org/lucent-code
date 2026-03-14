import * as vscode from 'vscode';
import type { ExtensionMessage, WebviewMessage, ChatMessage } from '../shared/types';
import { OpenRouterClient } from '../core/openrouter-client';
import { ContextBuilder } from '../core/context-builder';
import { Settings } from '../core/settings';

export class MessageHandler {
  private conversationMessages: ChatMessage[] = [];
  private abortController?: AbortController;

  constructor(
    private readonly client: OpenRouterClient,
    private readonly contextBuilder: ContextBuilder,
    private readonly settings: Settings
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
    const context = this.contextBuilder.buildContext();
    const contextPrompt = this.contextBuilder.formatForPrompt(context);

    const systemMessage: ChatMessage = {
      role: 'system',
      content: `You are a helpful coding assistant integrated into VSCode. You have access to the user's current editor context.\n\n${contextPrompt}`,
    };

    this.conversationMessages.push({ role: 'user', content });

    this.abortController = new AbortController();

    try {
      const stream = this.client.chatStream(
        {
          model,
          messages: [systemMessage, ...this.conversationMessages],
          temperature: this.settings.temperature,
          max_tokens: this.settings.maxTokens,
          stream: true,
        },
        this.abortController.signal
      );

      let fullContent = '';

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          fullContent += delta;
          postMessage({ type: 'streamChunk', content: delta });
        }
      }

      this.conversationMessages.push({ role: 'assistant', content: fullContent });
      postMessage({ type: 'streamEnd' });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        postMessage({ type: 'streamEnd' });
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        postMessage({ type: 'streamError', error: errorMessage });
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
    }
  }
}
