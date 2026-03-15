# P1 Quick Wins Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix four remaining P1 XS backlog items — enriched context on ready, inlineSuggest kill switch, retry with backoff, and deactivate cleanup.

**Architecture:** Four independent changes: one async fix in MessageHandler, one guard clause in InlineCompletionProvider, one `withRetry` helper in OpenRouterClient, and one module-scope promotion + abort method for deactivate.

**Tech Stack:** TypeScript, VSCode extension API, Vitest.

---

## Task 1: Enriched context on `ready`

**Files:**
- Modify: `src/chat/message-handler.ts:57-62`
- Modify: `src/chat/message-handler.test.ts` (update existing `ready` test)

### Step 1: Update the failing test first

In `src/chat/message-handler.test.ts`, find the `describe('ready', ...)` block (around line 254). Update the existing test to assert `buildEnrichedContext` is called instead of `buildContext`:

```ts
describe('ready', () => {
  it('should call getModels and post contextUpdate with enriched context', async () => {
    await handler.handleMessage({ type: 'ready' }, postMessage);

    expect(mockClient.listModels).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith({
      type: 'modelsLoaded',
      models: mockModels,
    });
    expect(mockContextBuilder.buildEnrichedContext).toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({
      type: 'contextUpdate',
      context: mockEnrichedContext,
    });
  });
});
```

Also check what `mockContextBuilder` looks like (near the top of the test file). It should already have `buildEnrichedContext: vi.fn().mockResolvedValue(mockEnrichedContext)` — if not, add it, and add a `mockEnrichedContext` constant with the same shape as `mockContext`.

### Step 2: Run to confirm failure

```bash
npx vitest run --reporter=verbose src/chat/message-handler.test.ts 2>&1 | grep -A5 "ready"
```

Expected: FAIL — `buildEnrichedContext` not called.

### Step 3: Implement the fix

In `src/chat/message-handler.ts`, find the `ready` case (line 57):

```ts
case 'ready':
  this.pendingApply.clear();
  await this.handleGetModels(postMessage);
  const context = this.contextBuilder.buildContext();
  postMessage({ type: 'contextUpdate', context });
  break;
```

Replace with:

```ts
case 'ready': {
  this.pendingApply.clear();
  await this.handleGetModels(postMessage);
  const context = await this.contextBuilder.buildEnrichedContext();
  postMessage({ type: 'contextUpdate', context });
  break;
}
```

Note: wrap in `{}` to avoid the `const` in `case` lint issue.

### Step 4: Run all tests

```bash
npm test
```

Expected: all 132 tests pass.

### Step 5: Commit

```bash
git add src/chat/message-handler.ts src/chat/message-handler.test.ts
git commit -m "fix: use buildEnrichedContext in ready handler so LSP context is sent on panel open"
```

---

## Task 2: inlineSuggest kill switch

**Files:**
- Modify: `src/completions/inline-provider.ts:20-31`
- Modify: `src/completions/inline-provider.test.ts`

### Step 1: Write the failing test

In `src/completions/inline-provider.test.ts`, find the `describe` block and add a new test. First, check the existing `workspace.getConfiguration` mock — it looks like:

```ts
workspace: {
  getConfiguration: vi.fn(() => ({
    get: vi.fn((key: string) => {
      const vals: Record<string, unknown> = { ... };
      return vals[key];
    }),
  })),
```

Add a new test that overrides `getConfiguration` to return `false` for `inlineSuggest.enabled`:

```ts
it('should return empty list when editor.inlineSuggest.enabled is false', async () => {
  const { workspace } = await import('vscode');
  (workspace.getConfiguration as any).mockImplementation((section: string) => ({
    get: (key: string, defaultValue?: unknown) => {
      if (section === 'editor' && key === 'inlineSuggest.enabled') return false;
      const vals: Record<string, unknown> = {
        'completions.model': 'test/model',
        'completions.triggerMode': 'manual',
        'completions.debounceMs': 300,
        'completions.maxContextLines': 100,
        'chat.model': 'fallback/model',
        'chat.temperature': 0.7,
        'chat.maxTokens': 4096,
      };
      return vals[`${section}.${key}`] ?? vals[key] ?? defaultValue;
    },
  }));

  const result = await provider.provideInlineCompletionItems(
    mockDocument,
    mockPosition,
    {} as any,
    mockToken
  );

  expect(result.items).toHaveLength(0);
  expect(mockFetch).not.toHaveBeenCalled();
});
```

### Step 2: Run to confirm failure

```bash
npx vitest run --reporter=verbose src/completions/inline-provider.test.ts 2>&1 | tail -20
```

Expected: FAIL — `mockFetch` was called.

### Step 3: Implement the guard

In `src/completions/inline-provider.ts`, add the guard as the very first check inside `provideInlineCompletionItems` (before the model check at line 28):

```ts
async provideInlineCompletionItems(
  document: vscode.TextDocument,
  position: vscode.Position,
  _context: vscode.InlineCompletionContext,
  token: vscode.CancellationToken
): Promise<vscode.InlineCompletionList> {
  const emptyResult = new vscode.InlineCompletionList([]);

  if (!vscode.workspace.getConfiguration('editor').get<boolean>('inlineSuggest.enabled', true)) {
    return emptyResult;
  }

  const model = this.settings.completionsModel || this.settings.chatModel;
  // ... rest unchanged
```

### Step 4: Run all tests

```bash
npm test
```

Expected: all 133 tests pass (132 + 1 new).

### Step 5: Commit

```bash
git add src/completions/inline-provider.ts src/completions/inline-provider.test.ts
git commit -m "feat: respect editor.inlineSuggest.enabled kill switch in inline completion provider"
```

---

## Task 3: Retry with backoff

**Files:**
- Modify: `src/core/openrouter-client.ts`
- Modify: `src/core/openrouter-client.test.ts`

### Step 1: Write failing tests

In `src/core/openrouter-client.test.ts`, add a new `describe('retry behaviour', ...)` block after the existing `describe` blocks:

```ts
describe('retry behaviour', () => {
  it('should retry chat() on 429 and succeed on second attempt', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve('rate limited'),
        headers: { get: () => null },
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'gen-1', choices: [], usage: {} }),
      });

    await client.chat({ model: 'test/model', messages: [{ role: 'user', content: 'hi' }] });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should retry chat() on 503 and succeed', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: () => Promise.resolve('service unavailable'),
        headers: { get: () => null },
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'gen-1', choices: [], usage: {} }),
      });

    await client.chat({ model: 'test/model', messages: [{ role: 'user', content: 'hi' }] });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should not retry chat() on 400 client error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('bad request'),
      headers: { get: () => null },
    });

    await expect(
      client.chat({ model: 'test/model', messages: [{ role: 'user', content: 'hi' }] })
    ).rejects.toThrow('OpenRouter API error (400)');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should throw after exhausting 3 retries', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('server error'),
      headers: { get: () => null },
    });

    await expect(
      client.chat({ model: 'test/model', messages: [{ role: 'user', content: 'hi' }] })
    ).rejects.toThrow('OpenRouter API error (500)');
    expect(mockFetch).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it('should use Retry-After header delay on 429', async () => {
    vi.useFakeTimers();
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve('rate limited'),
        headers: { get: (h: string) => h === 'Retry-After' ? '2' : null },
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'gen-1', choices: [], usage: {} }),
      });

    const promise = client.chat({ model: 'test/model', messages: [{ role: 'user', content: 'hi' }] });
    await vi.advanceTimersByTimeAsync(2000);
    await promise;

    expect(mockFetch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
```

### Step 2: Run to confirm failure

```bash
npx vitest run --reporter=verbose src/core/openrouter-client.test.ts 2>&1 | tail -20
```

Expected: 5 new tests fail (no retry logic exists yet).

### Step 3: Implement `withRetry`

In `src/core/openrouter-client.ts`, add the private helper and update `chat()`. Replace the full file with:

```ts
import type { OpenRouterModel, ChatRequest, ChatResponse, ChatResponseChunk } from '../shared/types';

const BASE_URL = 'https://openrouter.ai/api/v1';
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 8000;

export class OpenRouterClient {
  constructor(private readonly getApiKey: () => Promise<string | undefined>) {}

  private async headers(): Promise<Record<string, string>> {
    const key = await this.getApiKey();
    if (!key) {
      throw new Error('No API key configured. Please set your OpenRouter API key.');
    }
    return {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/openrouter-chat/vscode',
      'X-Title': 'OpenRouter Chat VSCode',
    };
  }

  private async withRetry(
    fn: () => Promise<Response>,
    signal?: AbortSignal
  ): Promise<Response> {
    let lastResponse: Response | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        let delayMs: number;
        if (lastResponse?.status === 429) {
          const retryAfter = lastResponse.headers.get('Retry-After');
          delayMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : this.backoffDelay(attempt);
        } else {
          delayMs = this.backoffDelay(attempt);
        }
        await this.sleep(delayMs, signal);
        if (signal?.aborted) {
          throw new Error('Request aborted');
        }
      }

      const response = await fn();
      if (response.ok || !RETRYABLE_STATUSES.has(response.status)) {
        return response;
      }
      lastResponse = response;
    }

    // Exhausted retries — throw the last error
    const body = await lastResponse!.text();
    throw new Error(`OpenRouter API error (${lastResponse!.status}): ${body}`);
  }

  private backoffDelay(attempt: number): number {
    const base = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS);
    const jitter = base * 0.2 * (Math.random() * 2 - 1); // ±20%
    return Math.round(base + jitter);
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('Request aborted'));
      }, { once: true });
    });
  }

  async listModels(): Promise<OpenRouterModel[]> {
    const response = await fetch(`${BASE_URL}/models`, {
      headers: await this.headers(),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${body}`);
    }

    const data = await response.json();
    return data.data as OpenRouterModel[];
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const headers = await this.headers();
    const response = await this.withRetry(() =>
      fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...request, stream: false }),
      })
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${body}`);
    }

    return response.json();
  }

  async *chatStream(
    request: ChatRequest,
    signal?: AbortSignal
  ): AsyncGenerator<ChatResponseChunk, void, unknown> {
    const headers = await this.headers();
    const response = await this.withRetry(
      () =>
        fetch(`${BASE_URL}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...request, stream: true }),
          signal,
        }),
      signal
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${body}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') return;

          try {
            yield JSON.parse(data) as ChatResponseChunk;
          } catch {
            // Skip malformed chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
```

Note: `listModels` intentionally does **not** use `withRetry` — it is a read-only catalog fetch, rarely rate-limited, and callers don't expect retries on it. Keep it simple.

### Step 4: Run all tests

```bash
npm test
```

Expected: all 138 tests pass (133 + 5 new).

### Step 5: Commit

```bash
git add src/core/openrouter-client.ts src/core/openrouter-client.test.ts
git commit -m "feat: add exponential backoff retry for 429/5xx in OpenRouterClient"
```

---

## Task 4: deactivate cleanup

**Files:**
- Modify: `src/chat/message-handler.ts`
- Modify: `src/extension.ts`
- Modify: `src/chat/message-handler.test.ts`

### Step 1: Write the failing test

In `src/chat/message-handler.test.ts`, add a test for the new `abort()` method:

```ts
describe('abort', () => {
  it('should abort an in-flight request', async () => {
    // Start a long-running stream that we can interrupt
    const abortController = new AbortController();
    let streamResolve: () => void;
    const neverResolves = new Promise<void>((r) => { streamResolve = r; });

    mockClient.chatStream = vi.fn(async function* () {
      await neverResolves;
    });

    // Start sending (don't await — it's in-flight)
    const sending = handler.handleMessage(
      { type: 'sendMessage', content: 'hello', model: 'test/model' },
      postMessage
    );

    // Abort via the public method
    handler.abort();
    streamResolve!();

    await sending;

    // streamEnd should have been posted (AbortError is caught and treated as normal end)
    expect(postMessage).toHaveBeenCalledWith({ type: 'streamEnd' });
  });

  it('should not throw when abort() is called with no active request', () => {
    expect(() => handler.abort()).not.toThrow();
  });
});
```

### Step 2: Run to confirm failure

```bash
npx vitest run --reporter=verbose src/chat/message-handler.test.ts 2>&1 | grep -A5 "abort"
```

Expected: FAIL — `handler.abort is not a function`.

### Step 3: Add `abort()` to MessageHandler

In `src/chat/message-handler.ts`, add the public method after `handleCancel()`:

```ts
abort(): void {
  this.abortController?.abort();
}
```

### Step 4: Promote messageHandler to module scope in extension.ts

In `src/extension.ts`, find `const messageHandler = new MessageHandler(...)` (currently inside `activate()`). Promote it to module scope:

At the top of the file (after imports), add:

```ts
let messageHandler: MessageHandler | undefined;
```

Inside `activate()`, change:

```ts
const messageHandler = new MessageHandler(client, contextBuilder, settings, toolExecutor, history, notifications);
```

to:

```ts
messageHandler = new MessageHandler(client, contextBuilder, settings, toolExecutor, history, notifications);
```

Update `deactivate()`:

```ts
export function deactivate() {
  messageHandler?.abort();
}
```

### Step 5: Run all tests

```bash
npm test
```

Expected: all 140 tests pass (138 + 2 new).

### Step 6: Commit

```bash
git add src/chat/message-handler.ts src/chat/message-handler.test.ts src/extension.ts
git commit -m "feat: expose abort() on MessageHandler and call it from deactivate()"
```

---

## Task 5: Update features.md

**Files:**
- Modify: `docs/features.md`

### Step 1: Mark all 4 items as implemented

In the **P1 backlog** section, change the 4 remaining items from `:construction:` to `:white_check_mark:` with `~~strikethrough~~` names and "Fixed —" descriptions:

- `Enriched context on ready` → `Fixed — ready handler now calls buildEnrichedContext() so full LSP context is sent on panel open`
- `inlineSuggest kill switch` → `Fixed — provideInlineCompletionItems returns empty when editor.inlineSuggest.enabled is false`
- `Retry with backoff` → `Fixed — withRetry helper in OpenRouterClient retries 429/5xx up to 3 times with exponential backoff and Retry-After support`
- `deactivate cleanup` → `Fixed — MessageHandler.abort() called from deactivate(); VSCode disposes all subscriptions automatically`

Update the **Testing** row: 140 tests across 15 test files.

### Step 2: Full build check

```bash
npm run build 2>&1 | tail -5
```

Expected: Build complete, no errors.

### Step 3: Run tests

```bash
npm test
```

Expected: 140 tests pass.

### Step 4: Commit

```bash
git add docs/features.md
git commit -m "docs: mark all 4 P1 quick-win items as implemented"
```
