import * as vscode from 'vscode';

export class NotificationService {
  async handleError(errorMessage: string): Promise<void> {
    const lower = errorMessage.toLowerCase();

    if (lower.includes('api key') || lower.includes('no api key')) {
      const action = await vscode.window.showErrorMessage(
        'OpenRouter: API key not configured. Set your API key to get started.',
        'Set API Key'
      );
      if (action === 'Set API Key') {
        vscode.commands.executeCommand('openRouterChat.setApiKey');
      }
    } else if (lower.includes('429') || lower.includes('rate limit')) {
      vscode.window.showWarningMessage(
        'OpenRouter: Rate limited. Please wait a moment and try again.'
      );
    } else if (lower.includes('401') || lower.includes('unauthorized')) {
      const action = await vscode.window.showErrorMessage(
        'OpenRouter: Invalid API key. Please check your API key.',
        'Update API Key'
      );
      if (action === 'Update API Key') {
        vscode.commands.executeCommand('openRouterChat.setApiKey');
      }
    } else if (lower.includes('fetch failed') || lower.includes('network') || lower.includes('econnrefused')) {
      vscode.window.showErrorMessage(
        'OpenRouter: Could not connect. Please check your network connection.',
        'Retry'
      );
    } else {
      vscode.window.showErrorMessage(`OpenRouter: ${errorMessage}`);
    }
  }
}
