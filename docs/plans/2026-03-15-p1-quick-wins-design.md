# P1 Quick Wins — Design

**Date:** 2026-03-15
**Scope:** Four remaining P1 XS backlog items

## Features

1. **Enriched context on `ready`** — fix LSP context silently dropped on panel open
2. **inlineSuggest kill switch** — respect `editor.inlineSuggest.enabled` setting
3. **Retry with backoff** — exponential backoff for 429/5xx API errors
4. **deactivate cleanup** — abort in-flight requests on extension deactivate

---

## Feature 1: Enriched Context on `ready`

### Problem

In `src/chat/message-handler.ts`, the `ready` handler calls `this.contextBuilder.buildContext()` — the basic context builder. The full LSP-enriched context (`buildEnrichedContext()`) is only called when a message is sent. So when the chat panel first opens, the webview receives stale/minimal context.

### Fix

Change one word in the `ready` case:

```ts
// Before:
const context = this.contextBuilder.buildContext();

// After:
const context = await this.contextBuilder.buildEnrichedContext();
```

Update the `ready` case to `async`-await this call. Update any test that asserts `buildContext` was called in the ready handler.

---

## Feature 2: inlineSuggest Kill Switch

### Problem

`src/completions/inline-provider.ts` fires completions even when `editor.inlineSuggest.enabled` is `false`. Users who disable VSCode's native ghost-text suggestions expect all providers to respect this setting.

### Fix

Add one guard at the top of `provideInlineCompletionItems`, before the model check:

```ts
if (!vscode.workspace.getConfiguration('editor').get<boolean>('inlineSuggest.enabled', true)) {
  return { items: [] };
}
```

Add one test: when `inlineSuggest.enabled` is `false`, the provider returns an empty list without calling the API.

---

## Feature 3: Retry with Backoff

### Architecture

A private `withRetry` helper in `src/core/openrouter-client.ts` wraps any `fetch` call:

- **Retried status codes:** 429, 500, 502, 503, 504
- **Non-retried:** all other 4xx (client errors are not transient)
- **Max retries:** 3 (4 total attempts)
- **Backoff:** exponential — `min(baseMs * 2^attempt, maxMs)` with ±20% jitter
  - Base: 1000 ms, Max: 8000 ms
  - Delays: ~1s, ~2s, ~4s
- **429 Retry-After:** if the response header is present, use it instead of the computed delay
- **AbortSignal:** if the signal fires during a backoff sleep, cancel immediately

### Interface

```ts
private async withRetry(
  fn: () => Promise<Response>,
  signal?: AbortSignal
): Promise<Response>
```

Both `chat()` and `chatStream()` replace their `fetch(...)` call with `this.withRetry(() => fetch(...), signal)`.

`chatStream()` already receives a `signal` — pass it through. `chat()` has no signal today; leave it without one (a future enhancement).

### Error handling

After exhausting retries, throw the last error as-is. Do not wrap or swallow it — callers already handle `OpenRouter API error (...)` strings.

---

## Feature 4: deactivate Cleanup

### Problem

`export function deactivate() {}` is empty. If the user closes VSCode while a chat stream is active, the `AbortController` is never called. All `context.subscriptions` disposables are automatically called by VSCode, so providers, watchers, and the auth/completionProvider/instructionsLoader cleanup block already run correctly on deactivate.

The only gap is `MessageHandler.abortController`.

### Fix

**`src/chat/message-handler.ts`:** Add a public method:

```ts
abort(): void {
  this.abortController?.abort();
}
```

**`src/extension.ts`:** Wire it in `deactivate()`:

```ts
export function deactivate() {
  messageHandler.abort();
}
```

`messageHandler` is module-scoped (or elevated from `activate`'s local scope to module scope so `deactivate` can reach it).

---

## Out of Scope

- Per-request retry configuration (always uses the fixed policy above)
- User-visible retry progress (silent retry, no toast)
- Retry for inline completions (only chat/chatStream)
- Inline completion abort on deactivate (token-based cancellation already handles this)
