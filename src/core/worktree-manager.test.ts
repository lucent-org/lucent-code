import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock vscode
vi.mock('vscode', () => ({
  window: {
    showQuickPick: vi.fn(),
    showErrorMessage: vi.fn(),
  },
  env: {
    clipboard: { writeText: vi.fn() },
  },
  Uri: {
    file: vi.fn((p: string) => ({ toString: () => `file://${p}` })),
  },
}));

// Mock fs
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    appendFile: vi.fn(),
    writeFile: vi.fn(),
  },
}));

import { WorktreeManager } from './worktree-manager';
import * as fs from 'fs';
import * as vscode from 'vscode';

describe('WorktreeManager', () => {
  let runner: ReturnType<typeof vi.fn>;
  let postMessage: ReturnType<typeof vi.fn>;
  let manager: WorktreeManager;
  const workspaceRoot = '/workspace';

  beforeEach(() => {
    vi.clearAllMocks();
    runner = vi.fn().mockResolvedValue('');
    postMessage = vi.fn();
    manager = new WorktreeManager(workspaceRoot, postMessage, runner);
    vi.mocked(fs.promises.readFile).mockResolvedValue('.gitignore content' as any);
    vi.mocked(fs.promises.appendFile).mockResolvedValue(undefined);
  });

  describe('create()', () => {
    it('runs git worktree add with branch derived from conversationId', async () => {
      await manager.create('abc123');
      expect(runner).toHaveBeenCalledWith(
        expect.stringContaining('git worktree add'),
        workspaceRoot
      );
      expect(runner).toHaveBeenCalledWith(
        expect.stringContaining('lucent/abc123'),
        workspaceRoot
      );
    });

    it('appends .worktrees/ to .gitignore when not already present', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue('node_modules/' as any);
      await manager.create('abc123');
      expect(fs.promises.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('.gitignore'),
        expect.stringContaining('.worktrees/')
      );
    });

    it('does not modify .gitignore when .worktrees already present', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue('.worktrees/' as any);
      await manager.create('abc123');
      expect(fs.promises.appendFile).not.toHaveBeenCalled();
    });

    it('sets state to active and posts worktreeStatus after success', async () => {
      await manager.create('abc123');
      expect(manager.state).toBe('active');
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'worktreeStatus', status: 'active' })
      );
    });

    it('stays idle and posts idle status when git command fails', async () => {
      runner.mockRejectedValueOnce(new Error('not a git repo'));
      await expect(manager.create('abc123')).rejects.toThrow('not a git repo');
      expect(manager.state).toBe('idle');
      expect(postMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: 'worktreeStatus', status: 'idle' })
      );
    });

    it('is a no-op when already active', async () => {
      await manager.create('abc123');
      runner.mockClear();
      await manager.create('xyz');
      expect(runner).not.toHaveBeenCalled();
    });

    it('worktreePath contains lucent-abc123 after successful create', async () => {
      await manager.create('abc123');
      expect(manager.worktreePath).toContain('lucent-abc123');
    });
  });

  describe('remapUri()', () => {
    beforeEach(async () => {
      await manager.create('abc123');
    });

    it('replaces workspace root prefix with worktree path', () => {
      const original = 'file:///workspace/src/foo.ts';
      const remapped = manager.remapUri(original);
      expect(remapped).toContain('lucent-abc123');
      expect(remapped).toContain('src/foo.ts');
    });

    it('returns URI unchanged when it does not start with workspace root', () => {
      const external = 'file:///other/path/file.ts';
      expect(manager.remapUri(external)).toBe(external);
    });
  });

  describe('finishSession()', () => {
    beforeEach(async () => {
      vi.mocked(vscode.window.showQuickPick).mockReset();
      await manager.create('abc123');
    });

    it('removes worktree silently when there are no changes', async () => {
      runner.mockResolvedValueOnce(''); // git diff returns empty
      await manager.finishSession();
      expect(runner).toHaveBeenCalledWith(
        expect.stringContaining('git worktree remove'),
        workspaceRoot
      );
      expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
      expect(manager.state).toBe('idle');
    });

    it('shows quick-pick when there are changes', async () => {
      runner.mockResolvedValueOnce(' 3 files changed, 10 insertions(+), 2 deletions(-)');
      runner.mockResolvedValueOnce(''); // gh --version succeeds
      vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined); // dismissed
      await manager.finishSession();
      expect(vscode.window.showQuickPick).toHaveBeenCalled();
    });

    it('merges and removes worktree on Merge selection', async () => {
      runner.mockResolvedValueOnce(' 1 file changed, 5 insertions(+)');
      runner.mockResolvedValueOnce(''); // gh --version
      vi.mocked(vscode.window.showQuickPick).mockResolvedValue({ label: '$(git-merge) Merge into current branch', action: 'merge' } as any);
      await manager.finishSession();
      expect(runner).toHaveBeenCalledWith(expect.stringContaining('git merge'), workspaceRoot);
      expect(runner).toHaveBeenCalledWith(expect.stringContaining('git worktree remove'), workspaceRoot);
      expect(manager.state).toBe('idle');
    });

    it('force-removes worktree and deletes branch on Discard selection', async () => {
      runner.mockResolvedValueOnce(' 1 file changed, 5 insertions(+)');
      runner.mockResolvedValueOnce(''); // gh --version
      vi.mocked(vscode.window.showQuickPick).mockResolvedValue({ label: '$(trash) Discard changes', action: 'discard' } as any);
      await manager.finishSession();
      expect(runner).toHaveBeenCalledWith(expect.stringContaining('git worktree remove --force'), workspaceRoot);
      expect(runner).toHaveBeenCalledWith(expect.stringContaining('git branch -D'), workspaceRoot);
      expect(manager.state).toBe('idle');
    });

    it('copies branch name to clipboard when gh is not available', async () => {
      runner.mockResolvedValueOnce(' 1 file changed, 5 insertions(+)');
      runner.mockRejectedValueOnce(new Error('gh not found')); // gh --version fails
      vi.mocked(vscode.window.showQuickPick).mockResolvedValue({ label: '$(clippy) Copy branch name to clipboard', action: 'copy' } as any);
      await manager.finishSession();
      expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('lucent/'));
    });
  });
});
