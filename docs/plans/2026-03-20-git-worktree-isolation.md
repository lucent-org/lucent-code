# Git Worktree Isolation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create an isolated git worktree when the AI makes agentic edits, buffering changes on a separate branch so the user can review a diff and choose to merge, open a PR, or discard.

**Architecture:** A new `WorktreeManager` class owns the full lifecycle (create, URI remap, finish). `MessageHandler` holds a nullable `_worktreeManager` and calls `remapUri()` on every tool `uri` arg when active. Three triggers: autonomous mode on, `openRouterChat.startWorktree` command, or the `start_worktree` LLM tool call.

**Tech Stack:** Node.js `child_process.exec`, `vscode.window.showQuickPick`, `fs.promises`, SolidJS signals

---

### Task 1: Add shared types

**Files:**
- Modify: `src/shared/types.ts`

**Step 1: Add the new types**

Open `src/shared/types.ts`. Add `WorktreeDiff` as a new exported interface and extend `ExtensionMessage` and `WebviewMessage`.

At the bottom of the file (after the last export), add:

```typescript
export interface WorktreeDiff {
  branch: string;
  worktreePath: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
}
```

In the `ExtensionMessage` union, add a new variant:
```typescript
| { type: 'worktreeStatus'; status: 'idle' | 'creating' | 'active' | 'finishing'; branch?: string }
```

In the `WebviewMessage` union, add:
```typescript
| { type: 'startWorktree' }
```

**Step 2: Verify TypeScript compiles**

Run: `npm run compile`
Expected: no errors

**Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add worktree types to shared types"
```

---

### Task 2: WorktreeManager — create() and remapUri()

**Files:**
- Create: `src/core/worktree-manager.ts`
- Create: `src/core/worktree-manager.test.ts`

**Step 1: Write the failing tests**

Create `src/core/worktree-manager.test.ts`:

```typescript
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

describe('WorktreeManager', () => {
  let runner: ReturnType<typeof vi.fn>;
  let postMessage: ReturnType<typeof vi.fn>;
  let manager: WorktreeManager;
  const workspaceRoot = '/workspace';

  beforeEach(() => {
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
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- worktree-manager`
Expected: FAIL — `Cannot find module './worktree-manager'`

**Step 3: Implement WorktreeManager create() and remapUri()**

Create `src/core/worktree-manager.ts`:

```typescript
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
    const rel = uri.slice(prefix.length);
    return vscode.Uri.file(path.join(this._worktreePath, rel)).toString();
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
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- worktree-manager`
Expected: all create() and remapUri() tests PASS

**Step 5: Commit**

```bash
git add src/core/worktree-manager.ts src/core/worktree-manager.test.ts
git commit -m "feat: add WorktreeManager with create() and remapUri()"
```

---

### Task 3: WorktreeManager — finishSession()

**Files:**
- Modify: `src/core/worktree-manager.ts`
- Modify: `src/core/worktree-manager.test.ts`

**Step 1: Write the failing tests**

Add to the `describe('WorktreeManager')` block in `worktree-manager.test.ts`, after the `remapUri` describe block:

```typescript
describe('finishSession()', () => {
  const { mockWindow } = vi.hoisted(() => ({ mockWindow: { showQuickPick: vi.fn() } }));

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
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- worktree-manager`
Expected: finishSession tests FAIL — method not yet implemented

**Step 3: Implement finishSession()**

Add `finishSession()` method to the `WorktreeManager` class in `src/core/worktree-manager.ts`, before the private methods:

```typescript
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

    const items = [
      { label: '$(git-merge) Merge into current branch', action: 'merge' },
      ghAvailable
        ? { label: '$(github) Open as PR', action: 'pr' }
        : { label: '$(clippy) Copy branch name to clipboard', action: 'copy' },
      { label: '$(trash) Discard changes', action: 'discard' },
    ];

    const pick = await vscode.window.showQuickPick(items, {
      title: `Worktree session: ${diff.filesChanged} file(s) changed, +${diff.insertions} -${diff.deletions}`,
    });

    if (!pick) return;

    const branch = this._branch!;
    const worktreePath = this._worktreePath!;

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
```

**Step 4: Run all worktree-manager tests**

Run: `npm test -- worktree-manager`
Expected: all tests PASS

**Step 5: Commit**

```bash
git add src/core/worktree-manager.ts src/core/worktree-manager.test.ts
git commit -m "feat: add WorktreeManager finishSession() with merge/PR/discard quick-pick"
```

---

### Task 4: Wire WorktreeManager into MessageHandler

**Files:**
- Modify: `src/chat/message-handler.ts`
- Modify: `src/chat/message-handler.test.ts`
- Modify: `src/lsp/editor-tools.ts`

**Step 1: Add start_worktree tool definition**

Open `src/lsp/editor-tools.ts`. After the `USE_SKILL_TOOL_DEFINITION` export, add:

```typescript
export const START_WORKTREE_TOOL_DEFINITION: ToolDefinition = {
  type: 'function',
  function: {
    name: 'start_worktree',
    description: 'Create an isolated git worktree for this session. Call this when a skill instructs worktree isolation or before making broad agentic edits.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
};
```

**Step 2: Write the failing tests**

Open `src/chat/message-handler.test.ts`. Find the `describe('HITL tool approval')` block. Add a new describe block after it:

```typescript
describe('worktree integration', () => {
  it('start_worktree tool call invokes worktreeManager.create() without approval gate', async () => {
    const mockWorktreeManager = { create: vi.fn().mockResolvedValue(undefined), remapUri: vi.fn((u) => u), state: 'idle', finishSession: vi.fn() };
    // Inject via setter
    handler.setWorktreeManager(mockWorktreeManager as any);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: createMockStream([
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'tc1', function: { name: 'start_worktree', arguments: '{}' } }] }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
        { choices: [{ delta: { content: 'Done' }, finish_reason: 'stop' }] },
      ]),
    });

    await handler.handleMessage({ type: 'sendMessage', content: 'go', model: 'test' }, postMessage);
    expect(mockWorktreeManager.create).toHaveBeenCalled();
  });

  it('remaps uri args on replace_range when worktree is active', async () => {
    const mockWorktreeManager = {
      create: vi.fn(),
      remapUri: vi.fn((u: string) => u.replace('file:///workspace', 'file:///workspace/.worktrees/lucent-abc')),
      state: 'active',
      finishSession: vi.fn(),
    };
    handler.setWorktreeManager(mockWorktreeManager as any);

    // Trigger replace_range tool call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: createMockStream([
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'tc2', function: { name: 'replace_range', arguments: JSON.stringify({ uri: 'file:///workspace/src/foo.ts', startLine: 0, startCharacter: 0, endLine: 0, endCharacter: 0, code: 'x' }) } }] }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
        { choices: [{ delta: { content: 'Done' }, finish_reason: 'stop' }] },
      ]),
    });

    await handler.handleMessage({ type: 'sendMessage', content: 'go', model: 'test' }, postMessage);
    expect(mockWorktreeManager.remapUri).toHaveBeenCalledWith('file:///workspace/src/foo.ts');
  });

  it('does not remap uri when no worktree is active', async () => {
    // No worktreeManager set — uri passthrough
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: createMockStream([
        { choices: [{ delta: { content: 'hello' }, finish_reason: 'stop' }] },
      ]),
    });
    // Just verify it doesn't throw
    await expect(
      handler.handleMessage({ type: 'sendMessage', content: 'go', model: 'test' }, postMessage)
    ).resolves.not.toThrow();
  });

  it('autonomous mode on triggers worktreeManager.create()', async () => {
    const mockWorktreeManager = { create: vi.fn().mockResolvedValue(undefined), remapUri: vi.fn((u) => u), state: 'idle', finishSession: vi.fn() };
    handler.setWorktreeManager(mockWorktreeManager as any);
    handler.setAutonomousMode(true);
    expect(mockWorktreeManager.create).toHaveBeenCalled();
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `npm test -- message-handler`
Expected: worktree integration tests FAIL

**Step 4: Wire WorktreeManager into MessageHandler**

Open `src/chat/message-handler.ts`.

Add import at the top:
```typescript
import { WorktreeManager } from '../core/worktree-manager';
import { START_WORKTREE_TOOL_DEFINITION } from '../lsp/editor-tools';
```

Add field after `_autonomousMode`:
```typescript
private _worktreeManager: WorktreeManager | null = null;
```

Add public setter method (after `setAutonomousMode`):
```typescript
setWorktreeManager(manager: WorktreeManager): void {
  this._worktreeManager = manager;
}
```

Update `setAutonomousMode` to trigger worktree creation:
```typescript
setAutonomousMode(value: boolean): void {
  this._autonomousMode = value;
  if (value && this._worktreeManager?.state === 'idle' && this.currentConversation) {
    void this._worktreeManager.create(this.currentConversation.id);
  }
}
```

In the tool list construction (near `const skillTools`), add:
```typescript
const worktreeTools = [START_WORKTREE_TOOL_DEFINITION];
```

And include in the tools array passed to the API call:
```typescript
tools: [...editorTools, ...skillTools, ...mcpTools, ...worktreeTools],
```

In the tool dispatch loop, before the `use_skill` check, add:
```typescript
if (tc.function.name === 'start_worktree') {
  const convId = this.currentConversation?.id ?? Date.now().toString();
  try {
    await this._worktreeManager?.create(convId);
    this.conversationMessages.push({ role: 'tool', tool_call_id: tc.id, content: 'Worktree created.' });
  } catch (e: any) {
    this.conversationMessages.push({ role: 'tool', tool_call_id: tc.id, content: `Worktree creation failed: ${e.message}` });
  }
  continue;
}
```

In the tool call dispatch, immediately before executing any tool with a `uri` arg, add a remapping call. Find the line where `args` is destructured/used in `replace_range` and `insert_code`. Before the GATED_TOOLS check:
```typescript
// Remap uri to worktree if active
if (this._worktreeManager?.state === 'active' && typeof args['uri'] === 'string') {
  args = { ...args, uri: this._worktreeManager.remapUri(args['uri'] as string) };
}
```

**Step 5: Run all message-handler tests**

Run: `npm test -- message-handler`
Expected: all tests PASS

**Step 6: Commit**

```bash
git add src/chat/message-handler.ts src/chat/message-handler.test.ts src/lsp/editor-tools.ts
git commit -m "feat: wire WorktreeManager into MessageHandler with URI remapping and start_worktree tool"
```

---

### Task 5: Register command and wire autonomous mode in extension.ts

**Files:**
- Modify: `src/extension.ts`

**Step 1: Add import**

At the top of `src/extension.ts`, add:
```typescript
import { WorktreeManager } from './core/worktree-manager';
```

**Step 2: Create WorktreeManager and wire into MessageHandler**

In `setupWebviewMessaging()`, after `messageHandler` is constructed (line ~192), add:

```typescript
const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
if (workspaceRoot) {
  const worktreeManager = new WorktreeManager(
    workspaceRoot,
    (msg) => chatProvider.postMessageToWebview(msg)
  );
  messageHandler.setWorktreeManager(worktreeManager);
}
```

**Step 3: Register startWorktree command**

In the commands registration section of `src/extension.ts`, add:

```typescript
context.subscriptions.push(
  vscode.commands.registerCommand('openRouterChat.startWorktree', async () => {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('No workspace folder open.');
      return;
    }
    const convId = messageHandler?.currentConversationId ?? Date.now().toString();
    const manager = new WorktreeManager(workspaceRoot, (msg) => chatProvider.postMessageToWebview(msg));
    messageHandler?.setWorktreeManager(manager);
    try {
      await manager.create(convId);
      vscode.window.showInformationMessage(`Worktree active on branch lucent/${convId}`);
    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to create worktree: ${e.message}`);
    }
  })
);
```

**Step 4: Expose currentConversationId on MessageHandler**

Open `src/chat/message-handler.ts`. Add a getter:
```typescript
get currentConversationId(): string | undefined {
  return this.currentConversation?.id;
}
```

**Step 5: Register command in package.json**

Open `package.json`. In the `contributes.commands` array, add:
```json
{
  "command": "openRouterChat.startWorktree",
  "title": "Start Worktree Session",
  "category": "Lucent Code"
}
```

**Step 6: Compile and verify no errors**

Run: `npm run compile`
Expected: no errors

**Step 7: Commit**

```bash
git add src/extension.ts src/chat/message-handler.ts package.json
git commit -m "feat: register startWorktree command and wire WorktreeManager in extension.ts"
```

---

### Task 6: Webview — worktreeStatus signal and toolbar badge

**Files:**
- Modify: `webview/src/stores/chat.ts`
- Modify: `webview/src/App.tsx`
- Modify: `webview/src/styles.css`

**Step 1: Add worktreeStatus signal to chat store**

Open `webview/src/stores/chat.ts`.

Add signal (near the `autonomousMode` signal):
```typescript
const [worktreeStatus, setWorktreeStatus] = createSignal<'idle' | 'creating' | 'active' | 'finishing'>('idle');
```

Add handler in the message switch (near `autonomousModeChanged`):
```typescript
case 'worktreeStatus':
  setWorktreeStatus(msg.status);
  break;
```

Export from the store return object:
```typescript
worktreeStatus,
```

**Step 2: Add toolbar badge in App.tsx**

Open `webview/src/App.tsx`. In the toolbar div (near the `⚡` autonomous mode button), add:

```tsx
<Show when={chatStore.worktreeStatus() !== 'idle'}>
  <button
    class={`toolbar-btn worktree-badge worktree-badge--${chatStore.worktreeStatus()}`}
    title={`Worktree ${chatStore.worktreeStatus()}`}
    onClick={() => vscode.postMessage({ type: 'startWorktree' })}
  >
    ⎇
  </button>
</Show>
```

**Step 3: Add CSS**

Open `webview/src/styles.css`. Add near the `.autonomous-btn` styles:

```css
.worktree-badge {
  font-size: 14px;
  opacity: 0.6;
  transition: opacity 0.15s;
}
.worktree-badge--active {
  opacity: 1;
  color: var(--accent);
}
.worktree-badge--creating,
.worktree-badge--finishing {
  opacity: 0.8;
  animation: pulse 1s infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 0.4; }
}
```

**Step 4: Compile webview and verify no errors**

Run: `cd webview && npx tsc --noEmit`
Expected: no errors

**Step 5: Commit**

```bash
git add webview/src/stores/chat.ts webview/src/App.tsx webview/src/styles.css
git commit -m "feat: add worktreeStatus signal and toolbar badge to webview"
```

---

### Task 7: Update features.md

**Files:**
- Modify: `docs/features.md`

**Step 1: Mark git worktree isolation as implemented**

Open `docs/features.md`. Find the P4 backlog table entry:

```
| :construction: | **Git worktree isolation** | Per-session isolated worktree branch for safe agentic edits | L |
```

Replace with:

```
| :white_check_mark: | **Git worktree isolation** | Per-session isolated worktree branch for safe agentic edits; merge/PR/discard quick-pick at session end | L |
```

**Step 2: Commit**

```bash
git add docs/features.md
git commit -m "docs: mark git worktree isolation as implemented in features.md"
```
