import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import type { ExtensionMessage } from '../shared/types';

export type WorktreeState = 'idle' | 'creating' | 'active' | 'finishing';
export type Runner = (cmd: string, cwd?: string) => Promise<string>;

export class WorktreeManager {
  private _state: WorktreeState = 'idle';
  private _worktreePath: string | undefined;
  private _branch: string | undefined;

  constructor(
    private readonly workspaceRoot: string,
    private readonly postMessage: (msg: ExtensionMessage) => void,
    private readonly runner: Runner = defaultRunner
  ) {}

  get state(): WorktreeState {
    return this._state;
  }

  get worktreePath(): string | undefined {
    return this._worktreePath;
  }

  async create(conversationId: string): Promise<void> {
    if (this._state !== 'idle') return;

    this._state = 'creating';
    this._postStatus();

    const branch = `lucent/${conversationId}`;
    const worktreePath = path.join(this.workspaceRoot, '.worktrees', `lucent-${conversationId}`);

    try {
      await this._ensureGitignore();
      await this.runner(
        `git worktree add "${worktreePath}" -b "${branch}"`,
        this.workspaceRoot
      );
      this._worktreePath = worktreePath;
      this._branch = branch;
      this._state = 'active';
      this._postStatus();
    } catch (e) {
      this._state = 'idle';
      this._postStatus();
      throw e;
    }
  }

  remapUri(uri: string): string {
    if (!this._worktreePath) return uri;
    const prefix = vscode.Uri.file(this.workspaceRoot).toString();
    if (!uri.startsWith(prefix)) return uri;
    const rel = uri.slice(prefix.length).replace(/\\/g, '/');
    const joined = path.join(this._worktreePath, rel).replace(/\\/g, '/');
    return vscode.Uri.file(joined).toString();
  }

  private _postStatus(): void {
    this.postMessage({ type: 'worktreeStatus', status: this._state, branch: this._branch });
  }

  private async _ensureGitignore(): Promise<void> {
    const gitignorePath = path.join(this.workspaceRoot, '.gitignore');
    try {
      const content = await fs.promises.readFile(gitignorePath, 'utf8');
      if (!content.includes('.worktrees')) {
        await fs.promises.appendFile(gitignorePath, '\n.worktrees/\n');
      }
    } catch {
      await fs.promises.writeFile(gitignorePath, '.worktrees/\n');
    }
  }
}

async function defaultRunner(cmd: string, cwd?: string): Promise<string> {
  const { exec } = await import('child_process');
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}
