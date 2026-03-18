# Autonomous Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Gate MCP tool calls behind the existing approval UI and add an autonomous mode that bypasses all approval gates (both editor and MCP tools), surfaced as a VS Code setting and a per-session toolbar button.

**Architecture:** `_autonomousMode` boolean on `MessageHandler` — initialized from `settings.autonomousMode`, flippable per-session via a `setAutonomousMode` webview message. When true, skips `requestToolApproval` for both GATED_TOOLS and `mcp__`-prefixed calls. Toolbar button (`⚡`) reflects current state as an active CSS class.

**Tech Stack:** TypeScript (extension), SolidJS (webview), Vitest

---

### Task 1: `autonomousMode` getter in Settings

**Files:**
- Modify: `src/core/settings.ts`
- Modify: `src/core/settings.test.ts`

**Step 1: Write the failing test**

In `src/core/settings.test.ts`, add to the `configValues` dict and add two new tests inside `describe('Settings')`:

```typescript
// In configValues dict, add:
'chat.autonomousMode': false,

// New tests:
it('should return false for autonomousMode by default', () => {
  expect(settings.autonomousMode).toBe(false);
});

it('should return true for autonomousMode when config is true', () => {
  // Override: the mock's get() returns configValues[key] ?? defaultValue
  // To test the true branch, temporarily patch configValues via the mock
  // Simplest: call get with key present in configValues as true
  // Use a fresh Settings with patched vi.mocked
  const { workspace } = await import('vscode');
  vi.mocked(workspace.getConfiguration).mockReturnValueOnce({
    get: vi.fn((key: string, defaultValue?: unknown) =>
      key === 'chat.autonomousMode' ? true : (configValues as any)[key] ?? defaultValue
    ),
    update: vi.fn(),
  } as any);
  const s2 = new Settings();
  expect(s2.autonomousMode).toBe(true);
});
```

> **Note:** Because the mock uses a module-level `configValues` dict, the cleanest approach is to use `mockReturnValueOnce` for the `true` test — same pattern used elsewhere in this file.

**Step 2: Run test to verify it fails**

```
npx vitest run src/core/settings.test.ts
```

Expected: FAIL — `settings.autonomousMode is not a function` (property doesn't exist yet)

**Step 3: Add getter to `src/core/settings.ts`**

After the existing `get skillSources()` getter (around line 50), add:

```typescript
get autonomousMode(): boolean {
  return this.config.get<boolean>('chat.autonomousMode', false);
}
```

**Step 4: Run tests to verify they pass**

```
npx vitest run src/core/settings.test.ts
```

Expected: all pass

**Step 5: Commit**

```bash
git add src/core/settings.ts src/core/settings.test.ts
git commit -m "feat: add autonomousMode getter to Settings"
```

---

### Task 2: `_autonomousMode` field and message handling in `MessageHandler`

**Files:**
- Modify: `src/chat/message-handler.ts`
- Modify: `src/chat/message-handler.test.ts`

**Step 1: Write four failing tests**

Find the `describe('MCP tool routing', ...)` block in `src/chat/message-handler.test.ts` (added in previous MCP feature) and add a new sibling `describe` block after it:

```typescript
describe('autonomous mode', () => {
  let mcpManager: McpClientManager;
  let postMessages: ExtensionMessage[];

  beforeEach(() => {
    mcpManager = {
      getTools: vi.fn().mockReturnValue([]),
      callTool: vi.fn().mockResolvedValue({ content: 'mcp result', isError: false }),
      getStatus: vi.fn().mockReturnValue({}),
      dispose: vi.fn(),
    } as unknown as McpClientManager;
    postMessages = [];
  });

  it('setAutonomousMode message updates _autonomousMode', async () => {
    const handler = new MessageHandler(
      mockClient as unknown as OpenRouterClient,
      mockContextBuilder as unknown as ContextBuilder,
      mockSettings as unknown as Settings,
      undefined, undefined, undefined, undefined, undefined,
      mcpManager,
    );
    // Before: MCP call requires approval (autonomous off by default)
    // Send setAutonomousMode = true
    await handler.handleMessage({ type: 'setAutonomousMode', enabled: true }, (m) => postMessages.push(m));
    // No error, no postMessage expected
    expect(postMessages.length).toBe(0);
  });

  it('MCP tool call, autonomous mode off → requestToolApproval called', async () => {
    const handler = new MessageHandler(
      mockClient as unknown as OpenRouterClient,
      mockContextBuilder as unknown as ContextBuilder,
      mockSettings as unknown as Settings,
      undefined, undefined, undefined, undefined, undefined,
      mcpManager,
    );

    mockClient.chatStream.mockReturnValue(
      createToolCallStream([{ id: 'call_1', name: 'mcp__fs__read', arguments: '{}' }])
    );

    const sendPromise = handler.handleMessage(
      { type: 'sendMessage', content: 'go', model: 'gpt-4' },
      (m) => postMessages.push(m)
    );

    await vi.waitFor(() => {
      expect(postMessages.some((m) => m.type === 'toolApprovalRequest')).toBe(true);
    }, { timeout: 1000 });

    const req = postMessages.find((m) => m.type === 'toolApprovalRequest') as Extract<ExtensionMessage, { type: 'toolApprovalRequest' }>;
    await handler.handleMessage({ type: 'toolApprovalResponse', requestId: req.requestId, approved: true }, () => {});
    await sendPromise;

    expect(mcpManager.callTool).toHaveBeenCalledWith('mcp__fs__read', {});
  });

  it('MCP tool call, autonomous mode on → callTool runs directly, no approval', async () => {
    const handler = new MessageHandler(
      mockClient as unknown as OpenRouterClient,
      mockContextBuilder as unknown as ContextBuilder,
      mockSettings as unknown as Settings,
      undefined, undefined, undefined, undefined, undefined,
      mcpManager,
    );

    await handler.handleMessage({ type: 'setAutonomousMode', enabled: true }, () => {});

    mockClient.chatStream.mockReturnValue(
      createToolCallStream([{ id: 'call_1', name: 'mcp__fs__read', arguments: '{}' }])
    );

    await handler.handleMessage(
      { type: 'sendMessage', content: 'go', model: 'gpt-4' },
      (m) => postMessages.push(m)
    );

    expect(postMessages.some((m) => m.type === 'toolApprovalRequest')).toBe(false);
    expect(mcpManager.callTool).toHaveBeenCalledWith('mcp__fs__read', {});
  });

  it('gated editor tool, autonomous mode on → executes directly, no approval', async () => {
    const handler = new MessageHandler(
      mockClient as unknown as OpenRouterClient,
      mockContextBuilder as unknown as ContextBuilder,
      mockSettings as unknown as Settings,
      mockToolExecutor as unknown as EditorToolExecutor,
      undefined, undefined, undefined, undefined,
      mcpManager,
    );

    await handler.handleMessage({ type: 'setAutonomousMode', enabled: true }, () => {});

    mockClient.chatStream.mockReturnValue(
      createToolCallStream([{ id: 'call_1', name: 'rename_symbol', arguments: '{"uri":"file:///test.ts","line":0,"character":0,"newName":"foo"}' }])
    );

    await handler.handleMessage(
      { type: 'sendMessage', content: 'rename it', model: 'gpt-4' },
      (m) => postMessages.push(m)
    );

    expect(postMessages.some((m) => m.type === 'toolApprovalRequest')).toBe(false);
    expect(mockToolExecutor.execute).toHaveBeenCalledWith('rename_symbol', expect.any(Object));
  });
});
```

**Step 2: Run tests to verify they fail**

```
npx vitest run src/chat/message-handler.test.ts --reporter=verbose 2>&1 | tail -30
```

Expected: 4 new tests fail (property/case doesn't exist yet)

**Step 3: Implement in `src/chat/message-handler.ts`**

3a. Add field after existing `private readonly skillMatcher` line (around line 28):

```typescript
private _autonomousMode = false;
```

3b. Add `setAutonomousMode` method after the constructor:

```typescript
setAutonomousMode(value: boolean): void {
  this._autonomousMode = value;
}
```

3c. Add case in `handleMessage` switch, after the `'toolApprovalResponse'` case:

```typescript
case 'setAutonomousMode':
  this.setAutonomousMode(message.enabled);
  break;
```

3d. In the MCP routing block (around line 246), wrap `callTool` behind approval when not autonomous:

Replace:
```typescript
if (tc.function.name.startsWith('mcp__') && this.mcpClientManager) {
  const mcpResult = await this.mcpClientManager.callTool(tc.function.name, args);
  this.conversationMessages.push({
    role: 'tool',
    tool_call_id: tc.id,
    content: this.truncateToolOutput(mcpResult.content),
  });
  continue;
}
```

With:
```typescript
if (tc.function.name.startsWith('mcp__') && this.mcpClientManager) {
  if (!this._autonomousMode) {
    const approved = await this.requestToolApproval(tc.function.name, args, postMessage);
    if (!approved) {
      this.conversationMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: 'User denied this action.',
      });
      continue;
    }
  }
  const mcpResult = await this.mcpClientManager.callTool(tc.function.name, args);
  this.conversationMessages.push({
    role: 'tool',
    tool_call_id: tc.id,
    content: this.truncateToolOutput(mcpResult.content),
  });
  continue;
}
```

3e. In the `GATED_TOOLS` check (around line 263), skip approval when autonomous:

Replace:
```typescript
if (MessageHandler.GATED_TOOLS.has(tc.function.name)) {
  const approved = await this.requestToolApproval(tc.function.name, args, postMessage);
```

With:
```typescript
if (!this._autonomousMode && MessageHandler.GATED_TOOLS.has(tc.function.name)) {
  const approved = await this.requestToolApproval(tc.function.name, args, postMessage);
```

**Step 4: Run tests to verify they pass**

```
npx vitest run src/chat/message-handler.test.ts
```

Expected: all pass (including all previous tests)

**Step 5: Commit**

```bash
git add src/chat/message-handler.ts src/chat/message-handler.test.ts
git commit -m "feat: add _autonomousMode to MessageHandler with MCP and editor tool gate bypass"
```

---

### Task 3: `package.json` config property + shared types

**Files:**
- Modify: `package.json`
- Modify: `src/shared/types.ts`

**Step 1: Add VS Code configuration property to `package.json`**

In `contributes.configuration.properties`, add after the last existing property:

```json
"lucentCode.chat.autonomousMode": {
  "type": "boolean",
  "default": false,
  "description": "When enabled, all tool calls (editor tools and MCP tools) run without approval prompts."
}
```

**Step 2: Add message types to `src/shared/types.ts`**

Find the `WebviewMessage` union type and add:
```typescript
| { type: 'setAutonomousMode'; enabled: boolean }
```

Find the `ExtensionMessage` union type and add:
```typescript
| { type: 'autonomousModeChanged'; enabled: boolean }
```

**Step 3: Build to verify no type errors**

```
npm run compile
```

Expected: clean build

**Step 4: Commit**

```bash
git add package.json src/shared/types.ts
git commit -m "feat: add autonomousMode VS Code setting and message types"
```

---

### Task 4: `extension.ts` — push initial `autonomousModeChanged` on activation

**Files:**
- Modify: `src/extension.ts`

**Step 1: Read `setupWebviewMessaging` to find the right insertion point**

The function already calls `chatProvider.postMessageToWebview(...)` to push `mcpStatus`. Add the `autonomousModeChanged` push immediately after or alongside it.

**Step 2: Add the push**

In `setupWebviewMessaging()`, after the `mcpStatus` post (or after the `ready` handler sends initial data), add:

```typescript
chatProvider.postMessageToWebview({
  type: 'autonomousModeChanged',
  enabled: settings.autonomousMode,
});
```

Also initialize `MessageHandler` with `settings.autonomousMode` as the starting value. Since `Settings` is already passed as a constructor parameter and `_autonomousMode` is initialized to `false`, update the constructor to read the setting:

In `message-handler.ts` constructor body, after `{}`, initialize:

```typescript
constructor(...) {
  this._autonomousMode = this.settings.autonomousMode;
}
```

> **Note:** The constructor currently has an empty body `{}`. Add the initialization there.

**Step 3: Build**

```
npm run compile
```

Expected: clean

**Step 4: Commit**

```bash
git add src/extension.ts src/chat/message-handler.ts
git commit -m "feat: initialize autonomousMode from settings on activation"
```

---

### Task 5: Webview — `autonomousMode` signal in `chatStore`

**Files:**
- Modify: `webview/src/stores/chat.ts`

**Step 1: Add signal inside `createChatStore`**

After the existing signals (e.g., after `pendingSkillChip`), add:

```typescript
const [autonomousMode, setAutonomousModeSignal] = createSignal(false);
```

**Step 2: Add setter function**

```typescript
function setAutonomousModeFromMessage(value: boolean) {
  setAutonomousModeSignal(value);
}
```

**Step 3: Expose in return object**

In the `return { ... }` block, add:

```typescript
autonomousMode,
setAutonomousModeFromMessage,
```

**Step 4: Build webview**

```
npm run build:webview
```

Expected: no TypeScript errors

**Step 5: Commit**

```bash
git add webview/src/stores/chat.ts
git commit -m "feat: add autonomousMode signal to chatStore"
```

---

### Task 6: Webview — `App.tsx` message handler and toolbar button

**Files:**
- Modify: `webview/src/App.tsx`
- Modify: `webview/src/App.css` (if button needs CSS)

**Step 1: Handle `autonomousModeChanged` message**

In `onMount`, inside the `switch (message.type)` block, add:

```typescript
case 'autonomousModeChanged':
  chatStore.setAutonomousModeFromMessage(message.enabled);
  break;
```

**Step 2: Add `⚡` toolbar button**

In the toolbar `<div class="toolbar">`, after the `+` (new-chat) button, add:

```tsx
<button
  class={`autonomous-button ${chatStore.autonomousMode() ? 'active' : ''}`}
  onClick={() => vscode.postMessage({ type: 'setAutonomousMode', enabled: !chatStore.autonomousMode() })}
  title="Autonomous mode — all tools run without approval"
>
  ⚡
</button>
```

**Step 3: Add CSS for the button**

In `webview/src/App.css`, add alongside the `.history-button` or `.new-chat-button` rules:

```css
.autonomous-button {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 4px 6px;
  color: var(--vscode-foreground);
  opacity: 0.7;
  border-radius: 3px;
}

.autonomous-button:hover {
  opacity: 1;
  background: var(--vscode-toolbar-hoverBackground);
}

.autonomous-button.active {
  opacity: 1;
  color: var(--vscode-charts-yellow);
}
```

**Step 4: Build webview**

```
npm run build:webview
```

Expected: clean

**Step 5: Build extension**

```
npm run compile
```

Expected: clean

**Step 6: Commit**

```bash
git add webview/src/App.tsx webview/src/App.css
git commit -m "feat: add autonomous mode toolbar button and message handler in webview"
```

---

### Task 7: Full test suite pass

**Step 1: Run all tests**

```
npx vitest run
```

Expected: all tests pass (249+ tests, 0 failures)

**Step 2: Build both**

```
npm run compile && npm run build:webview
```

Expected: both clean

**Step 3: If anything fails, fix before moving on**

Diagnose from error output. Common issues:
- Type errors in `types.ts` if union wasn't added correctly
- `chatStore.autonomousMode` not in return object
- `message.enabled` type not narrowed in `App.tsx` switch (use `as any` or check types union)

---

## Done

After all tasks pass, the autonomous mode feature is complete:
- VS Code setting `lucentCode.chat.autonomousMode` controls persistent default
- Toolbar `⚡` button toggles per-session without touching settings
- All MCP tool calls require approval by default (gate added in Task 2)
- When autonomous mode is on, all gates (MCP + gated editor tools) are bypassed
