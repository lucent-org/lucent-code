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

  get completionsModel(): string {
    return this.config.get<string>('completions.model', '');
  }

  get completionsTriggerMode(): 'auto' | 'manual' {
    return this.config.get<string>('completions.triggerMode', 'auto') as 'auto' | 'manual';
  }

  get completionsDebounceMs(): number {
    return this.config.get<number>('completions.debounceMs', 300);
  }

  get completionsMaxContextLines(): number {
    return this.config.get<number>('completions.maxContextLines', 100);
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
