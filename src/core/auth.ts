import * as vscode from 'vscode';

const SECRET_KEY = 'lucentCode.apiKey';

export class AuthManager {
  private readonly onDidChangeAuthEmitter = new vscode.EventEmitter<boolean>();
  public readonly onDidChangeAuth = this.onDidChangeAuthEmitter.event;
  private pendingOAuth?: { state: string; codeVerifier: string };

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

  private static readonly TAVILY_KEY = 'lucentCode.tavilyApiKey';

  async getTavilyApiKey(): Promise<string | undefined> {
    return this.secretStorage.get(AuthManager.TAVILY_KEY);
  }

  async setTavilyApiKey(key: string): Promise<void> {
    await this.secretStorage.store(AuthManager.TAVILY_KEY, key);
    vscode.window.showInformationMessage('Tavily API key saved.');
  }

  async promptForTavilyApiKey(): Promise<void> {
    const key = await vscode.window.showInputBox({
      prompt: 'Enter your Tavily API key for premium web search',
      placeHolder: 'tvly-...',
      password: true,
      ignoreFocusOut: true,
    });
    if (key) await this.setTavilyApiKey(key);
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

  async isAuthenticated(): Promise<boolean> {
    return !!(await this.getApiKey());
  }

  async signOut(): Promise<void> {
    const key = await this.getApiKey();
    if (!key) return;

    // Best-effort server-side revocation — don't block or throw on failure
    try {
      await fetch('https://openrouter.ai/api/v1/auth/key', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${key}` },
      });
    } catch { /* ignore network errors */ }

    await this.clearApiKey();
  }

  async startOAuth(): Promise<void> {
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);
    const state = this.generateState();

    // Persist for callback verification
    this.pendingOAuth = { state, codeVerifier };

    const callbackUri = await vscode.env.asExternalUri(
      vscode.Uri.parse('vscode://lucent-code/oauth-callback')
    );

    const params = new URLSearchParams({
      callback_url: callbackUri.toString(),
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    });

    const authUrl = `https://openrouter.ai/auth?${params.toString()}`;
    await vscode.env.openExternal(vscode.Uri.parse(authUrl));
  }

  async handleOAuthCallback(uri: vscode.Uri): Promise<void> {
    const params = new URLSearchParams(uri.query);
    const code = params.get('code');
    const state = params.get('state');

    if (!this.pendingOAuth || state !== this.pendingOAuth.state) {
      vscode.window.showErrorMessage('OpenRouter: OAuth state mismatch. Please try again.');
      this.pendingOAuth = undefined;
      return;
    }

    if (!code) {
      vscode.window.showErrorMessage('OpenRouter: No authorization code received.');
      this.pendingOAuth = undefined;
      return;
    }

    try {
      // Exchange code for API key
      const response = await fetch('https://openrouter.ai/api/v1/auth/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          code_verifier: this.pendingOAuth.codeVerifier,
        }),
      });

      if (!response.ok) {
        throw new Error(`Token exchange failed (${response.status})`);
      }

      const data = (await response.json()) as { key?: string };
      const apiKey = data.key;

      if (apiKey) {
        await this.setApiKey(apiKey);
        vscode.window.showInformationMessage('OpenRouter: Signed in successfully.');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`OpenRouter: OAuth failed — ${msg}`);
    } finally {
      this.pendingOAuth = undefined;
    }
  }

  private async generateCodeChallenge(verifier: string): Promise<string> {
    // Use Web Crypto API (available in Node 18+)
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await globalThis.crypto.subtle.digest('SHA-256', data);
    // Base64URL encode
    const base64 = Buffer.from(hash).toString('base64');
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
