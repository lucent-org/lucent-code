import * as vscode from 'vscode';

const SECTION = 'openRouterChat';

export class Settings {
  private get config() {
    return vscode.workspace.getConfiguration(SECTION);
  }

  get chatModel(): string {
    return this.config.get<string>('chat.model', '');
  }

  get temperature(): number {
    return this.config.get<number>('chat.temperature', 0.7);
  }

  get maxTokens(): number {
    return this.config.get<number>('chat.maxTokens', 4096);
  }

  async setChatModel(modelId: string): Promise<void> {
    await this.config.update('chat.model', modelId, vscode.ConfigurationTarget.Global);
  }

  onDidChange(callback: () => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(SECTION)) {
        callback();
      }
    });
  }
}
