# Missing Tools Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `write_file`, `delete_file`, `run_terminal_command`, `list_directory`, and `create_directory` tools with a scoped (Once / This workspace / Always) approval system for the three destructive ones.

**Architecture:** A new `ToolApprovalManager` class handles session/workspace/global approval storage (in-memory Set, `.lucent/config.json`, `~/.lucent/config.json`). The three destructive tools are added to a new `APPROVAL_GATED_TOOLS` set in `MessageHandler` and bypass the gate when already approved. The `ToolCallCard` webview component gets a 4-button footer (Deny / Once / This workspace / Always). The `toolApprovalResponse` message is extended with a `scope` field so the extension can persist the right level.

**Tech Stack:** TypeScript, VS Code extension API (`workspace.fs`, `window.createTerminal`), Node `fs/promises` + `os.homedir()`, SolidJS webview, Vitest.

---

### Task 1: ToolApprovalManager — scoped approval storage

**Files:**
- Create: `src/chat/tool-approval-manager.ts`
- Create: `src/chat/tool-approval-manager.test.ts`

**Step 1: Write the failing tests**

Create `src/chat/tool-approval-manager.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs/promises');
const fsMock = await import('fs/promises');
const mockReadFile  = vi.mocked(fsMock.readFile);
const mockWriteFile = vi.mocked(fsMock.writeFile);
const mockMkdir     = vi.mocked(fsMock.mkdir);
const mockAppendFile = vi.mocked(fsMock.appendFile);

// Import AFTER mocking
const { ToolApprovalManager } = await import('./tool-approval-manager');

describe('ToolApprovalManager', () => {
  beforeEach(() => vi.clearAllMocks());

  it('isApproved returns false with no config files', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    const m = new ToolApprovalManager('/ws');
    expect(await m.isApproved('write_file')).toBe(false);
  });

  it('approveForSession makes isApproved true immediately', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    const m = new ToolApprovalManager('/ws');
    m.approveForSession('write_file');
    expect(await m.isApproved('write_file')).toBe(true);
  });

  it('session approval does not affect other tools', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    const m = new ToolApprovalManager('/ws');
    m.approveForSession('write_file');
    expect(await m.isApproved('delete_file')).toBe(false);
  });

  it('isApproved reads workspace config', async () => {
    mockReadFile.mockImplementation(async (p) => {
      if ((p as string).endsWith('config.json')) {
        return JSON.stringify({ approvedTools: ['write_file'] });
      }
      throw new Error('ENOENT');
    });
    const m = new ToolApprovalManager('/ws');
    expect(await m.isApproved('write_file')).toBe(true);
  });

  it('approveForWorkspace writes tool to workspace config', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    mockMkdir.mockResolvedValue(undefined as any);
    mockWriteFile.mockResolvedValue(undefined);
    mockAppendFile.mockResolvedValue(undefined);
    const m = new ToolApprovalManager('/ws');
    await m.approveForWorkspace('write_file');
    const call = mockWriteFile.mock.calls.find(([p]) => (p as string).includes('.lucent/config.json'));
    expect(call).toBeDefined();
    expect(call![1] as string).toContain('write_file');
  });

  it('approveForWorkspace adds .lucent to .gitignore', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    mockMkdir.mockResolvedValue(undefined as any);
    mockWriteFile.mockResolvedValue(undefined);
    mockAppendFile.mockResolvedValue(undefined);
    const m = new ToolApprovalManager('/ws');
    await m.approveForWorkspace('write_file');
    const written = mockWriteFile.mock.calls.some(([p]) => (p as string).endsWith('.gitignore'))
                 || mockAppendFile.mock.calls.some(([p]) => (p as string).endsWith('.gitignore'));
    expect(written).toBe(true);
  });

  it('approveForWorkspace does not duplicate tool in config', async () => {
    mockReadFile.mockImplementation(async (p) => {
      if ((p as string).includes('.lucent/config.json')) {
        return JSON.stringify({ approvedTools: ['write_file'] });
      }
      throw new Error('ENOENT');
    });
    mockMkdir.mockResolvedValue(undefined as any);
    mockWriteFile.mockResolvedValue(undefined);
    mockAppendFile.mockResolvedValue(undefined);
    const m = new ToolApprovalManager('/ws');
    await m.approveForWorkspace('write_file');
    // writeFile for config should not be called (already present)
    const configWrite = mockWriteFile.mock.calls.filter(([p]) => (p as string).includes('.lucent/config.json'));
    expect(configWrite).toHaveLength(0);
  });

  it('approveGlobally writes to ~/.lucent/config.json', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    mockMkdir.mockResolvedValue(undefined as any);
    mockWriteFile.mockResolvedValue(undefined);
    const m = new ToolApprovalManager('/ws');
    await m.approveGlobally('run_terminal_command');
    const call = mockWriteFile.mock.calls.find(([p]) => (p as string).includes('.lucent') && (p as string).includes('config.json'));
    expect(call).toBeDefined();
    expect(call![1] as string).toContain('run_terminal_command');
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd c:/Projects/Prive/OpenRouterChat && npx vitest run src/chat/tool-approval-manager.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement `src/chat/tool-approval-manager.ts`**

```ts
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

interface ApprovalConfig {
  approvedTools: string[];
}

export class ToolApprovalManager {
  private readonly sessionApprovals = new Set<string>();

  constructor(private readonly workspaceRoot?: string) {}

  async isApproved(toolName: string): Promise<boolean> {
    if (this.sessionApprovals.has(toolName)) return true;
    if (this.workspaceRoot && await this.isInConfig(this.workspaceConfigPath()!, toolName)) return true;
    if (await this.isInConfig(this.globalConfigPath(), toolName)) return true;
    return false;
  }

  approveForSession(toolName: string): void {
    this.sessionApprovals.add(toolName);
  }

  async approveForWorkspace(toolName: string): Promise<void> {
    if (!this.workspaceRoot) return;
    await this.addToConfig(this.workspaceConfigPath()!, toolName);
    await this.ensureGitignore();
  }

  async approveGlobally(toolName: string): Promise<void> {
    await this.addToConfig(this.globalConfigPath(), toolName);
  }

  private workspaceConfigPath(): string | null {
    return this.workspaceRoot
      ? path.join(this.workspaceRoot, '.lucent', 'config.json')
      : null;
  }

  private globalConfigPath(): string {
    return path.join(os.homedir(), '.lucent', 'config.json');
  }

  private async isInConfig(configPath: string, toolName: string): Promise<boolean> {
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const config: ApprovalConfig = JSON.parse(content as string);
      return Array.isArray(config.approvedTools) && config.approvedTools.includes(toolName);
    } catch {
      return false;
    }
  }

  private async addToConfig(configPath: string, toolName: string): Promise<void> {
    let config: ApprovalConfig = { approvedTools: [] };
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const parsed: ApprovalConfig = JSON.parse(content as string);
      config = { approvedTools: Array.isArray(parsed.approvedTools) ? parsed.approvedTools : [] };
    } catch { /* file does not exist yet */ }
    if (config.approvedTools.includes(toolName)) return;
    config.approvedTools.push(toolName);
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  private async ensureGitignore(): Promise<void> {
    if (!this.workspaceRoot) return;
    const gitignorePath = path.join(this.workspaceRoot, '.gitignore');
    try {
      const content = await fs.readFile(gitignorePath, 'utf-8') as string;
      const lines = content.split('\n').map((l) => l.trim());
      if (lines.includes('.lucent')) return;
      await fs.appendFile(gitignorePath, '\n.lucent\n');
    } catch {
      await fs.writeFile(gitignorePath, '.lucent\n', 'utf-8');
    }
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/chat/tool-approval-manager.test.ts
```

Expected: all 8 tests PASS.

**Step 5: Commit**

```bash
git add src/chat/tool-approval-manager.ts src/chat/tool-approval-manager.test.ts
git commit -m "feat(tools): add ToolApprovalManager for scoped tool approvals"
```

---

### Task 2: Extend types for scoped approval response

**Files:**
- Modify: `src/shared/types.ts:137`

**Step 1: Update `toolApprovalResponse` in `WebviewMessage`**

In `src/shared/types.ts`, change line 137:

```ts
// Before:
| { type: 'toolApprovalResponse'; requestId: string; approved: boolean }

// After:
| { type: 'toolApprovalResponse'; requestId: string; approved: boolean; scope?: 'once' | 'workspace' | 'global' }
```

**Step 2: Run existing tests to verify nothing broke**

```bash
cd c:/Projects/Prive/OpenRouterChat && npm test
```

Expected: all tests PASS (type-only change).

**Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(tools): extend toolApprovalResponse with scope field"
```

---

### Task 3: Integrate ToolApprovalManager into MessageHandler

**Files:**
- Modify: `src/chat/message-handler.ts`

**Step 1: Add `APPROVAL_GATED_TOOLS` and `ToolApprovalManager` to `MessageHandler`**

At the top of `message-handler.ts`, add the import after the existing imports:

```ts
import { ToolApprovalManager } from './tool-approval-manager';
```

Inside the `MessageHandler` class, add after `GATED_TOOLS`:

```ts
private static readonly APPROVAL_GATED_TOOLS = new Set([
  'write_file',
  'delete_file',
  'run_terminal_command',
]);

private readonly approvalManager: ToolApprovalManager;
```

Update the constructor to initialise the manager. The workspace root is available via `vscode.workspace.workspaceFolders`. Add this at the end of the constructor body:

```ts
const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
this.approvalManager = new ToolApprovalManager(wsRoot);
```

**Step 2: Update `requestToolApproval` to return scope**

Change the return type and implementation of `requestToolApproval`:

```ts
private requestToolApproval(
  toolName: string,
  args: Record<string, unknown>,
  postMessage: (msg: ExtensionMessage) => void,
  diff?: DiffLine[]
): Promise<{ approved: boolean; scope: 'once' | 'workspace' | 'global' }> {
  const requestId = `approval-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve) => {
    this.pendingApprovals.set(requestId, resolve as any);
    postMessage({ type: 'toolApprovalRequest', requestId, toolName, args, diff });
  });
}
```

Update `pendingApprovals` type:

```ts
private readonly pendingApprovals = new Map<string, (result: { approved: boolean; scope: 'once' | 'workspace' | 'global' }) => void>();
```

Update the `toolApprovalResponse` handler in `handleMessage`:

```ts
case 'toolApprovalResponse': {
  const resolve = this.pendingApprovals.get(message.requestId);
  if (resolve) {
    this.pendingApprovals.delete(message.requestId);
    resolve({ approved: message.approved, scope: message.scope ?? 'once' });
  }
  break;
}
```

Update the `abort` method to pass a denied result:

```ts
abort(): void {
  this.abortController?.abort();
  for (const resolve of this.pendingApprovals.values()) {
    resolve({ approved: false, scope: 'once' });
  }
  this.pendingApprovals.clear();
}
```

**Step 3: Add approval gating for new destructive tools**

In the tool execution loop (after the `GATED_TOOLS` check block, before `const result = await this.toolExecutor.execute`), add:

```ts
if (MessageHandler.APPROVAL_GATED_TOOLS.has(tc.function.name)) {
  const alreadyApproved = await this.approvalManager.isApproved(tc.function.name);
  if (!alreadyApproved) {
    const { approved, scope } = await this.requestToolApproval(tc.function.name, args, postMessage);
    if (!approved) {
      this.conversationMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: 'User denied this action.',
      });
      continue;
    }
    if (scope === 'once') {
      // no-op — approved only for this invocation
    } else if (scope === 'workspace') {
      await this.approvalManager.approveForWorkspace(tc.function.name);
    } else if (scope === 'global') {
      await this.approvalManager.approveGlobally(tc.function.name);
    }
  }
}
```

**Step 4: Run tests**

```bash
npm test
```

Expected: all existing tests PASS.

**Step 5: Commit**

```bash
git add src/chat/message-handler.ts
git commit -m "feat(tools): wire ToolApprovalManager into MessageHandler"
```

---

### Task 4: Add 5 new tool definitions to TOOL_DEFINITIONS

**Files:**
- Modify: `src/lsp/editor-tools.ts`
- Modify: `src/lsp/editor-tools.test.ts`

**Step 1: Write failing tests**

In `src/lsp/editor-tools.test.ts`, add to the existing `'should define tool schemas'` test or add new assertions:

```ts
it('defines all 5 new tools', () => {
  const names = TOOL_DEFINITIONS.map((t) => t.function.name);
  expect(names).toContain('write_file');
  expect(names).toContain('delete_file');
  expect(names).toContain('run_terminal_command');
  expect(names).toContain('list_directory');
  expect(names).toContain('create_directory');
});

it('write_file definition has required path and content params', () => {
  const def = TOOL_DEFINITIONS.find((t) => t.function.name === 'write_file')!;
  expect(def.function.parameters.required).toContain('path');
  expect(def.function.parameters.required).toContain('content');
});

it('run_terminal_command definition has required command param', () => {
  const def = TOOL_DEFINITIONS.find((t) => t.function.name === 'run_terminal_command')!;
  expect(def.function.parameters.required).toContain('command');
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lsp/editor-tools.test.ts
```

Expected: FAIL — tools not yet defined.

**Step 3: Add the 5 definitions to `TOOL_DEFINITIONS` in `src/lsp/editor-tools.ts`**

Add after the `read_file` definition:

```ts
{
  type: 'function',
  function: {
    name: 'write_file',
    description: 'Create or completely overwrite a file with the given content. Parent directories are created automatically. Use for creating new files or replacing entire file contents.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace-relative or absolute path, e.g. "src/utils/helper.ts"' },
        content: { type: 'string', description: 'Full content to write to the file' },
      },
      required: ['path', 'content'],
    },
  },
},
{
  type: 'function',
  function: {
    name: 'delete_file',
    description: 'Delete a file from the workspace. Returns an error if the file does not exist.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace-relative or absolute path to the file to delete' },
      },
      required: ['path'],
    },
  },
},
{
  type: 'function',
  function: {
    name: 'run_terminal_command',
    description: 'Run a shell command in the VS Code integrated terminal and return its output. Use to run tests, builds, installs, git commands, or any CLI tool.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to run, e.g. "npm test" or "git status"' },
      },
      required: ['command'],
    },
  },
},
{
  type: 'function',
  function: {
    name: 'list_directory',
    description: 'List files and subdirectories in a directory. Returns each entry with a [file] or [dir] label.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace-relative or absolute path to the directory (default: workspace root)' },
      },
      required: [],
    },
  },
},
{
  type: 'function',
  function: {
    name: 'create_directory',
    description: 'Create a directory (and any missing parent directories). Succeeds silently if the directory already exists.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace-relative or absolute path to the directory to create' },
      },
      required: ['path'],
    },
  },
},
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lsp/editor-tools.test.ts
```

Expected: all tests PASS.

**Step 5: Commit**

```bash
git add src/lsp/editor-tools.ts src/lsp/editor-tools.test.ts
git commit -m "feat(tools): add 5 new tool definitions (write_file, delete_file, run_terminal_command, list_directory, create_directory)"
```

---

### Task 5: Implement the 5 new tools in EditorToolExecutor

**Files:**
- Modify: `src/lsp/editor-tools.ts`
- Modify: `src/lsp/editor-tools.test.ts`

**Step 1: Write failing tests**

The existing vscode mock needs `workspace.fs.writeFile`, `workspace.fs.delete`, `workspace.fs.readDirectory`, `workspace.fs.createDirectory`, `window.createTerminal`, and `workspace.workspaceFolders`. Add to the vscode mock at the top of `editor-tools.test.ts`:

```ts
const { mockWriteFile, mockDeleteFile, mockReadDirectory, mockCreateDirectory, mockCreateTerminal, mockSendText } = vi.hoisted(() => ({
  mockWriteFile: vi.fn(() => Promise.resolve()),
  mockDeleteFile: vi.fn(() => Promise.resolve()),
  mockReadDirectory: vi.fn(() => Promise.resolve([])),
  mockCreateDirectory: vi.fn(() => Promise.resolve()),
  mockCreateTerminal: vi.fn(),
  mockSendText: vi.fn(),
}));
```

Update the vscode mock to include these:

```ts
vi.mock('vscode', () => ({
  // ... existing mocks ...
  workspace: {
    applyEdit: mockApplyEdit,
    findFiles: mockFindFiles,
    workspaceFolders: [{ uri: { fsPath: '/workspace', joinPath: () => {} } }],
    fs: {
      readFile: mockReadFile,
      writeFile: mockWriteFile,
      delete: mockDeleteFile,
      readDirectory: mockReadDirectory,
      createDirectory: mockCreateDirectory,
    },
  },
  window: {
    createTerminal: mockCreateTerminal,
  },
  Uri: {
    parse: (s: string) => ({ toString: () => s, fsPath: s }),
    file: (s: string) => ({ toString: () => s, fsPath: s }),
    joinPath: (base: any, ...parts: string[]) => ({ fsPath: [base.fsPath, ...parts].join('/') }),
  },
  // ...
}));
```

Add tests:

```ts
describe('write_file', () => {
  it('writes content to workspace-relative path', async () => {
    mockWriteFile.mockResolvedValue(undefined);
    mockCreateDirectory.mockResolvedValue(undefined);
    const result = await executor.execute('write_file', { path: 'src/foo.ts', content: 'export {}' });
    expect(result.success).toBe(true);
    expect(mockWriteFile).toHaveBeenCalled();
  });
});

describe('delete_file', () => {
  it('deletes a file at workspace-relative path', async () => {
    mockDeleteFile.mockResolvedValue(undefined);
    const result = await executor.execute('delete_file', { path: 'src/foo.ts' });
    expect(result.success).toBe(true);
    expect(mockDeleteFile).toHaveBeenCalled();
  });

  it('returns error if file does not exist', async () => {
    mockDeleteFile.mockRejectedValue(Object.assign(new Error('FileNotFound'), { code: 'FileNotFound' }));
    const result = await executor.execute('delete_file', { path: 'src/missing.ts' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });
});

describe('list_directory', () => {
  it('returns formatted list of files and dirs', async () => {
    mockReadDirectory.mockResolvedValue([
      ['src', 2],   // vscode.FileType.Directory = 2
      ['README.md', 1],  // vscode.FileType.File = 1
    ]);
    const result = await executor.execute('list_directory', { path: '.' });
    expect(result.success).toBe(true);
    expect(result.message).toContain('[dir]  src');
    expect(result.message).toContain('[file] README.md');
  });
});

describe('create_directory', () => {
  it('creates a directory', async () => {
    mockCreateDirectory.mockResolvedValue(undefined);
    const result = await executor.execute('create_directory', { path: 'src/utils' });
    expect(result.success).toBe(true);
    expect(mockCreateDirectory).toHaveBeenCalled();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lsp/editor-tools.test.ts
```

Expected: FAIL — methods not yet implemented.

**Step 3: Implement the 5 methods in `EditorToolExecutor`**

Add to the `execute` switch (after the `read_file` case):

```ts
case 'write_file':
  return await this.writeFile(args);
case 'delete_file':
  return await this.deleteFile(args);
case 'run_terminal_command':
  return await this.runTerminalCommand(args);
case 'list_directory':
  return await this.listDirectory(args);
case 'create_directory':
  return await this.createDirectory(args);
```

Add the methods to the class (before the closing `}`):

```ts
private async writeFile(args: Record<string, unknown>): Promise<ToolResult> {
  const filePath = args.path as string;
  const content = args.content as string;
  const uri = this.resolveUri(filePath);
  try {
    // Create parent directories first
    const parentUri = vscode.Uri.joinPath(uri, '..');
    await vscode.workspace.fs.createDirectory(parentUri);
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content));
    return { success: true, message: `Wrote ${content.length} bytes to ${filePath}` };
  } catch (err) {
    return { success: false, error: `Could not write file: ${err instanceof Error ? err.message : String(err)}` };
  }
}

private async deleteFile(args: Record<string, unknown>): Promise<ToolResult> {
  const filePath = args.path as string;
  const uri = this.resolveUri(filePath);
  try {
    await vscode.workspace.fs.delete(uri);
    return { success: true, message: `Deleted ${filePath}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('not found') || msg.includes('FileNotFound') || msg.includes('ENOENT')) {
      return { success: false, error: `File not found: ${filePath}` };
    }
    return { success: false, error: `Could not delete file: ${msg}` };
  }
}

private async runTerminalCommand(args: Record<string, unknown>): Promise<ToolResult> {
  const command = args.command as string;
  const terminal = vscode.window.createTerminal({ name: 'Lucent' });
  terminal.show(true); // preserve focus
  terminal.sendText(command);

  // Wait for output to settle
  const SETTLE_MS = 8000;
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

  const output = this.terminalBuffer?.getActiveTerminalOutput();
  terminal.dispose();

  if (!output) {
    return {
      success: true,
      message: `Command sent: ${command}\n(Output capture unavailable — terminal data API requires proposed API enablement)`,
    };
  }
  return { success: true, message: `$ ${command}\n\n${output}` };
}

private async listDirectory(args: Record<string, unknown>): Promise<ToolResult> {
  const dirPath = (args.path as string | undefined) ?? '.';
  const uri = this.resolveUri(dirPath);
  try {
    const entries = await vscode.workspace.fs.readDirectory(uri);
    if (entries.length === 0) return { success: true, message: '(empty directory)' };
    const lines = entries
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, type]) => `${type === 2 ? '[dir] ' : '[file]'} ${name}`);
    return { success: true, message: lines.join('\n') };
  } catch (err) {
    return { success: false, error: `Could not list directory: ${err instanceof Error ? err.message : String(err)}` };
  }
}

private async createDirectory(args: Record<string, unknown>): Promise<ToolResult> {
  const dirPath = args.path as string;
  const uri = this.resolveUri(dirPath);
  try {
    await vscode.workspace.fs.createDirectory(uri);
    return { success: true, message: `Created directory: ${dirPath}` };
  } catch (err) {
    return { success: false, error: `Could not create directory: ${err instanceof Error ? err.message : String(err)}` };
  }
}

private resolveUri(filePath: string): vscode.Uri {
  if (filePath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(filePath)) {
    return vscode.Uri.file(filePath);
  }
  const wsFolder = vscode.workspace.workspaceFolders?.[0];
  if (wsFolder) {
    return vscode.Uri.joinPath(wsFolder.uri, filePath);
  }
  return vscode.Uri.file(filePath);
}
```

Note: `this.terminalBuffer` is not currently passed to `EditorToolExecutor`. Add an optional constructor parameter:

```ts
constructor(
  private readonly getTavilyApiKey?: () => Promise<string | undefined>,
  private readonly terminalBuffer?: import('../core/terminal-buffer').TerminalBuffer,
  private readonly indexer?: import('../search/indexer').Indexer
) {}
```

Update `editor-tools.ts` constructor signature and update the call site in `extension.ts` to pass `terminalBuffer`.

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lsp/editor-tools.test.ts
```

Expected: all tests PASS.

**Step 5: Commit**

```bash
git add src/lsp/editor-tools.ts src/lsp/editor-tools.test.ts src/extension.ts
git commit -m "feat(tools): implement write_file, delete_file, run_terminal_command, list_directory, create_directory"
```

---

### Task 6: Update ToolCallCard with 4-button approval UI

**Files:**
- Modify: `webview/src/components/ToolCallCard.tsx`
- Modify: `webview/src/stores/chat.ts`
- Modify: `webview/src/App.tsx`
- Modify: `src/shared/types.ts`

**Step 1: Update `onRespond` signature in `ToolCallCard.tsx`**

Change the `ToolCallCardProps` interface and usage:

```tsx
// Before:
interface ToolCallCardProps {
  approval: ToolApprovalData;
  onRespond: (requestId: string, approved: boolean) => void;
}

// After:
type ApprovalScope = 'once' | 'workspace' | 'global';

interface ToolCallCardProps {
  approval: ToolApprovalData;
  onRespond: (requestId: string, approved: boolean, scope?: ApprovalScope) => void;
}
```

Replace the `<div class="tool-call-actions">` block in the `Show when={pending}` section:

```tsx
<Show when={props.approval.status === 'pending'}>
  <div class="tool-call-actions">
    <button
      class="tool-call-btn tool-call-btn--deny"
      onClick={() => props.onRespond(props.approval.requestId, false)}
    >
      Deny
    </button>
    <button
      class="tool-call-btn tool-call-btn--allow"
      onClick={() => props.onRespond(props.approval.requestId, true, 'once')}
    >
      Once
    </button>
    <button
      class="tool-call-btn tool-call-btn--allow-workspace"
      onClick={() => props.onRespond(props.approval.requestId, true, 'workspace')}
    >
      This workspace
    </button>
    <button
      class="tool-call-btn tool-call-btn--allow-global"
      onClick={() => props.onRespond(props.approval.requestId, true, 'global')}
    >
      Always
    </button>
  </div>
</Show>
```

**Step 2: Update `resolveToolApproval` in `chat.ts` to accept scope**

```ts
// src/shared/types.ts — already updated in Task 2

// chat.ts — update resolveToolApproval:
function resolveToolApproval(requestId: string, approved: boolean, scope?: 'once' | 'workspace' | 'global') {
  setMessages((prev) =>
    prev.map((m) =>
      m.toolApproval?.requestId === requestId
        ? { ...m, toolApproval: { ...m.toolApproval!, status: approved ? 'approved' : 'denied' } as const }
        : m
    )
  );
  vscode.postMessage({ type: 'toolApprovalResponse', requestId, approved, scope });
}
```

**Step 3: Update the `tool-approval` event handler in `App.tsx`**

```tsx
// Before:
window.addEventListener('tool-approval', (e: Event) => {
  const { requestId, approved } = (e as CustomEvent).detail;
  chatStore.resolveToolApproval(requestId, approved);
});

// After:
window.addEventListener('tool-approval', (e: Event) => {
  const { requestId, approved, scope } = (e as CustomEvent).detail;
  chatStore.resolveToolApproval(requestId, approved, scope);
});
```

**Update the `ToolCallCard` dispatch in `ChatMessage.tsx`:**

```tsx
// Before:
onRespond={(requestId, approved) => {
  window.dispatchEvent(new CustomEvent('tool-approval', { detail: { requestId, approved } }));
}}

// After:
onRespond={(requestId, approved, scope) => {
  window.dispatchEvent(new CustomEvent('tool-approval', { detail: { requestId, approved, scope } }));
}}
```

**Step 4: Build to verify no TypeScript errors**

```bash
npm run build
```

Expected: build succeeds with no errors.

**Step 5: Commit**

```bash
git add webview/src/components/ToolCallCard.tsx webview/src/stores/chat.ts webview/src/App.tsx webview/src/components/ChatMessage.tsx
git commit -m "feat(tools): add 4-button scoped approval UI to ToolCallCard"
```

---

### Task 7: Style the new approval buttons

**Files:**
- Modify: `webview/src/styles.css`

**Step 1: Add styles for the new buttons**

Find the existing `.tool-call-btn--allow` and `.tool-call-btn--deny` styles in `styles.css` and extend them:

```css
/* Existing styles stay, add: */
.tool-call-btn--allow-workspace {
  background: var(--vscode-button-secondaryBackground, rgba(255,255,255,0.08));
  color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
  border: 1px solid var(--border);
}

.tool-call-btn--allow-workspace:hover {
  background: var(--vscode-button-secondaryHoverBackground, rgba(255,255,255,0.12));
}

.tool-call-btn--allow-global {
  background: var(--vscode-button-secondaryBackground, rgba(255,255,255,0.08));
  color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
  border: 1px solid var(--border);
}

.tool-call-btn--allow-global:hover {
  background: var(--vscode-button-secondaryHoverBackground, rgba(255,255,255,0.12));
}
```

Also ensure `.tool-call-actions` wraps buttons on narrow widths:

```css
.tool-call-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
```

**Step 2: Build and deploy**

```bash
npm run build && for dir in ~/.vscode/extensions/lucentcode.lucent-code-*/dist; do cp dist/extension.js "$dir/extension.js" && cp dist/webview/index.js "$dir/webview/index.js" && cp dist/webview/index.css "$dir/webview/index.css"; done
```

**Step 3: Run full test suite**

```bash
npm test
```

Expected: all tests PASS.

**Step 4: Commit**

```bash
git add webview/src/styles.css
git commit -m "feat(tools): style scoped approval buttons in ToolCallCard"
```
