# OpenRouter Chat — Backlog Fixes Design

**Date:** 2026-03-14
**Scope:** 7 "Important" backlog items from code review

---

## Overview

Fix all 7 important backlog issues in a single branch, tackled in order of ascending complexity. All fixes are independent — no shared state, no ordering dependencies between them.

Execution order:
1. CSS filename mismatch
2. Sync fs → async fs.promises
3. NotificationService injection
4. rename_symbol programmatic apply
5. Unbounded LSP cache
6. Monkey-patched resolveWebviewView
7. Tool-use agentic loop

---

## Fix 1 — CSS filename mismatch

**File:** `src/chat/chat-provider.ts:31`

Vite's `assetFileNames: '[name][extname]'` outputs CSS named after the source file. The Solid.js build entry produces `index.css`, but `chat-provider.ts` loads `style.css`, causing a silent styling failure.

**Change:** Update the `styleUri` path from `style.css` → `index.css`.

---

## Fix 2 — Sync fs blocking the extension host

**File:** `src/chat/history.ts`

All six synchronous fs calls block the Node.js extension host thread. The constructor cannot be async so `mkdirSync` stays, but all method bodies switch to `fs.promises.*`. Sync `existsSync` checks are replaced with try/catch on `fs.promises.access`.

**Changes:**
- `save`: `writeFileSync` → `fs.promises.writeFile`
- `load`: `existsSync` + `readFileSync` → `fs.promises.access` + `fs.promises.readFile`
- `list`: `existsSync` + `readdirSync` + `readFileSync` → `fs.promises.readdir` + `fs.promises.readFile` (wrap in try/catch per file)
- `delete`: `existsSync` + `unlinkSync` → `fs.promises.unlink` (ignore ENOENT)

---

## Fix 3 — NotificationService per-error instantiation

**File:** `src/chat/message-handler.ts:127,145`

`new NotificationService()` is constructed on every error. Fix: add it as a constructor-injected dependency. One shared instance for the lifetime of the extension.

**Changes:**
- `MessageHandler` constructor gains `private readonly notifications: NotificationService`
- `extension.ts` constructs one `NotificationService` and passes it in
- Both `new NotificationService()` call sites replaced with `this.notifications`

---

## Fix 4 — rename_symbol opens dialog instead of applying

**File:** `src/lsp/editor-tools.ts:134`

`editor.action.rename` opens the interactive UI — `newName` is ignored. The programmatic API is `vscode.executeDocumentRenameProvider` which returns a `WorkspaceEdit`.

**Change:** Replace `executeCommand('editor.action.rename', ...)` with:
```ts
const edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
  'vscode.executeDocumentRenameProvider', uri, position, args.newName as string
);
if (edit) await vscode.workspace.applyEdit(edit);
```

---

## Fix 5 — Unbounded LSP cache

**File:** `src/lsp/code-intelligence.ts:31`

The `Map` cache grows without bound — entries are evicted on read (TTL check) but never proactively. Under heavy use (many unique URIs/positions), it leaks memory.

**Change:** Cap at 100 entries. In `setCache`, before inserting: if `cache.size >= 100`, delete the oldest key (`cache.keys().next().value` — Maps preserve insertion order). No external dependency.

---

## Fix 6 — Monkey-patched resolveWebviewView

**File:** `src/extension.ts:52-60`, `src/chat/chat-provider.ts`

`extension.ts` overwrites the `resolveWebviewView` method at runtime to hook in message setup. This is fragile and obscures intent.

**Change:** Add an `onResolve?: () => void` callback property to `ChatViewProvider`. Extension.ts sets `chatProvider.onResolve = setupWebviewMessaging` before registering the provider. `resolveWebviewView` calls `this.onResolve?.()` after its own setup. Remove the runtime overwrite from `extension.ts`.

---

## Fix 7 — Tool-use agentic loop

**Files:** `src/shared/types.ts`, `src/core/openrouter-client.ts`, `src/chat/message-handler.ts`

`TOOL_DEFINITIONS` exist and `EditorToolExecutor` can execute them, but tools are never passed to the API and `tool_calls` in responses are never processed.

### types.ts

- Extend `ChatMessage.role` to include `'tool'`; add optional `tool_call_id?: string` and `tool_calls?: ToolCall[]` fields
- Extend `ChatResponseChunk.delta` to include `tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>`

### openrouter-client.ts

- `chatStream` accumulates streamed `delta.tool_calls` fragments (keyed by `index`) and on the final chunk (`finish_reason === 'tool_calls'`) yields a synthetic chunk containing the assembled `tool_calls` array so callers don't need to reassemble fragments

### message-handler.ts

Replace single `chatStream` call with a `while` loop (max 5 iterations):

```
loop:
  stream with tools: TOOL_DEFINITIONS
  accumulate content + tool_calls
  if finish_reason === 'stop':
    push assistant message, emit streamEnd, break
  if finish_reason === 'tool_calls':
    push assistant message (with tool_calls)
    for each tool_call:
      execute via toolExecutor
      push { role: 'tool', tool_call_id, content: result }
    continue loop
```

Tool messages (`role: 'tool'`) are included in `conversationMessages` for the API round-trip but excluded when saving to history (the persisted `Conversation.messages` stores only `user` and `assistant` messages). The markdown export already filters by role so no change needed there.

---

## Out of Scope

The following "Suggestions" items from the backlog are not part of this plan:
- Retry with exponential backoff
- `inlineSuggest` kill switch
- Enriched context on `ready`
- Type duplication across extension/webview
- Idiomatic Solid.js scroll-to-bottom
- `deactivate` cleanup
