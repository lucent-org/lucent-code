import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import type { ExtensionMessage, WorktreeDiff } from '../shared/types';

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

    const branch = `lucent/${conversationId}`;
    this._state = 'creating';
    this._postStatus(branch);
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

  async finishSession(): Promise<void> {
    if (this._state !== 'active' || !this._worktreePath || !this._branch) return;

    this._state = 'finishing';
    this._postStatus();

    try {
      const diffStat = await this.runner(
        `git diff main...HEAD --shortstat`,
        this._worktreePath
      ).catch(() => '');

      if (!diffStat.trim()) {
        await this.runner(`git worktree remove "${this._worktreePath}"`, this.workspaceRoot);
        this._reset();
        return;
      }

      const diff = this._parseDiffStat(diffStat);
      const ghAvailable = await this.runner('gh --version', this.workspaceRoot)
        .then(() => true)
        .catch(() => false);

      interface WorktreePickItem extends vscode.QuickPickItem {
        action: 'merge' | 'pr' | 'copy' | 'discard';
      }

      const items: WorktreePickItem[] = [
        { label: '$(git-merge) Merge into current branch', action: 'merge' },
        ghAvailable
          ? { label: '$(github) Open as PR', action: 'pr' }
          : { label: '$(clippy) Copy branch name to clipboard', action: 'copy' },
        { label: '$(trash) Discard changes', action: 'discard' },
      ];

      const pick = await vscode.window.showQuickPick(items, {
        title: `Worktree session: ${diff.filesChanged} file(s) changed, +${diff.insertions} -${diff.deletions}`,
      });

      const branch = this._branch!;
      const worktreePath = this._worktreePath!;

      if (!pick) {
        await this.runner(`git worktree remove "${worktreePath}"`, this.workspaceRoot);
        return;
      }

      switch (pick.action) {
        case 'merge':
          await this.runner(`git merge ${branch}`, this.workspaceRoot);
          await this.runner(`git worktree remove "${worktreePath}"`, this.workspaceRoot);
          break;
        case 'pr':
          await this.runner(`gh pr create --head ${branch} --fill`, this.workspaceRoot);
          await this.runner(`git worktree remove "${worktreePath}"`, this.workspaceRoot);
          break;
        case 'copy':
          await vscode.env.clipboard.writeText(branch);
          break;
        case 'discard':
          await this.runner(`git worktree remove --force "${worktreePath}"`, this.workspaceRoot);
          await this.runner(`git branch -D ${branch}`, this.workspaceRoot);
          break;
      }
    } finally {
      this._reset();
    }
  }

  private _reset(): void {
    this._state = 'idle';
    this._worktreePath = undefined;
    this._branch = undefined;
    this._postStatus();
  }

  private _parseDiffStat(stat: string): WorktreeDiff {
    const filesMatch = stat.match(/(\d+) file/);
    const insertMatch = stat.match(/(\d+) insertion/);
    const deleteMatch = stat.match(/(\d+) deletion/);
    return {
      branch: this._branch ?? '',
      worktreePath: this._worktreePath ?? '',
      filesChanged: parseInt(filesMatch?.[1] ?? '0'),
      insertions: parseInt(insertMatch?.[1] ?? '0'),
      deletions: parseInt(deleteMatch?.[1] ?? '0'),
    };
  }

  private _postStatus(branchOverride?: string): void {
    this.postMessage({ type: 'worktreeStatus', status: this._state, branch: branchOverride ?? this._branch });
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
