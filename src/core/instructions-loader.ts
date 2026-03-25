import * as vscode from 'vscode';

const FILENAMES = ['LUCENT.md', '.clinerules', '.cursorrules', 'CLAUDE.md'] as const;
const MAX_BYTES = 50 * 1024;
const SKILL_LINE_RE = /^@skill\(([^)]+)\)\s*$/gm;

export class InstructionsLoader {
  private instructions: string | undefined;
  private activatedSkills: string[] = [];
  private watcher?: vscode.FileSystemWatcher;

  async load(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      this.instructions = undefined;
      this.activatedSkills = [];
      return;
    }
    const root = folders[0].uri;

    for (const filename of FILENAMES) {
      const uri = vscode.Uri.joinPath(root, filename);
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        if (bytes.byteLength > MAX_BYTES) {
          vscode.window.showWarningMessage(
            `Lucent Code: ${filename} exceeds 50 KB and will be ignored.`
          );
          continue;
        }
        const raw = new TextDecoder().decode(bytes);
        const skills: string[] = [];
        const prose = raw.replace(SKILL_LINE_RE, (_, name: string) => {
          skills.push(name.trim());
          return '';
        }).replace(/\n{3,}/g, '\n\n').trim();
        this.activatedSkills = skills;
        this.instructions = prose || undefined;
        return;
      } catch {
        // file does not exist — try next
      }
    }
    this.instructions = undefined;
    this.activatedSkills = [];
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

  getActivatedSkills(): string[] {
    return this.activatedSkills;
  }

  dispose(): void {
    this.watcher?.dispose();
    this.instructions = undefined;
    this.activatedSkills = [];
  }
}
