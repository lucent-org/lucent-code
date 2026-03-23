import * as vscode from 'vscode';

const FILENAMES = ['LUCENT.md', '.clinerules', '.cursorrules', 'CLAUDE.md'] as const;
const MAX_BYTES = 50 * 1024;
const SKILL_REGEX = /@skill\(([^)]+)\)/gm;

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
        let match: RegExpExecArray | null;
        SKILL_REGEX.lastIndex = 0;
        while ((match = SKILL_REGEX.exec(raw)) !== null) {
          skills.push(match[1]);
        }
        this.activatedSkills = skills;
        // Strip lines that are solely a @skill() declaration (whole line)
        this.instructions = raw
          .split('\n')
          .filter(line => !/@skill\([^)]+\)/.test(line.trim()) || line.trim().replace(/@skill\([^)]+\)/g, '').trim() !== '')
          .join('\n')
          .trim();
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
