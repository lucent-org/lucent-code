# P1 Editor Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship three P1 features in complexity order — custom instructions file, context menu actions (Explain/Fix/Improve), and Apply to file with diff preview.

**Architecture:** Feature 1 adds `InstructionsLoader` wired into `ContextBuilder`. Feature 2 registers six editor context-menu commands that post `triggerSend` to the webview. Feature 3 adds an "Apply" button to code blocks, with the extension handling file resolution, hunk counting, and two diff paths (inline webview diff for ≤1 hunk, VSCode native diff for 2+ hunks).

**Tech Stack:** TypeScript, VSCode extension API, Solid.js webview, `diff` npm package (hunk counting), Vitest.

---

## Task 1: InstructionsLoader — class and tests

**Files:**
- Create: `src/core/instructions-loader.ts`
- Create: `src/core/instructions-loader.test.ts`

**Step 1: Write the failing tests**

Create `src/core/instructions-loader.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockReadFile, mockCreateFileSystemWatcher, mockShowWarningMessage } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockCreateFileSystemWatcher: vi.fn(() => ({
    onDidCreate: vi.fn(),
    onDidChange: vi.fn(),
    onDidDelete: vi.fn(),
    dispose: vi.fn(),
  })),
  mockShowWarningMessage: vi.fn(),
}));

vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{ uri: { scheme: 'file', path: '/workspace' } }],
    fs: { readFile: mockReadFile },
    createFileSystemWatcher: mockCreateFileSystemWatcher,
  },
  Uri: {
    joinPath: (base: any, ...segments: string[]) => ({
      scheme: 'file',
      path: base.path + '/' + segments.join('/'),
    }),
  },
  RelativePattern: class {
    constructor(public base: any, public pattern: string) {}
  },
  window: { showWarningMessage: mockShowWarningMessage },
}));

import { InstructionsLoader } from './instructions-loader';

describe('InstructionsLoader', () => {
  let loader: InstructionsLoader;

  beforeEach(() => {
    vi.clearAllMocks();
    loader = new InstructionsLoader();
  });

  it('should return undefined when no instructions file exists', async () => {
    mockReadFile.mockRejectedValue(new Error('File not found'));
    await loader.load();
    expect(loader.getInstructions()).toBeUndefined();
  });

  it('should load .openrouter-instructions.md when present', async () => {
    mockReadFile.mockResolvedValueOnce(new TextEncoder().encode('# Instructions'));
    await loader.load();
    expect(loader.getInstructions()).toBe('# Instructions');
  });

  it('should fall back to .cursorrules when .openrouter-instructions.md is missing', async () => {
    mockReadFile
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValueOnce(new TextEncoder().encode('Be concise'));
    await loader.load();
    expect(loader.getInstructions()).toBe('Be concise');
  });

  it('should prefer .openrouter-instructions.md and not read .cursorrules', async () => {
    mockReadFile.mockResolvedValueOnce(new TextEncoder().encode('Override'));
    await loader.load();
    expect(loader.getInstructions()).toBe('Override');
    expect(mockReadFile).toHaveBeenCalledTimes(1);
  });

  it('should warn and skip a file exceeding 50 KB', async () => {
    mockReadFile.mockResolvedValueOnce(new Uint8Array(51 * 1024));
    await loader.load();
    expect(mockShowWarningMessage).toHaveBeenCalledWith(expect.stringContaining('50 KB'));
    expect(loader.getInstructions()).toBeUndefined();
  });

  it('should register a FileSystemWatcher on watch()', () => {
    loader.watch();
    expect(mockCreateFileSystemWatcher).toHaveBeenCalledTimes(1);
  });

  it('should clear instructions on dispose', () => {
    loader.dispose();
    // no throw
  });
});
```

**Step 2: Run to confirm failure**

```bash
npm test -- --reporter=verbose src/core/instructions-loader.test.ts
```
Expected: FAIL — `Cannot find module './instructions-loader'`

**Step 3: Implement InstructionsLoader**

Create `src/core/instructions-loader.ts`:

```ts
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
  }
}
```

**Step 4: Run tests**

```bash
npm test -- --reporter=verbose src/core/instructions-loader.test.ts
```
Expected: 7 tests pass.

**Step 5: Commit**

```bash
git add src/core/instructions-loader.ts src/core/instructions-loader.test.ts
git commit -m "feat: add InstructionsLoader for project-level instructions files"
```

---

## Task 2: Wire InstructionsLoader into ContextBuilder and MessageHandler

**Files:**
- Modify: `src/core/context-builder.ts`
- Modify: `src/chat/message-handler.ts`
- Modify: `src/extension.ts`
- Test: `src/core/context-builder.test.ts` (read first to understand existing tests)

**Step 1: Add setInstructionsLoader + getCustomInstructions to ContextBuilder**

In `src/core/context-builder.ts`, add the import and two methods:

```ts
import { InstructionsLoader } from './instructions-loader';
```

Inside the `ContextBuilder` class, add the field and methods:

```ts
private instructionsLoader?: InstructionsLoader;

setInstructionsLoader(loader: InstructionsLoader): void {
  this.instructionsLoader = loader;
}

getCustomInstructions(): string | undefined {
  return this.instructionsLoader?.getInstructions();
}
```

**Step 2: Inject into system message in MessageHandler**

In `src/chat/message-handler.ts`, find `handleSendMessage` where the system message is built. Replace:

```ts
const systemMessage: ChatMessage = {
  role: 'system',
  content: `You are a helpful coding assistant integrated into VSCode. You have access to the user's current editor context.\n\n${contextPrompt}`,
};
```

with:

```ts
const customInstructions = this.contextBuilder.getCustomInstructions();
const systemMessage: ChatMessage = {
  role: 'system',
  content: [
    'You are a helpful coding assistant integrated into VSCode. You have access to the user\'s current editor context.',
    customInstructions ? `\n\n## Project Instructions:\n${customInstructions}` : '',
    `\n\n${contextPrompt}`,
  ].join(''),
};
```

**Step 3: Wire in extension.ts**

In `src/extension.ts`, add the import:

```ts
import { InstructionsLoader } from './core/instructions-loader';
```

After `const contextBuilder = new ContextBuilder();`, add:

```ts
const instructionsLoader = new InstructionsLoader();
await instructionsLoader.load();
instructionsLoader.watch();
contextBuilder.setInstructionsLoader(instructionsLoader);
```

In the cleanup `dispose` block, add `instructionsLoader.dispose()`:

```ts
context.subscriptions.push({
  dispose: () => {
    auth.dispose();
    completionProvider.dispose();
    instructionsLoader.dispose();
  },
});
```

**Step 4: Run all tests**

```bash
npm test
```
Expected: all 118 tests pass (no existing tests break; InstructionsLoader tests already pass).

**Step 5: Commit**

```bash
git add src/core/context-builder.ts src/chat/message-handler.ts src/extension.ts
git commit -m "feat: inject custom instructions into system prompt from .openrouter-instructions.md or .cursorrules"
```

---

## Task 3: Context menu commands — package.json

**Files:**
- Modify: `package.json`

**Step 1: Add 6 new commands**

In `package.json`, inside `contributes.commands`, add after the last existing command:

```json
{
  "command": "openRouterChat.explainCode",
  "title": "Explain (Add to Chat)",
  "category": "OpenRouter Chat"
},
{
  "command": "openRouterChat.explainCodeNew",
  "title": "Explain (New Chat)",
  "category": "OpenRouter Chat"
},
{
  "command": "openRouterChat.fixCode",
  "title": "Fix (Add to Chat)",
  "category": "OpenRouter Chat"
},
{
  "command": "openRouterChat.fixCodeNew",
  "title": "Fix (New Chat)",
  "category": "OpenRouter Chat"
},
{
  "command": "openRouterChat.improveCode",
  "title": "Improve (Add to Chat)",
  "category": "OpenRouter Chat"
},
{
  "command": "openRouterChat.improveCodeNew",
  "title": "Improve (New Chat)",
  "category": "OpenRouter Chat"
}
```

**Step 2: Add submenu declaration**

In `package.json` `contributes`, add a top-level `submenus` array:

```json
"submenus": [
  {
    "id": "openRouterChat.editorContext",
    "label": "OpenRouter Chat"
  }
]
```

**Step 3: Add menu entries**

In `package.json` `contributes`, add a `menus` object:

```json
"menus": {
  "editor/context": [
    {
      "submenu": "openRouterChat.editorContext",
      "when": "editorHasSelection",
      "group": "navigation@100"
    }
  ],
  "openRouterChat.editorContext": [
    { "command": "openRouterChat.explainCode", "group": "1_explain@1" },
    { "command": "openRouterChat.explainCodeNew", "group": "1_explain@2" },
    { "command": "openRouterChat.fixCode", "group": "2_fix@1" },
    { "command": "openRouterChat.fixCodeNew", "group": "2_fix@2" },
    { "command": "openRouterChat.improveCode", "group": "3_improve@1" },
    { "command": "openRouterChat.improveCodeNew", "group": "3_improve@2" }
  ]
}
```

**Step 4: Run all tests**

```bash
npm test
```
Expected: all 118 tests pass (package.json changes don't affect unit tests).

**Step 5: Commit**

```bash
git add package.json
git commit -m "feat: register context menu commands for Explain/Fix/Improve"
```

---

## Task 4: Context menu — command handlers + webview triggerSend

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/extension.ts`
- Modify: `webview/src/App.tsx`
- Test: `src/chat/message-handler.test.ts` (no changes needed — triggerSend bypasses MessageHandler)

**Step 1: Add triggerSend to ExtensionMessage in types.ts**

In `src/shared/types.ts`, add to the `ExtensionMessage` union:

```ts
| { type: 'triggerSend'; content: string; newChat: boolean }
```

**Step 2: Add command handlers in extension.ts**

In `src/extension.ts`, after the `focusChat` command registration, add:

```ts
// Context menu actions
const makeContextAction = (
  action: 'explain' | 'fix' | 'improve',
  newChat: boolean
) => async () => {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) return;

  const selection = editor.document.getText(editor.selection);
  const lang = editor.document.languageId;
  const labels = { explain: 'Explain', fix: 'Fix', improve: 'Improve' } as const;
  const content = `${labels[action]} this code:\n\`\`\`${lang}\n${selection}\n\`\`\``;

  await vscode.commands.executeCommand('openRouterChat.chatView.focus');
  chatProvider.getWebview()?.postMessage({ type: 'triggerSend', content, newChat });
};

context.subscriptions.push(
  vscode.commands.registerCommand('openRouterChat.explainCode', makeContextAction('explain', false)),
  vscode.commands.registerCommand('openRouterChat.explainCodeNew', makeContextAction('explain', true)),
  vscode.commands.registerCommand('openRouterChat.fixCode', makeContextAction('fix', false)),
  vscode.commands.registerCommand('openRouterChat.fixCodeNew', makeContextAction('fix', true)),
  vscode.commands.registerCommand('openRouterChat.improveCode', makeContextAction('improve', false)),
  vscode.commands.registerCommand('openRouterChat.improveCodeNew', makeContextAction('improve', true)),
);
```

**Step 3: Handle triggerSend in the webview**

In `webview/src/App.tsx`, inside the `window.addEventListener('message', ...)` switch, add before the closing `}`:

```ts
case 'triggerSend':
  if (message.newChat) {
    chatStore.newChat();
  }
  chatStore.sendMessage(message.content);
  scrollToBottom();
  break;
```

**Step 4: Run all tests**

```bash
npm test
```
Expected: all 118 tests pass.

**Step 5: Build webview to confirm no TypeScript errors**

```bash
npm run build:webview 2>&1 | head -20
```
Expected: no errors.

**Step 6: Commit**

```bash
git add src/shared/types.ts src/extension.ts webview/src/App.tsx
git commit -m "feat: wire context menu Explain/Fix/Improve commands to chat panel"
```

---

## Task 5: Apply to file — new types and install diff package

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `package.json` (root — add diff dependency)

**Step 1: Install the diff package**

```bash
npm install diff
npm install -D @types/diff
```

**Step 2: Add new message types to types.ts**

In `src/shared/types.ts`:

Add the `DiffLine` interface after the existing interfaces:

```ts
export interface DiffLine {
  type: 'context' | 'added' | 'removed';
  content: string;
}
```

Add to `WebviewMessage` union:

```ts
| { type: 'applyToFile'; code: string; language: string; filename?: string }
| { type: 'confirmApply'; fileUri: string }
```

Add to `ExtensionMessage` union:

```ts
| { type: 'showDiff'; lines: DiffLine[]; filename: string; fileUri: string }
```

**Step 3: Run all tests**

```bash
npm test
```
Expected: all 118 tests pass.

**Step 4: Commit**

```bash
git add src/shared/types.ts package.json package-lock.json
git commit -m "feat: add applyToFile/showDiff/confirmApply message types and diff dependency"
```

---

## Task 6: Webview — parse filename from fence + Apply button in CodeBlock

**Files:**
- Modify: `webview/src/components/ChatMessage.tsx`
- Modify: `webview/src/components/CodeBlock.tsx`

**Step 1: Update parseContent to extract filename from fence info**

In `webview/src/components/ChatMessage.tsx`:

Update the `ContentPart` interface to add `filename`:

```ts
interface ContentPart {
  type: 'text' | 'code';
  content: string;
  language?: string;
  filename?: string;
}
```

Update the `codeBlockRegex` and parsing logic inside `parseContent`. Replace the regex and the code-part push:

Old regex: `/```(\w*)\n([\s\S]*?)```/g`

New regex and parsing (replace the entire `while` block):

```ts
const codeBlockRegex = /```([\w]*)([^\n]*)\n([\s\S]*?)```/g;
let lastIndex = 0;
let match;

while ((match = codeBlockRegex.exec(content)) !== null) {
  if (match.index > lastIndex) {
    parts.push({ type: 'text', content: content.slice(lastIndex, match.index) });
  }
  const language = match[1] || undefined;
  const filename = match[2].trim() || undefined;
  parts.push({ type: 'code', content: match[3].trim(), language, filename });
  lastIndex = match.index + match[0].length;
}
```

Update the `CodeBlock` render call to pass `filename`:

```tsx
<CodeBlock code={part.content} language={part.language} filename={part.filename} />
```

**Step 2: Add Apply button to CodeBlock**

In `webview/src/components/CodeBlock.tsx`, update the props interface and add the Apply button:

```tsx
import { Component } from 'solid-js';
import { getVsCodeApi } from '../utils/vscode-api';

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
}

const CodeBlock: Component<CodeBlockProps> = (props) => {
  const copyCode = () => {
    navigator.clipboard.writeText(props.code);
  };

  const insertAtCursor = () => {
    getVsCodeApi().postMessage({
      type: 'insertCode',
      code: props.code,
    });
  };

  const applyToFile = () => {
    getVsCodeApi().postMessage({
      type: 'applyToFile',
      code: props.code,
      language: props.language || '',
      filename: props.filename,
    });
  };

  return (
    <div class="code-block">
      <div class="code-block-header">
        <span class="code-block-lang">
          {props.filename ? `${props.language || 'text'} — ${props.filename}` : (props.language || 'text')}
        </span>
        <div class="code-block-actions">
          <button onClick={copyCode} title="Copy">Copy</button>
          <button onClick={insertAtCursor} title="Insert at cursor">Insert</button>
          <button onClick={applyToFile} title="Apply to file">Apply</button>
        </div>
      </div>
      <pre>
        <code class={`language-${props.language || ''}`}>{props.code}</code>
      </pre>
    </div>
  );
};

export default CodeBlock;
```

**Step 3: Build webview to confirm no TypeScript errors**

```bash
npm run build:webview 2>&1 | head -20
```
Expected: no errors.

**Step 4: Run all tests**

```bash
npm test
```
Expected: all 118 tests pass.

**Step 5: Commit**

```bash
git add webview/src/components/ChatMessage.tsx webview/src/components/CodeBlock.tsx
git commit -m "feat: parse filename from code fence and add Apply to file button"
```

---

## Task 7: Extension — applyToFile handler (file resolution + hunk counting)

**Files:**
- Modify: `src/chat/message-handler.ts`
- Test: `src/chat/message-handler.test.ts`

**Step 1: Write failing tests**

In `src/chat/message-handler.test.ts`, add a new `describe` block at the end. First, add a mock for `vscode.workspace.fs` and `vscode.window.showOpenDialog` and `vscode.commands.executeCommand` (already mocked). Also update the vscode mock at the top to include `fs`:

Find the `vi.mock('vscode', ...)` block and add to `workspace`:
```ts
fs: {
  readFile: vi.fn(),
  stat: vi.fn(),
  writeFile: vi.fn(),
},
```

And to `window`:
```ts
showOpenDialog: vi.fn(),
showInformationMessage: vi.fn(),
```

And add `WorkspaceEdit`, `Position`, `Range`, `Uri` to the mock if not already present:
```ts
WorkspaceEdit: class {
  replace = vi.fn();
  createFile = vi.fn();
  insert = vi.fn();
},
Position: class { constructor(public line: number, public character: number) {} },
Range: class { constructor(public start: any, public end: any) {} },
Uri: {
  parse: (s: string) => ({ toString: () => s, fsPath: s }),
  joinPath: (base: any, ...p: string[]) => ({ toString: () => base.toString() + '/' + p.join('/'), fsPath: base.fsPath + '/' + p.join('/') }),
},
workspace: {
  // ... existing mocks ...
  workspaceFolders: [{ uri: { fsPath: '/workspace', toString: () => 'file:///workspace' } }],
  applyEdit: vi.fn().mockResolvedValue(true),
  openTextDocument: vi.fn().mockResolvedValue({ lineCount: 10, uri: { toString: () => 'file:///test.ts' } }),
  fs: {
    readFile: vi.fn(),
    stat: vi.fn(),
    writeFile: vi.fn(),
  },
},
```

Then add the test block:

```ts
describe('applyToFile', () => {
  let applyHandler: MessageHandler;

  beforeEach(() => {
    applyHandler = new MessageHandler(
      mockClient as unknown as OpenRouterClient,
      mockContextBuilder as unknown as ContextBuilder,
      mockSettings as unknown as Settings,
    );
  });

  it('should post showDiff with diff lines for a single-hunk change', async () => {
    const { workspace } = await import('vscode');
    (workspace.fs.readFile as any).mockResolvedValue(
      new TextEncoder().encode('const x = 1;\n')
    );
    (workspace.fs.stat as any).mockResolvedValue({});
    (workspace.openTextDocument as any).mockResolvedValue({
      lineCount: 1,
      uri: { toString: () => 'file:///workspace/src/foo.ts' },
    });

    await applyHandler.handleMessage(
      { type: 'applyToFile', code: 'const x = 2;\n', language: 'ts', filename: 'src/foo.ts' },
      postMessage
    );

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'showDiff' })
    );
    const call = postMessage.mock.calls.find((c: any[]) => c[0].type === 'showDiff');
    expect(call[0].lines).toBeInstanceOf(Array);
    expect(call[0].filename).toContain('foo.ts');
  });

  it('should open file picker when no filename is provided', async () => {
    const { window } = await import('vscode');
    (window.showOpenDialog as any).mockResolvedValue(undefined);

    await applyHandler.handleMessage(
      { type: 'applyToFile', code: 'const x = 2;', language: 'ts' },
      postMessage
    );

    expect(window.showOpenDialog).toHaveBeenCalled();
  });

  it('should apply file on confirmApply', async () => {
    const { workspace } = await import('vscode');
    (workspace.fs.readFile as any).mockResolvedValue(
      new TextEncoder().encode('const x = 1;\n')
    );
    (workspace.fs.stat as any).mockResolvedValue({});
    (workspace.openTextDocument as any).mockResolvedValue({
      lineCount: 1,
      uri: { toString: () => 'file:///workspace/src/foo.ts' },
    });

    // First trigger apply to put code in pendingApply
    await applyHandler.handleMessage(
      { type: 'applyToFile', code: 'const x = 2;\n', language: 'ts', filename: 'src/foo.ts' },
      postMessage
    );

    const diffMsg = postMessage.mock.calls.find((c: any[]) => c[0].type === 'showDiff');
    const fileUri = diffMsg[0].fileUri;

    // Then confirm
    await applyHandler.handleMessage(
      { type: 'confirmApply', fileUri },
      postMessage
    );

    expect(workspace.applyEdit).toHaveBeenCalled();
  });
});
```

**Step 2: Run to confirm failure**

```bash
npm test -- --reporter=verbose src/chat/message-handler.test.ts
```
Expected: 3 new tests fail.

**Step 3: Implement applyToFile in MessageHandler**

In `src/chat/message-handler.ts`, add the import:

```ts
import * as vscode from 'vscode';
import * as Diff from 'diff';
import type { DiffLine } from '../shared/types';
```

Add `pendingApply` field to the class:

```ts
private pendingApply = new Map<string, string>(); // fileUri string → proposed code
```

Add to the `handleMessage` switch (before the closing `}`):

```ts
case 'applyToFile':
  await this.handleApplyToFile(message.code, message.language, message.filename, postMessage);
  break;
case 'confirmApply':
  await this.handleConfirmApply(message.fileUri);
  break;
```

Add the private methods:

```ts
private async handleApplyToFile(
  code: string,
  language: string,
  filename: string | undefined,
  postMessage: (msg: ExtensionMessage) => void
): Promise<void> {
  let fileUri: vscode.Uri | undefined;

  if (filename) {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      const candidate = vscode.Uri.joinPath(folders[0].uri, filename);
      try {
        await vscode.workspace.fs.stat(candidate);
        fileUri = candidate;
      } catch {
        // file not found — fall through to picker
      }
    }
  }

  if (!fileUri) {
    const picked = await vscode.window.showOpenDialog({ canSelectMany: false, openLabel: 'Apply to this file' });
    if (!picked || picked.length === 0) return;
    fileUri = picked[0];
  }

  let originalContent = '';
  try {
    const bytes = await vscode.workspace.fs.readFile(fileUri);
    originalContent = new TextDecoder().decode(bytes);
  } catch { /* new file */ }

  const hunks = this.countHunks(originalContent, code);
  const uriStr = fileUri.toString();

  if (hunks <= 1) {
    const lines = this.computeDiffLines(originalContent, code);
    this.pendingApply.set(uriStr, code);
    postMessage({ type: 'showDiff', lines, filename: fileUri.fsPath, fileUri: uriStr });
  } else {
    await this.showNativeDiff(fileUri, originalContent, code, language);
  }
}

private countHunks(original: string, proposed: string): number {
  if (!original.trim()) return 0;
  const changes = Diff.diffLines(original, proposed);
  let hunks = 0;
  let inHunk = false;
  for (const part of changes) {
    if (part.added || part.removed) {
      if (!inHunk) { hunks++; inHunk = true; }
    } else {
      inHunk = false;
    }
  }
  return hunks;
}

private computeDiffLines(original: string, proposed: string): DiffLine[] {
  const changes = Diff.diffLines(original, proposed);
  const lines: DiffLine[] = [];
  for (const part of changes) {
    const type = part.added ? 'added' : part.removed ? 'removed' : 'context';
    const partLines = part.value.split('\n');
    if (partLines[partLines.length - 1] === '') partLines.pop();
    for (const line of partLines) {
      lines.push({ type, content: line });
    }
  }
  return lines;
}

private async showNativeDiff(
  fileUri: vscode.Uri,
  _originalContent: string,
  code: string,
  language: string
): Promise<void> {
  const proposedDoc = await vscode.workspace.openTextDocument({ content: code, language });
  const filename = fileUri.path.split('/').pop() ?? fileUri.fsPath;
  await vscode.commands.executeCommand('vscode.diff', fileUri, proposedDoc.uri, `Review changes: ${filename}`);
  const choice = await vscode.window.showInformationMessage(
    `Apply changes to ${filename}?`,
    'Apply',
    'Discard'
  );
  if (choice === 'Apply') {
    await this.applyEdit(fileUri, code);
  }
}

private async handleConfirmApply(fileUri: string): Promise<void> {
  const code = this.pendingApply.get(fileUri);
  if (!code) return;
  this.pendingApply.delete(fileUri);
  await this.applyEdit(vscode.Uri.parse(fileUri), code);
}

private async applyEdit(fileUri: vscode.Uri, code: string): Promise<void> {
  const edit = new vscode.WorkspaceEdit();
  try {
    const doc = await vscode.workspace.openTextDocument(fileUri);
    const fullRange = new vscode.Range(
      new vscode.Position(0, 0),
      new vscode.Position(doc.lineCount, 0)
    );
    edit.replace(fileUri, fullRange, code);
  } catch {
    edit.createFile(fileUri, { overwrite: true });
    edit.insert(fileUri, new vscode.Position(0, 0), code);
  }
  await vscode.workspace.applyEdit(edit);
  const doc = await vscode.workspace.openTextDocument(fileUri);
  await vscode.window.showTextDocument(doc);
}
```

**Step 4: Run all tests**

```bash
npm test
```
Expected: all 121 tests pass (118 existing + 3 new).

**Step 5: Commit**

```bash
git add src/chat/message-handler.ts src/chat/message-handler.test.ts
git commit -m "feat: implement applyToFile handler with hunk counting and dual diff paths"
```

---

## Task 8: Webview — DiffView component + showDiff handler

**Files:**
- Create: `webview/src/components/DiffView.tsx`
- Modify: `webview/src/App.tsx`
- Modify: `webview/src/stores/chat.ts` (add diffState)

**Step 1: Create DiffView component**

Create `webview/src/components/DiffView.tsx`:

```tsx
import { Component, For } from 'solid-js';
import { getVsCodeApi } from '../utils/vscode-api';

export interface DiffLine {
  type: 'context' | 'added' | 'removed';
  content: string;
}

interface DiffViewProps {
  lines: DiffLine[];
  filename: string;
  fileUri: string;
  onDismiss: () => void;
}

const DiffView: Component<DiffViewProps> = (props) => {
  const apply = () => {
    getVsCodeApi().postMessage({ type: 'confirmApply', fileUri: props.fileUri });
    props.onDismiss();
  };

  return (
    <div class="diff-view">
      <div class="diff-header">
        <span class="diff-filename">{props.filename.split(/[\\/]/).pop()}</span>
        <div class="diff-actions">
          <button class="diff-apply" onClick={apply}>Apply</button>
          <button class="diff-discard" onClick={props.onDismiss}>Discard</button>
        </div>
      </div>
      <pre class="diff-content">
        <For each={props.lines}>
          {(line) => (
            <div class={`diff-line diff-line--${line.type}`}>
              <span class="diff-marker">
                {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
              </span>
              <span>{line.content}</span>
            </div>
          )}
        </For>
      </pre>
    </div>
  );
};

export default DiffView;
```

**Step 2: Add diffState signal to chat store**

In `webview/src/stores/chat.ts`, add inside `createChatStore()`:

```ts
interface DiffState {
  lines: Array<{ type: 'context' | 'added' | 'removed'; content: string }>;
  filename: string;
  fileUri: string;
}

const [diffState, setDiffState] = createSignal<DiffState | null>(null);
```

Expose in the return object:
```ts
diffState,
setDiffState,
```

**Step 3: Handle showDiff in App.tsx**

In `webview/src/App.tsx`:

Add import:
```ts
import DiffView from './components/DiffView';
```

In the `window.addEventListener` switch, add:
```ts
case 'showDiff':
  chatStore.setDiffState({
    lines: message.lines,
    filename: message.filename,
    fileUri: message.fileUri,
  });
  break;
```

In the JSX, add below the `messages` div and above `ChatInput`:

```tsx
<Show when={chatStore.diffState()}>
  {(state) => (
    <DiffView
      lines={state().lines}
      filename={state().filename}
      fileUri={state().fileUri}
      onDismiss={() => chatStore.setDiffState(null)}
    />
  )}
</Show>
```

**Step 4: Build webview**

```bash
npm run build:webview 2>&1 | head -20
```
Expected: no TypeScript errors.

**Step 5: Run all tests**

```bash
npm test
```
Expected: all 121 tests pass.

**Step 6: Commit**

```bash
git add webview/src/components/DiffView.tsx webview/src/App.tsx webview/src/stores/chat.ts
git commit -m "feat: add DiffView component and showDiff handler for inline diff preview"
```

---

## Task 9: Update features.md and final build check

**Files:**
- Modify: `docs/features.md`

**Step 1: Mark the three features as implemented in features.md**

In `docs/features.md`, in the Prioritized Backlog P1 section, change these rows from `:construction:` to `:white_check_mark:` with a `~~strikethrough~~` on the name and a brief "Fixed —" description:

- `Apply to file` → `:white_check_mark: | ~~Apply to file~~ | Fixed — Apply button on code blocks; inline diff for ≤1 hunk, native diff editor for 2+ hunks`
- `Diff preview & approval` → `:white_check_mark: | ~~Diff preview & approval~~ | Fixed — inline DiffView with Apply/Discard; native diff + notification for multi-hunk changes`
- `Context menu actions` → `:white_check_mark: | ~~Context menu actions~~ | Fixed — Explain/Fix/Improve submenus on selected code, append or new chat`
- `Custom instructions file` → `:white_check_mark: | ~~Custom instructions file~~ | Fixed — loads .openrouter-instructions.md or .cursorrules from workspace root into system prompt`

Also update the `Chat Panel` section: change `:construction: | Apply to file` to `:white_check_mark: | Apply to file | Apply code block as a WorkspaceEdit to the referenced or user-selected file | 1`

**Step 2: Full build check**

```bash
npm run build 2>&1 | tail -5
```
Expected: `Build complete.` with no errors.

**Step 3: Run all tests one final time**

```bash
npm test
```
Expected: 121 tests pass across 15 test files.

**Step 4: Commit**

```bash
git add docs/features.md
git commit -m "docs: mark custom instructions, context menu actions, and apply-to-file as implemented"
```
