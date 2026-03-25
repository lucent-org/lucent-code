# Diff Preview Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** For `replace_range` and `insert_code` GATED_TOOLS, compute an inline diff in the extension host and render it inside the `ToolCallCard` approval UI — so the user sees exactly what will change before clicking Allow or Deny.

**Architecture:** The extension host reads the file, applies the proposed change to an in-memory copy, diffs with `Diff.diffLines()` (already imported), trims to ±3-line context hunks, and passes the `DiffLine[]` through the existing `toolApprovalRequest` message. The webview's `ToolCallCard` renders the existing `DiffView` component when `diff` is present, falling back to the args JSON dump when it is absent. `DiffView` gains a `readOnly` prop to hide its Apply/Discard buttons in this context.

**Tech Stack:** TypeScript, VS Code extension API (`vscode.workspace.fs`), `diff` npm package, SolidJS, Vitest

---

### Task 1: Add `diff` field to shared types

**Files:**
- Modify: `src/shared/types.ts`

**Step 1: Write the failing test**

In `src/chat/message-handler.test.ts`, at the top of the HITL tool approval describe block, add:

```typescript
it('toolApprovalRequest for replace_range includes a diff field', async () => {
  const toolStream = createToolCallStream([
    {
      id: 'call_1',
      name: 'replace_range',
      arguments: JSON.stringify({
        uri: 'file:///test.ts',
        startLine: 0, startCharacter: 0,
        endLine: 0, endCharacter: 5,
        code: 'hello',
      }),
    },
  ]);
  const stopStream = createMockStream([
    { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] },
  ]);
  mockClient.chatStream
    .mockReturnValueOnce(toolStream)
    .mockReturnValueOnce(stopStream);
  mockToolExecutor.execute.mockResolvedValue({ success: true, message: 'OK' });

  const postMessages: ExtensionMessage[] = [];
  const sendPromise = handler.handleMessage(
    { type: 'sendMessage', content: 'replace', model: 'gpt-4' },
    (msg) => postMessages.push(msg)
  );

  await vi.waitFor(() => {
    expect(postMessages.some((m) => m.type === 'toolApprovalRequest')).toBe(true);
  }, { timeout: 1000 });

  const req = postMessages.find((m) => m.type === 'toolApprovalRequest') as Extract<ExtensionMessage, { type: 'toolApprovalRequest' }>;
  // diff is present (even if undefined — the field must exist in the type)
  expect('diff' in req).toBe(true);

  await handler.handleMessage({ type: 'toolApprovalResponse', requestId: req.requestId, approved: true }, () => {});
  await sendPromise;
});
```

**Step 2: Run test to verify it fails**

```
npx vitest run src/chat/message-handler.test.ts --reporter=verbose
```

Expected: FAIL — TypeScript error: Property 'diff' does not exist on type `{ type: 'toolApprovalRequest'; ... }`

**Step 3: Add `diff?: DiffLine[]` to `toolApprovalRequest` in `src/shared/types.ts`**

Change line 103 from:
```typescript
  | { type: 'toolApprovalRequest'; requestId: string; toolName: string; args: Record<string, unknown> }
```
to:
```typescript
  | { type: 'toolApprovalRequest'; requestId: string; toolName: string; args: Record<string, unknown>; diff?: DiffLine[] }
```

**Step 4: Run test to verify it passes**

```
npx vitest run src/chat/message-handler.test.ts --reporter=verbose
```

Expected: The new test passes (diff is `undefined` until Task 2, but the field exists on the type). All existing tests still pass.

**Step 5: Commit**

```bash
git add src/shared/types.ts src/chat/message-handler.test.ts
git commit -m "test: add diff field check to toolApprovalRequest type"
```

---

### Task 2: Implement `computeToolDiff` in `MessageHandler`

**Files:**
- Modify: `src/chat/message-handler.ts`
- Modify: `src/chat/message-handler.test.ts`

The `replace_range` arg for replacement text is called `code` (not `newText`) — confirmed from `editor-tools.ts`.

**Step 1: Write the four failing tests**

Add to the HITL tool approval describe block in `src/chat/message-handler.test.ts`:

```typescript
describe('computeToolDiff', () => {
  beforeEach(() => {
    // Mock vscode.workspace.fs.readFile to return known content
    vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
      new TextEncoder().encode('line0\nline1\nline2\n')
    );
  });

  it('replace_range approval request includes non-empty diff', async () => {
    const toolStream = createToolCallStream([
      {
        id: 'call_1',
        name: 'replace_range',
        arguments: JSON.stringify({
          uri: 'file:///test.ts',
          startLine: 1, startCharacter: 0,
          endLine: 1, endCharacter: 5,
          code: 'REPLACED',
        }),
      },
    ]);
    const stopStream = createMockStream([
      { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] },
    ]);
    mockClient.chatStream
      .mockReturnValueOnce(toolStream)
      .mockReturnValueOnce(stopStream);
    mockToolExecutor.execute.mockResolvedValue({ success: true, message: 'OK' });

    const postMessages: ExtensionMessage[] = [];
    const sendPromise = handler.handleMessage(
      { type: 'sendMessage', content: 'replace', model: 'gpt-4' },
      (msg) => postMessages.push(msg)
    );

    await vi.waitFor(() => {
      expect(postMessages.some((m) => m.type === 'toolApprovalRequest')).toBe(true);
    }, { timeout: 1000 });

    const req = postMessages.find((m) => m.type === 'toolApprovalRequest') as Extract<ExtensionMessage, { type: 'toolApprovalRequest' }>;
    expect(req.diff).toBeDefined();
    expect(req.diff!.length).toBeGreaterThan(0);
    expect(req.diff!.some((l) => l.type === 'added')).toBe(true);
    expect(req.diff!.some((l) => l.type === 'removed')).toBe(true);

    await handler.handleMessage({ type: 'toolApprovalResponse', requestId: req.requestId, approved: true }, () => {});
    await sendPromise;
  });

  it('insert_code approval request includes non-empty diff', async () => {
    const toolStream = createToolCallStream([
      {
        id: 'call_1',
        name: 'insert_code',
        arguments: JSON.stringify({
          uri: 'file:///test.ts',
          line: 1, character: 0,
          code: '// inserted\n',
        }),
      },
    ]);
    const stopStream = createMockStream([
      { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] },
    ]);
    mockClient.chatStream
      .mockReturnValueOnce(toolStream)
      .mockReturnValueOnce(stopStream);
    mockToolExecutor.execute.mockResolvedValue({ success: true, message: 'OK' });

    const postMessages: ExtensionMessage[] = [];
    const sendPromise = handler.handleMessage(
      { type: 'sendMessage', content: 'insert', model: 'gpt-4' },
      (msg) => postMessages.push(msg)
    );

    await vi.waitFor(() => {
      expect(postMessages.some((m) => m.type === 'toolApprovalRequest')).toBe(true);
    }, { timeout: 1000 });

    const req = postMessages.find((m) => m.type === 'toolApprovalRequest') as Extract<ExtensionMessage, { type: 'toolApprovalRequest' }>;
    expect(req.diff).toBeDefined();
    expect(req.diff!.some((l) => l.type === 'added')).toBe(true);

    await handler.handleMessage({ type: 'toolApprovalResponse', requestId: req.requestId, approved: true }, () => {});
    await sendPromise;
  });

  it('file read failure → diff is undefined in approval request', async () => {
    vi.mocked(vscode.workspace.fs.readFile).mockRejectedValue(new Error('File not found'));

    const toolStream = createToolCallStream([
      {
        id: 'call_1',
        name: 'replace_range',
        arguments: JSON.stringify({
          uri: 'file:///missing.ts',
          startLine: 0, startCharacter: 0,
          endLine: 0, endCharacter: 3,
          code: 'new',
        }),
      },
    ]);
    const stopStream = createMockStream([
      { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] },
    ]);
    mockClient.chatStream
      .mockReturnValueOnce(toolStream)
      .mockReturnValueOnce(stopStream);
    mockToolExecutor.execute.mockResolvedValue({ success: true, message: 'OK' });

    const postMessages: ExtensionMessage[] = [];
    const sendPromise = handler.handleMessage(
      { type: 'sendMessage', content: 'replace', model: 'gpt-4' },
      (msg) => postMessages.push(msg)
    );

    await vi.waitFor(() => {
      expect(postMessages.some((m) => m.type === 'toolApprovalRequest')).toBe(true);
    }, { timeout: 1000 });

    const req = postMessages.find((m) => m.type === 'toolApprovalRequest') as Extract<ExtensionMessage, { type: 'toolApprovalRequest' }>;
    expect(req.diff).toBeUndefined();

    await handler.handleMessage({ type: 'toolApprovalResponse', requestId: req.requestId, approved: true }, () => {});
    await sendPromise;
  });

  it('rename_symbol approval request does NOT include diff', async () => {
    const toolStream = createToolCallStream([
      {
        id: 'call_1',
        name: 'rename_symbol',
        arguments: JSON.stringify({ uri: 'file:///test.ts', line: 0, character: 0, newName: 'foo' }),
      },
    ]);
    const stopStream = createMockStream([
      { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] },
    ]);
    mockClient.chatStream
      .mockReturnValueOnce(toolStream)
      .mockReturnValueOnce(stopStream);
    mockToolExecutor.execute.mockResolvedValue({ success: true, message: 'OK' });

    const postMessages: ExtensionMessage[] = [];
    const sendPromise = handler.handleMessage(
      { type: 'sendMessage', content: 'rename', model: 'gpt-4' },
      (msg) => postMessages.push(msg)
    );

    await vi.waitFor(() => {
      expect(postMessages.some((m) => m.type === 'toolApprovalRequest')).toBe(true);
    }, { timeout: 1000 });

    const req = postMessages.find((m) => m.type === 'toolApprovalRequest') as Extract<ExtensionMessage, { type: 'toolApprovalRequest' }>;
    expect(req.diff).toBeUndefined();

    await handler.handleMessage({ type: 'toolApprovalResponse', requestId: req.requestId, approved: true }, () => {});
    await sendPromise;
  });
});
```

**Step 2: Run tests to verify they fail**

```
npx vitest run src/chat/message-handler.test.ts --reporter=verbose
```

Expected: The 3 diff-present tests FAIL (diff is undefined); the rename test PASSES already.

**Step 3: Implement `computeToolDiff` and update `requestToolApproval`**

In `src/chat/message-handler.ts`, add this private method (before `requestToolApproval`):

```typescript
private async computeToolDiff(
  toolName: string,
  args: Record<string, unknown>
): Promise<DiffLine[] | undefined> {
  if (toolName !== 'replace_range' && toolName !== 'insert_code') return undefined;

  try {
    const uri = args['uri'];
    if (typeof uri !== 'string') return undefined;

    const vsUri = vscode.Uri.parse(uri);
    const bytes = await vscode.workspace.fs.readFile(vsUri);
    const original = new TextDecoder().decode(bytes);
    const lines = original.split('\n');

    let modified: string;

    if (toolName === 'replace_range') {
      const startLine = args['startLine'] as number;
      const startChar = args['startCharacter'] as number;
      const endLine = args['endLine'] as number;
      const endChar = args['endCharacter'] as number;
      const code = args['code'] as string;

      if (
        typeof startLine !== 'number' || typeof startChar !== 'number' ||
        typeof endLine !== 'number' || typeof endChar !== 'number' ||
        typeof code !== 'string'
      ) return undefined;

      // Rebuild as flat string, splice the range, reassemble
      const before = lines.slice(0, startLine).join('\n');
      const startLineText = lines[startLine] ?? '';
      const endLineText = lines[endLine] ?? '';
      const prefix = startLineText.slice(0, startChar);
      const suffix = endLineText.slice(endChar);
      const after = lines.slice(endLine + 1).join('\n');
      const parts = [before, before ? '\n' : '', prefix, code, suffix, after ? '\n' : '', after].filter(Boolean);
      modified = parts.join('');
      // Simpler reconstruction: join prefix+code+suffix as the replaced region
      const beforeLines = lines.slice(0, startLine).join('\n');
      const afterLines = lines.slice(endLine + 1).join('\n');
      const middle = prefix + code + suffix;
      modified = [beforeLines, beforeLines ? '\n' : '', middle, afterLines ? '\n' : '', afterLines]
        .filter((s) => s !== '')
        .join('');
    } else {
      // insert_code
      const line = args['line'] as number;
      const character = args['character'] as number;
      const code = args['code'] as string;

      if (typeof line !== 'number' || typeof character !== 'number' || typeof code !== 'string') {
        return undefined;
      }

      const targetLine = lines[line] ?? '';
      const newLine = targetLine.slice(0, character) + code + targetLine.slice(character);
      const newLines = [...lines.slice(0, line), newLine, ...lines.slice(line + 1)];
      modified = newLines.join('\n');
    }

    const rawDiff = Diff.diffLines(original, modified);

    // Map to DiffLine[] with ±3 lines of context per changed hunk
    const CONTEXT = 3;
    const result: DiffLine[] = [];
    let contextBuf: string[] = [];

    for (const part of rawDiff) {
      const partLines = part.value.replace(/\n$/, '').split('\n');
      if (part.added) {
        // Flush up to last CONTEXT context lines
        const ctx = contextBuf.slice(-CONTEXT);
        for (const l of ctx) result.push({ type: 'context', content: l });
        contextBuf = [];
        for (const l of partLines) result.push({ type: 'added', content: l });
      } else if (part.removed) {
        const ctx = contextBuf.slice(-CONTEXT);
        for (const l of ctx) result.push({ type: 'context', content: l });
        contextBuf = [];
        for (const l of partLines) result.push({ type: 'removed', content: l });
      } else {
        // Context — keep in buffer; flush leading CONTEXT lines after a changed hunk
        if (result.length > 0) {
          const leading = partLines.slice(0, CONTEXT);
          for (const l of leading) result.push({ type: 'context', content: l });
          contextBuf = partLines.slice(CONTEXT);
        } else {
          contextBuf.push(...partLines);
        }
      }
    }

    return result.length > 0 ? result : undefined;
  } catch {
    return undefined;
  }
}
```

Update `requestToolApproval` to accept and forward `diff`:

```typescript
private requestToolApproval(
  toolName: string,
  args: Record<string, unknown>,
  postMessage: (msg: ExtensionMessage) => void,
  diff?: DiffLine[]
): Promise<boolean> {
  const requestId = `approval-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve) => {
    this.pendingApprovals.set(requestId, resolve);
    postMessage({ type: 'toolApprovalRequest', requestId, toolName, args, diff });
  });
}
```

Update the call site (line ~285) from:
```typescript
const approved = await this.requestToolApproval(tc.function.name, args, postMessage);
```
to:
```typescript
const diff = await this.computeToolDiff(tc.function.name, args);
const approved = await this.requestToolApproval(tc.function.name, args, postMessage, diff);
```

Also add the `DiffLine` import at the top of the file (import from `@shared` or `../shared/types`):
```typescript
import type { DiffLine } from '../shared/types';
```

**Step 4: Run tests to verify they pass**

```
npx vitest run src/chat/message-handler.test.ts --reporter=verbose
```

Expected: All 4 new tests PASS. All existing tests still pass.

**Step 5: Commit**

```bash
git add src/chat/message-handler.ts src/chat/message-handler.test.ts
git commit -m "feat: compute inline diff for replace_range and insert_code approvals"
```

---

### Task 3: Add `readOnly` prop to `DiffView`

**Files:**
- Modify: `webview/src/components/DiffView.tsx`

This is a pure component change — no new tests needed (DiffView has no unit tests; it's covered by manual/regression testing).

**Step 1: Add the `readOnly` prop**

In `webview/src/components/DiffView.tsx`, update the interface and component:

```typescript
interface DiffViewProps {
  lines: DiffLine[];
  filename: string;
  fileUri: string;
  onDismiss: () => void;
  readOnly?: boolean;
}
```

Wrap the Apply/Discard buttons with `<Show when={!props.readOnly}>`:

```typescript
<Show when={!props.readOnly}>
  <div class="diff-actions">
    <button class="diff-apply" onClick={apply}>Apply</button>
    <button class="diff-discard" onClick={props.onDismiss}>Discard</button>
  </div>
</Show>
```

**Step 2: Run all tests to ensure no regression**

```
npx vitest run --reporter=verbose
```

Expected: All tests pass (no tests depend on DiffView buttons).

**Step 3: Commit**

```bash
git add webview/src/components/DiffView.tsx
git commit -m "feat: add readOnly prop to DiffView to hide Apply/Discard buttons"
```

---

### Task 4: Add `diff` field to `ToolApprovalData` and update `ToolCallCard`

**Files:**
- Modify: `webview/src/components/ToolCallCard.tsx`

**Step 1: Update `ToolApprovalData` and render `DiffView` when diff is present**

Replace the entire content of `webview/src/components/ToolCallCard.tsx`:

```typescript
import { Component, Show } from 'solid-js';
import DiffView from './DiffView';
import type { DiffLine } from './DiffView';

export interface ToolApprovalData {
  requestId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: 'pending' | 'approved' | 'denied';
  diff?: DiffLine[];
}

interface ToolCallCardProps {
  approval: ToolApprovalData;
  onRespond: (requestId: string, approved: boolean) => void;
}

const ToolCallCard: Component<ToolCallCardProps> = (props) => {
  const argsPreview = () => {
    const entries = Object.entries(props.approval.args);
    return entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
  };

  const filename = () => {
    const uri = props.approval.args['uri'];
    return typeof uri === 'string' ? uri : '';
  };

  return (
    <div class={`tool-call-card tool-call-card--${props.approval.status}`}>
      <div class="tool-call-header">
        <span class="tool-call-icon">🔧</span>
        <span class="tool-call-name">{props.approval.toolName}</span>
        <Show when={props.approval.status !== 'pending'}>
          <span class={`tool-call-badge tool-call-badge--${props.approval.status}`}>
            {props.approval.status === 'approved' ? 'Allowed' : 'Denied'}
          </span>
        </Show>
      </div>
      <Show
        when={props.approval.diff}
        fallback={<pre class="tool-call-args">{argsPreview()}</pre>}
      >
        {(diff) => (
          <DiffView
            lines={diff()}
            filename={filename()}
            fileUri={filename()}
            onDismiss={() => {}}
            readOnly
          />
        )}
      </Show>
      <Show when={props.approval.status === 'pending'}>
        <div class="tool-call-actions">
          <button
            class="tool-call-btn tool-call-btn--allow"
            onClick={() => props.onRespond(props.approval.requestId, true)}
          >
            Allow
          </button>
          <button
            class="tool-call-btn tool-call-btn--deny"
            onClick={() => props.onRespond(props.approval.requestId, false)}
          >
            Deny
          </button>
        </div>
      </Show>
    </div>
  );
};

export default ToolCallCard;
```

**Step 2: Run all tests**

```
npx vitest run --reporter=verbose
```

Expected: All tests pass.

**Step 3: Commit**

```bash
git add webview/src/components/ToolCallCard.tsx
git commit -m "feat: render DiffView in ToolCallCard when diff is present"
```

---

### Task 5: Thread `diff` through `chat.ts` store

**Files:**
- Modify: `webview/src/stores/chat.ts`

**Step 1: Update `toolApproval` field type and `handleToolApprovalRequest`**

In the `ChatMessage` interface in `chat.ts`, add `diff?: DiffLine[]` to `toolApproval`:

```typescript
toolApproval?: {
  requestId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: 'pending' | 'approved' | 'denied';
  diff?: DiffLine[];
};
```

Update `handleToolApprovalRequest` to accept and store `diff`:

```typescript
function handleToolApprovalRequest(
  requestId: string,
  toolName: string,
  args: Record<string, unknown>,
  diff?: DiffLine[]
) {
  setMessages((prev) => [
    ...prev,
    {
      role: 'tool_approval' as const,
      content: '',
      toolApproval: { requestId, toolName, args, status: 'pending' as const, diff },
    },
  ]);
}
```

Also update the `DiffLine` import at the top of `chat.ts`. Currently it imports from `'../components/DiffView'` — this stays the same.

Find where `handleToolApprovalRequest` is called (in `App.tsx` or wherever the webview message handler lives) and update the call to pass `msg.diff`:

```typescript
case 'toolApprovalRequest':
  handleToolApprovalRequest(msg.requestId, msg.toolName, msg.args, msg.diff);
  break;
```

**Step 2: Run all tests**

```
npx vitest run --reporter=verbose
```

Expected: All tests pass.

**Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit -p webview/tsconfig.json
npx tsc --noEmit -p tsconfig.json
```

Expected: No type errors.

**Step 4: Commit**

```bash
git add webview/src/stores/chat.ts
git commit -m "feat: pass diff through chat store to ToolCallCard"
```

---

### Task 6: Final verification

**Step 1: Run all tests**

```
npx vitest run --reporter=verbose
```

Expected: All tests pass (≥259 — 255 existing + 4 new diff tests).

**Step 2: Build extension and webview**

```bash
npm run compile
```

Expected: No errors.

**Step 3: Smoke check the call site for `handleToolApprovalRequest` in App.tsx**

Search for where the webview dispatches the message to `handleToolApprovalRequest` and ensure `msg.diff` is being passed. Grep for `toolApprovalRequest` in `webview/src/` and confirm.

**Step 4: Commit any final fixes**

If anything was missed during compile, fix and commit:

```bash
git add -p
git commit -m "fix: address compile issues in diff preview implementation"
```
