import * as vscode from 'vscode';
import { OpenRouterClient } from '../core/openrouter-client';
import { Settings } from '../core/settings';
import { TriggerConfig } from './trigger-config';
import { buildCompletionPrompt } from './prompt-builder';

export class InlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  private readonly triggerConfig = new TriggerConfig();
  private readonly statusBarItem: vscode.StatusBarItem;

  constructor(
    private readonly client: OpenRouterClient,
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
      const response = await this.client.chat({
        model,
        messages: prompt.messages,
        temperature: 0.2,
        max_tokens: 256,
      });

      if (token.isCancellationRequested) {
        this.statusBarItem.text = '$(sparkle) OpenRouter';
        return emptyResult;
      }

      const completionText = response.choices[0]?.message?.content?.trim();
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
