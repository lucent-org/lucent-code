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

  async startOAuth(): Promise<string | undefined> {
    const callbackUri = await vscode.env.asExternalUri(
      vscode.Uri.parse('vscode://openrouter-chat/oauth-callback')
    );

    const codeVerifier = this.generateCodeVerifier();
    const state = this.generateState();

    const authUrl = `https://openrouter.ai/auth?callback_url=${encodeURIComponent(callbackUri.toString())}&code_challenge=${codeVerifier}&state=${state}`;

    await vscode.env.openExternal(vscode.Uri.parse(authUrl));
    return state;
  }

  private generateCodeVerifier(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let result = '';
    for (let i = 0; i < 64; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private generateState(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  dispose(): void {
    this.onDidChangeAuthEmitter.dispose();
  }
}
