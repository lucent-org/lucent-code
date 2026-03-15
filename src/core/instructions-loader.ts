import * as vscode from 'vscode';

const FILENAMES = ['.openrouter-instructions.md', '.cursorrules'] as const;
const MAX_BYTES = 50 * 1024;

export class InstructionsLoader {
  private instructions: string | undefined;
  private watcher?: vscode.FileSystemWatcher;

  async load(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      this.instructions = undefined;
      return;
    }
    const root = folders[0].uri;

    for (const filename of FILENAMES) {
      const uri = vscode.Uri.joinPath(root, filename);
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        if (bytes.byteLength > MAX_BYTES) {
          vscode.window.showWarningMessage(
            `OpenRouter Chat: ${filename} exceeds 50 KB and will be ignored.`
          );
          continue;
        }
        this.instructions = new TextDecoder().decode(bytes);
        return;
      } catch {
        // file does not exist — try next
      }
    }
    this.instructions = undefined;
  }

  watch(): void {
    this.watcher?.dispose();
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return;
    const pattern = new vscode.RelativePattern(folder, `{${FILENAMES.join(',')}}`);
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const reload = () => this.load();
    this.watcher.onDidCreate(reload);
    this.watcher.onDidChange(reload);
    this.watcher.onDidDelete(reload);
  }

  getInstructions(): string | undefined {
    return this.instructions;
  }

  dispose(): void {
    this.watcher?.dispose();
    this.instructions = undefined;
  }
}
