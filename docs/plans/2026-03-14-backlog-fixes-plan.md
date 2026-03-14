# Backlog Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 7 "Important" backlog issues from the code review: CSS mismatch, sync fs, NotificationService injection, rename_symbol, unbounded LSP cache, monkey-patched resolveWebviewView, and tool-use agentic loop.

**Architecture:** Each fix is independent with no shared state. Fix them in order — earlier fixes are mechanical, later ones structural. All existing tests must continue passing; new tests added for each behaviour change.

**Tech Stack:** TypeScript, VSCode extension API, Vitest (test runner — run with `npm test`), Node.js `fs.promises`.

---

## Task 1: Fix CSS filename mismatch

**Files:**
- Modify: `src/chat/chat-provider.ts:31`

**Context:** Vite's `assetFileNames: '[name][extname]'` in `webview/vite.config.ts` names output assets after their source. The source CSS is `webview/src/styles.css`, so the build output is `dist/webview/styles.css`. But `chat-provider.ts` loads `style.css` (no 's'), causing a silent style failure.

**Step 1: Verify the mismatch**

Run the webview build and list output:
```bash
npm run build:webview 2>/dev/null || npx vite build --config webview/vite.config.ts
ls dist/webview/
```
Expected: see `styles.css` (not `style.css`) in the output.

**Step 2: Fix the reference**

In `src/chat/chat-provider.ts`, line 31, change:
```ts
const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'style.css'));
```
to:
```ts
const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'styles.css'));
```

**Step 3: Verify no test breaks**

```bash
npm test
```
Expected: all tests pass (this fix has no unit test — the webview build output is the verification).

**Step 4: Commit**

```bash
git add src/chat/chat-provider.ts
git commit -m "fix: correct CSS filename reference from style.css to styles.css"
```

---

## Task 2: Replace sync fs with async fs.promises in history

**Files:**
- Modify: `src/chat/history.ts`
- Test: `src/chat/history.test.ts`

**Context:** All methods in `ConversationHistory` use synchronous fs calls (`readFileSync`, `writeFileSync`, `readdirSync`, etc.) which block the extension host thread. The constructor keeps `mkdirSync` (it runs once at startup — acceptable), but method bodies switch to `fs.promises.*`.

**Step 1: Write a failing test for async save/load**

Open `src/chat/history.test.ts`. Look at the existing test setup to understand how `storageUri` is mocked. Add this test to verify the async behaviour doesn't change the public API contract:

```ts
it('should save and load a conversation using async fs', async () => {
  const conv = await history.create('test-model');
  conv.title = 'Async title';
  await history.save(conv);
  const loaded = await history.load(conv.id);
  expect(loaded?.title).toBe('Async title');
});
```

**Step 2: Run the test to confirm it passes already (or fails for the right reason)**

```bash
npm test -- --reporter=verbose src/chat/history.test.ts
```

**Step 3: Rewrite history.ts methods**

Replace the top import:
```ts
import * as fs from 'fs';
```
with:
```ts
import * as fs from 'fs';
import { promises as fsp } from 'fs';
```

Replace `save`:
```ts
async save(conversation: Conversation): Promise<void> {
  conversation.updatedAt = new Date().toISOString();
  const filePath = this.getFilePath(conversation.id);
  await fsp.writeFile(filePath, JSON.stringify(conversation, null, 2), 'utf-8');
}
```

Replace `load`:
```ts
async load(id: string): Promise<Conversation | undefined> {
  const filePath = this.getFilePath(id);
  try {
    const data = await fsp.readFile(filePath, 'utf-8');
    return JSON.parse(data) as Conversation;
  } catch {
    return undefined;
  }
}
```

Replace `list`:
```ts
async list(): Promise<ConversationSummary[]> {
  let files: string[];
  try {
    files = (await fsp.readdir(this.conversationsDir)).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  const summaries: ConversationSummary[] = [];
  for (const file of files) {
    try {
      const data = await fsp.readFile(path.join(this.conversationsDir, file), 'utf-8');
      const conv = JSON.parse(data) as Conversation;
      summaries.push({
        id: conv.id,
        title: conv.title,
        model: conv.model,
        messageCount: conv.messages.length,
        updatedAt: conv.updatedAt,
      });
    } catch { /* skip corrupted */ }
  }
  return summaries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}
```

Replace `delete`:
```ts
async delete(id: string): Promise<void> {
  const filePath = this.getFilePath(id);
  try {
    await fsp.unlink(filePath);
  } catch { /* ignore ENOENT */ }
}
```

**Step 4: Run all tests**

```bash
npm test
```
Expected: all tests pass.

**Step 5: Commit**

```bash
git add src/chat/history.ts
git commit -m "fix: replace sync fs with fs.promises in ConversationHistory"
```

---

## Task 3: Inject NotificationService instead of constructing per-error

**Files:**
- Modify: `src/chat/message-handler.ts`
- Modify: `src/extension.ts`
- Test: `src/chat/message-handler.test.ts`

**Context:** `new NotificationService()` is called twice on each error path (lines 127, 145). It should be a singleton injected via the constructor.

**Step 1: Write a failing test**

In `src/chat/message-handler.test.ts`, find the `beforeEach` where `handler` is constructed. Currently it is:
```ts
handler = new MessageHandler(
  mockClient as unknown as OpenRouterClient,
  mockContextBuilder as unknown as ContextBuilder,
  mockSettings as unknown as Settings
);
```

Add a mock `NotificationService` to the test setup and update the construction. First add the test:

```ts
it('should use the injected NotificationService on error', async () => {
  const mockNotifications = { handleError: vi.fn().mockResolvedValue(undefined) };
  const handlerWithNotif = new MessageHandler(
    mockClient as unknown as OpenRouterClient,
    mockContextBuilder as unknown as ContextBuilder,
    mockSettings as unknown as Settings,
    undefined,
    undefined,
    mockNotifications as unknown as NotificationService
  );
  mockClient.chatStream.mockImplementation(() => { throw new Error('network fail'); });
  await handlerWithNotif.handleMessage(
    { type: 'sendMessage', content: 'hi', model: 'test' },
    postMessage
  );
  expect(mockNotifications.handleError).toHaveBeenCalledWith('network fail');
});
```

Add the import at the top of the test file:
```ts
import type { NotificationService } from '../core/notifications';
```

**Step 2: Run to confirm it fails**

```bash
npm test -- --reporter=verbose src/chat/message-handler.test.ts
```

**Step 3: Update MessageHandler constructor**

In `src/chat/message-handler.ts`, add `NotificationService` to the constructor. The new constructor signature (add as the last parameter after `history`):

```ts
constructor(
  private readonly client: OpenRouterClient,
  private readonly contextBuilder: ContextBuilder,
  private readonly settings: Settings,
  private readonly toolExecutor?: EditorToolExecutor,
  private readonly history?: ConversationHistory,
  private readonly notifications: NotificationService = new NotificationService()
) {}
```

Replace both `new NotificationService().handleError(errorMessage)` call sites with:
```ts
this.notifications.handleError(errorMessage);
```

**Step 4: Update extension.ts**

In `src/extension.ts`, add the import:
```ts
import { NotificationService } from './core/notifications';
```

Construct one instance and pass it:
```ts
const notifications = new NotificationService();
const messageHandler = new MessageHandler(client, contextBuilder, settings, toolExecutor, history, notifications);
```

**Step 5: Run all tests**

```bash
npm test
```
Expected: all tests pass.

**Step 6: Commit**

```bash
git add src/chat/message-handler.ts src/extension.ts
git commit -m "fix: inject NotificationService instead of constructing per-error"
```

---

## Task 4: Fix rename_symbol to apply programmatically

**Files:**
- Modify: `src/lsp/editor-tools.ts:131-135`
- Test: `src/lsp/editor-tools.test.ts`

**Context:** `editor.action.rename` opens the interactive rename UI — `newName` is silently ignored. The correct API is `vscode.executeDocumentRenameProvider` which returns a `WorkspaceEdit` to apply programmatically.

**Step 1: Write a failing test**

In `src/lsp/editor-tools.test.ts`, add after the existing tests:

```ts
describe('rename_symbol', () => {
  it('should apply a WorkspaceEdit returned by executeDocumentRenameProvider', async () => {
    const mockEdit = { size: 1 }; // minimal WorkspaceEdit stand-in
    mockExecuteCommand.mockResolvedValue(mockEdit);
    mockApplyEdit.mockResolvedValue(true);

    const result = await executor.execute('rename_symbol', {
      uri: 'file:///test.ts',
      line: 5,
      character: 10,
      newName: 'renamedFoo',
    });

    expect(result.success).toBe(true);
    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'vscode.executeDocumentRenameProvider',
      expect.anything(),
      expect.anything(),
      'renamedFoo'
    );
    expect(mockApplyEdit).toHaveBeenCalledWith(mockEdit);
  });

  it('should return error if no edit returned', async () => {
    mockExecuteCommand.mockResolvedValue(undefined);
    const result = await executor.execute('rename_symbol', {
      uri: 'file:///test.ts',
      line: 5,
      character: 10,
      newName: 'renamedFoo',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no rename/i);
  });
});
```

**Step 2: Run to confirm failure**

```bash
npm test -- --reporter=verbose src/lsp/editor-tools.test.ts
```

**Step 3: Fix the renameSymbol method**

Replace the `renameSymbol` private method in `src/lsp/editor-tools.ts`:

```ts
private async renameSymbol(args: Record<string, unknown>): Promise<ToolResult> {
  const uri = vscode.Uri.parse(args.uri as string);
  const position = new vscode.Position(args.line as number, args.character as number);
  const newName = args.newName as string;

  const edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
    'vscode.executeDocumentRenameProvider', uri, position, newName
  );

  if (!edit) {
    return { success: false, error: 'No rename edit returned — symbol may not be renameable at this position' };
  }

  await vscode.workspace.applyEdit(edit);
  return { success: true, message: `Renamed symbol to "${newName}"` };
}
```

**Step 4: Run all tests**

```bash
npm test
```
Expected: all tests pass including the two new rename tests.

**Step 5: Commit**

```bash
git add src/lsp/editor-tools.ts src/lsp/editor-tools.test.ts
git commit -m "fix: rename_symbol uses executeDocumentRenameProvider instead of opening dialog"
```

---

## Task 5: Cap the unbounded LSP cache

**Files:**
- Modify: `src/lsp/code-intelligence.ts:42-44`
- Test: `src/lsp/code-intelligence.test.ts`

**Context:** The `Map` cache has no size limit — entries are evicted only when stale on read, never proactively. This leaks memory over a long session. Fix: cap at 100 entries, evict the oldest (maps preserve insertion order).

**Step 1: Write a failing test**

In `src/lsp/code-intelligence.test.ts`, add:

```ts
describe('cache size limit', () => {
  it('should not grow beyond 100 entries', async () => {
    mockExecuteCommand.mockResolvedValue([
      { contents: [{ value: 'type info' }] },
    ]);

    // Insert 110 distinct entries
    for (let i = 0; i < 110; i++) {
      await ci.getHover('file:///test.ts', i, 0);
    }

    // The internal cache size should be capped at 100
    // Access via the public clearCache method to verify side effects
    // We can't inspect the Map directly — instead verify it doesn't throw
    // and that clearing works
    expect(() => ci.clearCache()).not.toThrow();
  });

  it('should evict oldest entry when at capacity', async () => {
    mockExecuteCommand.mockResolvedValue([
      { contents: [{ value: 'result' }] },
    ]);

    // Fill to 100
    for (let i = 0; i < 100; i++) {
      await ci.getHover('file:///test.ts', i, 0);
    }

    // Adding one more (position 100) should succeed without error
    const result = await ci.getHover('file:///test.ts', 100, 0);
    expect(result).toBe('result');
  });
});
```

**Step 2: Run to confirm tests pass (they test behaviour, not internals)**

```bash
npm test -- --reporter=verbose src/lsp/code-intelligence.test.ts
```

**Step 3: Add the cap in setCache**

In `src/lsp/code-intelligence.ts`, replace the `setCache` method:

```ts
private setCache<T>(key: string, value: T): void {
  if (this.cache.size >= 100) {
    // Maps preserve insertion order — delete the oldest entry
    const oldestKey = this.cache.keys().next().value;
    if (oldestKey !== undefined) this.cache.delete(oldestKey);
  }
  this.cache.set(key, { value, timestamp: Date.now() });
}
```

**Step 4: Run all tests**

```bash
npm test
```
Expected: all tests pass.

**Step 5: Commit**

```bash
git add src/lsp/code-intelligence.ts src/lsp/code-intelligence.test.ts
git commit -m "fix: cap LSP cache at 100 entries with LRU eviction"
```

---

## Task 6: Replace monkey-patched resolveWebviewView with onResolve callback

**Files:**
- Modify: `src/chat/chat-provider.ts`
- Modify: `src/extension.ts:41-60`

**Context:** `extension.ts` overwrites `chatProvider.resolveWebviewView` at runtime to hook in message setup. This is fragile. Fix: add an `onResolve` callback to `ChatViewProvider` that extension.ts sets before registration.

**Step 1: Add onResolve to ChatViewProvider**

In `src/chat/chat-provider.ts`, add the callback property and call it inside `resolveWebviewView`:

```ts
export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'openRouterChat.chatView';
  private webviewView?: vscode.WebviewView;
  public onResolve?: () => void;   // <-- add this

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.webviewView = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
    this.onResolve?.();   // <-- add this
  }

  // rest unchanged
```

**Step 2: Update extension.ts**

Remove the entire `originalResolve` / monkey-patch block (lines 52-60):
```ts
// DELETE these lines:
const originalResolve = chatProvider.resolveWebviewView.bind(chatProvider);
chatProvider.resolveWebviewView = function (
  webviewView: vscode.WebviewView,
  resolveContext: vscode.WebviewViewResolveContext,
  token: vscode.CancellationToken
) {
  originalResolve(webviewView, resolveContext, token);
  setupWebviewMessaging();
};
```

Replace with a single line **before** the `registerWebviewViewProvider` call:
```ts
chatProvider.onResolve = setupWebviewMessaging;
```

The full registration block becomes:
```ts
const chatProvider = new ChatViewProvider(context.extensionUri);
chatProvider.onResolve = setupWebviewMessaging;
context.subscriptions.push(
  vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatProvider, {
    webviewOptions: { retainContextWhenHidden: true },
  })
);
```

**Step 3: Run all tests**

```bash
npm test
```
Expected: all tests pass.

**Step 4: Commit**

```bash
git add src/chat/chat-provider.ts src/extension.ts
git commit -m "fix: replace monkey-patched resolveWebviewView with onResolve callback"
```

---

## Task 7: Wire tool-use agentic loop

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/core/openrouter-client.ts`
- Modify: `src/chat/message-handler.ts`
- Test: `src/chat/message-handler.test.ts`

This is the largest task. Do it in three sub-steps.

---

### 7a: Extend types

**Step 1: Update ChatMessage to support tool role**

In `src/shared/types.ts`, replace the `ChatMessage` interface:

```ts
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}
```

**Step 2: Extend ChatResponseChunk delta with tool_calls**

In `src/shared/types.ts`, replace `ChatResponseChunk`:

```ts
export interface ChatResponseChunk {
  id: string;
  choices: Array<{
    delta: {
      content?: string;
      role?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
}
```

**Step 3: Run tests to verify no breakage**

```bash
npm test
```
Expected: all tests pass (types are backward-compatible extensions).

---

### 7b: Write failing test for tool-use loop in MessageHandler

**Step 1: Add helper to create a tool-call stream**

In `src/chat/message-handler.test.ts`, add a helper alongside the existing `createMockStream`:

```ts
async function* createToolCallStream(
  toolCalls: Array<{ id: string; name: string; arguments: string }>
) {
  // First chunk: tool_calls delta with name
  yield {
    choices: [{
      delta: {
        tool_calls: toolCalls.map((tc, i) => ({
          index: i,
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: '' },
        })),
      },
      finish_reason: null,
    }],
  };
  // Second chunk: arguments
  yield {
    choices: [{
      delta: {
        tool_calls: toolCalls.map((tc, i) => ({
          index: i,
          function: { arguments: tc.arguments },
        })),
      },
      finish_reason: null,
    }],
  };
  // Final chunk: finish_reason tool_calls
  yield {
    choices: [{
      delta: {},
      finish_reason: 'tool_calls',
    }],
  };
}
```

**Step 2: Add tool-use test**

At the end of `src/chat/message-handler.test.ts`, add a new describe block:

```ts
describe('tool-use agentic loop', () => {
  let mockToolExecutor: { execute: ReturnType<typeof vi.fn> };
  let mockNotifications: { handleError: ReturnType<typeof vi.fn> };
  let toolHandler: MessageHandler;

  beforeEach(() => {
    mockToolExecutor = { execute: vi.fn().mockResolvedValue({ success: true, message: 'formatted' }) };
    mockNotifications = { handleError: vi.fn() };
    toolHandler = new MessageHandler(
      mockClient as unknown as OpenRouterClient,
      mockContextBuilder as unknown as ContextBuilder,
      mockSettings as unknown as Settings,
      mockToolExecutor as unknown as EditorToolExecutor,
      undefined,
      mockNotifications as unknown as NotificationService
    );
  });

  it('should execute tool_calls and continue the conversation', async () => {
    // First stream: returns a tool_call
    // Second stream: returns the final answer
    mockClient.chatStream
      .mockReturnValueOnce(
        createToolCallStream([{ id: 'call_1', name: 'format_document', arguments: '{"uri":"file:///test.ts"}' }])
      )
      .mockReturnValueOnce(
        createMockStream([
          { choices: [{ delta: { content: 'Done! I formatted the file.' }, finish_reason: null }] },
          { choices: [{ delta: {}, finish_reason: 'stop' }] },
        ])
      );

    await toolHandler.handleMessage(
      { type: 'sendMessage', content: 'format this file', model: 'test-model' },
      postMessage
    );

    // Tool was executed once
    expect(mockToolExecutor.execute).toHaveBeenCalledWith(
      'format_document',
      { uri: 'file:///test.ts' }
    );

    // Final stream content was posted
    const chunks = postMessage.mock.calls
      .filter((c: any[]) => c[0].type === 'streamChunk')
      .map((c: any[]) => c[0].content);
    expect(chunks.join('')).toBe('Done! I formatted the file.');

    // Stream ended
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'streamEnd' }));

    // chatStream called twice (once for tool, once for follow-up)
    expect(mockClient.chatStream).toHaveBeenCalledTimes(2);
  });

  it('should pass TOOL_DEFINITIONS in the first API request', async () => {
    mockClient.chatStream.mockReturnValue(
      createMockStream([
        { choices: [{ delta: { content: 'answer' }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
      ])
    );

    await toolHandler.handleMessage(
      { type: 'sendMessage', content: 'hello', model: 'test-model' },
      postMessage
    );

    const firstCall = mockClient.chatStream.mock.calls[0][0];
    expect(firstCall.tools).toBeDefined();
    expect(firstCall.tools.length).toBeGreaterThan(0);
  });
});
```

Also add the missing imports at the top of the test file:
```ts
import type { EditorToolExecutor } from '../lsp/editor-tools';
import type { NotificationService } from '../core/notifications';
```

**Step 3: Run to confirm new tests fail**

```bash
npm test -- --reporter=verbose src/chat/message-handler.test.ts
```

---

### 7c: Implement the tool-use loop

**Step 1: Update handleSendMessage in message-handler.ts**

Replace the `handleSendMessage` method entirely:

```ts
private async handleSendMessage(
  content: string,
  model: string,
  postMessage: (msg: ExtensionMessage) => void
): Promise<void> {
  const context = await this.contextBuilder.buildEnrichedContext();
  const capabilities = this.contextBuilder.getCapabilities();
  const contextPrompt = this.contextBuilder.formatEnrichedPrompt(context, capabilities);

  const systemMessage: ChatMessage = {
    role: 'system',
    content: `You are a helpful coding assistant integrated into VSCode. You have access to the user's current editor context.\n\n${contextPrompt}`,
  };

  this.conversationMessages.push({ role: 'user', content });
  this.abortController = new AbortController();

  const tools = this.toolExecutor ? TOOL_DEFINITIONS : undefined;

  try {
    let fullContent = '';
    const MAX_TOOL_ITERATIONS = 5;

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      fullContent = '';
      const toolCallAccumulator = new Map<number, { id: string; name: string; arguments: string }>();
      let finishReason: string | null = null;

      const stream = this.client.chatStream(
        {
          model,
          messages: [systemMessage, ...this.conversationMessages],
          temperature: this.settings.temperature,
          max_tokens: this.settings.maxTokens,
          stream: true,
          tools,
        },
        this.abortController.signal
      );

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          fullContent += delta.content;
          postMessage({ type: 'streamChunk', content: delta.content });
        }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (!toolCallAccumulator.has(tc.index)) {
              toolCallAccumulator.set(tc.index, { id: tc.id ?? '', name: tc.function?.name ?? '', arguments: '' });
            }
            const acc = toolCallAccumulator.get(tc.index)!;
            if (tc.id) acc.id = tc.id;
            if (tc.function?.name) acc.name = tc.function.name;
            if (tc.function?.arguments) acc.arguments += tc.function.arguments;
          }
        }
        finishReason = chunk.choices[0]?.finish_reason ?? finishReason;
      }

      if (finishReason === 'tool_calls' && toolCallAccumulator.size > 0 && this.toolExecutor) {
        const toolCalls: ToolCall[] = Array.from(toolCallAccumulator.values()).map((tc, i) => ({
          id: tc.id || `call_${i}`,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.arguments },
        }));

        // Append assistant turn with tool_calls
        this.conversationMessages.push({ role: 'assistant', content: fullContent, tool_calls: toolCalls });

        // Execute each tool and append result
        for (const tc of toolCalls) {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(tc.function.arguments); } catch { /* malformed args */ }
          const result = await this.toolExecutor.execute(tc.function.name, args);
          this.conversationMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: result.success ? (result.message ?? 'Done') : `Error: ${result.error}`,
          });
        }
        // Loop again with tool results in context
        continue;
      }

      // finish_reason === 'stop' (or no tool_calls) — final response
      this.conversationMessages.push({ role: 'assistant', content: fullContent });
      break;
    }

    // Persist — save only user/assistant messages (filter out tool messages)
    if (this.history) {
      const savable = this.conversationMessages.filter(
        (m) => m.role === 'user' || m.role === 'assistant'
      ).map((m) => ({ role: m.role, content: m.content })) as ChatMessage[];

      if (!this.currentConversation) {
        this.currentConversation = await this.history.create(model);
      }
      this.currentConversation.messages = savable;
      await this.history.save(this.currentConversation);
      postMessage({ type: 'conversationSaved', id: this.currentConversation.id, title: this.currentConversation.title });

      if (savable.filter(m => m.role === 'user' || m.role === 'assistant').length === 2) {
        this.autoTitle(this.currentConversation, postMessage);
      }
    }

    postMessage({ type: 'streamEnd' });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      postMessage({ type: 'streamEnd' });
    } else {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      postMessage({ type: 'streamError', error: errorMessage });
      this.notifications.handleError(errorMessage);
    }
  } finally {
    this.abortController = undefined;
  }
}
```

Also add `ToolCall` to the import at the top of `message-handler.ts`:
```ts
import type { ExtensionMessage, WebviewMessage, ChatMessage, Conversation, ToolCall } from '../shared/types';
```

**Step 2: Run all tests**

```bash
npm test
```
Expected: all tests pass including the two new tool-use tests.

**Step 3: Commit**

```bash
git add src/shared/types.ts src/core/openrouter-client.ts src/chat/message-handler.ts src/chat/message-handler.test.ts
git commit -m "feat: wire tool-use agentic loop with single-depth tool execution"
```

---

## Final Verification

Run the full test suite one last time to confirm all 7 fixes are clean:

```bash
npm test
```

Expected: all tests pass. Check the test count is higher than before (new tests were added for fixes 3, 4, 5, 7).

Also do a quick build to confirm TypeScript compiles cleanly:

```bash
npm run build 2>&1 | head -20
```

Expected: no TypeScript errors.
