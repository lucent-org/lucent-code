import * as vscode from 'vscode';

const SECRET_KEY = 'openRouterChat.apiKey';

export class AuthManager {
  private readonly onDidChangeAuthEmitter = new vscode.EventEmitter<boolean>();
  public readonly onDidChangeAuth = this.onDidChangeAuthEmitter.event;

  constructor(private readonly secretStorage: vscode.SecretStorage) {}

  async getApiKey(): Promise<string | undefined> {
    return this.secretStorage.get(SECRET_KEY);
  }

  async setApiKey(key: string): Promise<void> {
    await this.secretStorage.store(SECRET_KEY, key);
    this.onDidChangeAuthEmitter.fire(true);
  }

  async clearApiKey(): Promise<void> {
    await this.secretStorage.delete(SECRET_KEY);
    this.onDidChangeAuthEmitter.fire(false);
  }

  async promptForApiKey(): Promise<string | undefined> {
    const key = await vscode.window.showInputBox({
      prompt: 'Enter your OpenRouter API key',
      placeHolder: 'sk-or-...',
      password: true,
      ignoreFocusOut: true,
    });

    if (key) {
      await this.setApiKey(key);
      vscode.window.showInformationMessage('OpenRouter API key saved.');
    }

    return key;
  }

  async ensureAuthenticated(): Promise<string | undefined> {
    const key = await this.getApiKey();
    if (key) {
      return key;
    }
    return this.promptForApiKey();
  }

  dispose(): void {
    this.onDidChangeAuthEmitter.dispose();
  }
}
