import * as vscode from 'vscode';
import type { ILLMProvider } from '../providers/llm-provider';
import { Settings } from '../core/settings';
import { TriggerConfig } from './trigger-config';
import { buildCompletionPrompt } from './prompt-builder';
import { messageText } from '../core/message-text';

export class InlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  private readonly triggerConfig = new TriggerConfig();
  private readonly statusBarItem: vscode.StatusBarItem;

  constructor(
    private readonly client: ILLMProvider,
    private readonly settings: Settings
  ) {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBarItem.text = '$(sparkle) OpenRouter';
    this.statusBarItem.tooltip = 'OpenRouter Inline Completions';
    this.statusBarItem.show();
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionList> {
    const emptyResult = new vscode.InlineCompletionList([]);

    if (vscode.workspace.getConfiguration('editor').get<boolean>('inlineSuggest.enabled', true) === false) {
      return emptyResult;
    }

    const model = this.settings.completionsModel || this.settings.chatModel;
    if (!model) {
      return emptyResult;
    }

    const prompt = buildCompletionPrompt(
      document.getText(),
      position.line,
      position.character,
      document.languageId,
      this.settings.completionsMaxContextLines
    );

    this.triggerConfig.cancel();

    const triggerMode = this.settings.completionsTriggerMode;
    const debounceMs = this.settings.completionsDebounceMs;

    if (triggerMode === 'auto') {
      await new Promise<void>((resolve) => {
        this.triggerConfig.trigger(resolve, 'auto', debounceMs);
      });
    }

    if (token.isCancellationRequested) {
      return emptyResult;
    }

    this.statusBarItem.text = '$(loading~spin) OpenRouter';

    try {
      const stream = this.client.chatStream({
        model,
        messages: prompt.messages,
        temperature: 0.2,
        max_tokens: 256,
        stream: true,
      });

      let fullContent = '';
      for await (const chunk of stream) {
        if (token.isCancellationRequested) {
          this.statusBarItem.text = '$(sparkle) OpenRouter';
          return emptyResult;
        }
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) fullContent += delta;
      }

      if (token.isCancellationRequested) {
        this.statusBarItem.text = '$(sparkle) OpenRouter';
        return emptyResult;
      }

      const completionText = messageText(fullContent).trim();
      if (!completionText) {
        this.statusBarItem.text = '$(sparkle) OpenRouter';
        return emptyResult;
      }

      this.statusBarItem.text = '$(sparkle) OpenRouter';
      const item = new vscode.InlineCompletionItem(completionText);
      return new vscode.InlineCompletionList([item]);
    } catch {
      this.statusBarItem.text = '$(sparkle) OpenRouter';
      return emptyResult;
    }
  }

  dispose(): void {
    this.triggerConfig.dispose();
    this.statusBarItem.dispose();
  }
}
