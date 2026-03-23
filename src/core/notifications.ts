import * as vscode from 'vscode';

export class NotificationService {
  async handleError(errorMessage: string): Promise<void> {
    const lower = errorMessage.toLowerCase();

    if (lower.includes('api key') || lower.includes('no api key')) {
      const action = await vscode.window.showInformationMessage(
        'Lucent Code: No API key found. Sign in with OpenRouter to get started.',
        'Sign in with OpenRouter',
        'Enter API Key manually'
      );
      if (action === 'Sign in with OpenRouter') {
        vscode.commands.executeCommand('lucentCode.authMenu');
      } else if (action === 'Enter API Key manually') {
        vscode.commands.executeCommand('lucentCode.setApiKey');
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
        vscode.commands.executeCommand('lucentCode.setApiKey');
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
