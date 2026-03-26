# LLM Provider Abstraction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace `OpenRouterClient` with an injectable `ILLMProvider` interface and implement three providers: OpenRouter (wrapping existing logic), Anthropic (native SDK), and NVIDIA NIM (OpenAI-compatible adapter).

**Architecture:** `ILLMProvider` interface uses OpenAI-compatible types throughout — no changes to `MessageHandler`'s message shapes. Each provider translates internally. `ProviderRegistry` auto-detects provider from model ID (`claude-*` → Anthropic, `nvidia/*` → NIM, else → OpenRouter) with an explicit override setting. `AnthropicProvider` handles tool format translation (OpenAI ↔ Anthropic) and prompt caching transparently.

**Tech Stack:** TypeScript, `@anthropic-ai/sdk`, existing `fetch`-based HTTP, Vitest for tests, VSCode extension API for settings.

---

## Task 1: Define ILLMProvider interface and LLMError

**Files:**
- Create: `src/providers/llm-provider.ts`

**Step 1: Write the failing test**

Create `src/providers/llm-provider.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { LLMError } from './llm-provider';

describe('LLMError', () => {
  it('stores code and message', () => {
    const err = new LLMError('auth', 'Authentication failed');
    expect(err.code).toBe('auth');
    expect(err.message).toBe('Authentication failed');
    expect(err).toBeInstanceOf(Error);
  });

  it('has correct name', () => {
    const err = new LLMError('rate_limit', 'Too many requests');
    expect(err.name).toBe('LLMError');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/providers/llm-provider.test.ts
```
Expected: FAIL — `Cannot find module './llm-provider'`

**Step 3: Implement**

Create `src/providers/llm-provider.ts`:
```ts
import type { ChatRequest, ChatResponseChunk } from '../shared/types';

export type LLMErrorCode = 'auth' | 'rate_limit' | 'quota' | 'unavailable' | 'bad_request' | 'moderation' | 'timeout';

export class LLMError extends Error {
  constructor(
    public readonly code: LLMErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

export interface ProviderModel {
  id: string;
  name: string;
  contextLength: number;
  pricing: { prompt: string; completion: string };
  topProvider?: { maxCompletionTokens?: number };
}

export interface ILLMProvider {
  readonly id: string;
  chatStream(request: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatResponseChunk, void, unknown>;
  listModels(): Promise<ProviderModel[]>;
  getAccountBalance?(): Promise<{ usage: number; limit: number | null }>;
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/providers/llm-provider.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add src/providers/llm-provider.ts src/providers/llm-provider.test.ts
git commit -m "feat(providers): add ILLMProvider interface and LLMError"
```

---

## Task 2: OpenRouterProvider

Move all logic from `src/core/openrouter-client.ts` into a new provider class implementing `ILLMProvider`.

**Files:**
- Create: `src/providers/openrouter-provider.ts`
- Modify: `src/core/openrouter-client.ts` (re-export `OpenRouterProvider` as `OpenRouterClient` for backward compat during migration)

**Step 1: Write the failing test**

Create `src/providers/openrouter-provider.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenRouterProvider } from './openrouter-provider';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('OpenRouterProvider', () => {
  const provider = new OpenRouterProvider(async () => 'test-key');

  it('has id openrouter', () => {
    expect(provider.id).toBe('openrouter');
  });

  it('listModels returns models from API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: 'model-1', name: 'Model 1', context_length: 4096, pricing: { prompt: '0.001', completion: '0.002' } }] }),
    });

    const models = await provider.listModels();
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe('model-1');
    expect(models[0].contextLength).toBe(4096);
  });

  it('getAccountBalance returns usage and limit', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { usage: 5.0, limit: 10.0 } }),
    });

    const balance = await provider.getAccountBalance!();
    expect(balance.usage).toBe(5.0);
    expect(balance.limit).toBe(10.0);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/providers/openrouter-provider.test.ts
```
Expected: FAIL — `Cannot find module './openrouter-provider'`

**Step 3: Implement**

Create `src/providers/openrouter-provider.ts`. Copy all logic from `src/core/openrouter-client.ts` and adapt to implement `ILLMProvider`. Key changes:
- Class name: `OpenRouterProvider` implements `ILLMProvider`
- `readonly id = 'openrouter'`
- `listModels()` maps `OpenRouterModel` → `ProviderModel` (rename `context_length` → `contextLength`, `top_provider` → `topProvider`)
- All other methods (`chatStream`, `getAccountBalance`, `withRetry`, `sleep`, `headers`) stay identical
- Error mapping: keep `OpenRouterError` internally, add `toProviderError()` helper that maps HTTP status codes to `LLMError` codes

```ts
import type { ChatRequest, ChatResponseChunk } from '../shared/types';
import type { ILLMProvider, ProviderModel } from './llm-provider';
import { LLMError } from './llm-provider';

const BASE_URL = 'https://openrouter.ai/api/v1';
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 8000;
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

function toProviderError(status: number, message: string): LLMError {
  if (status === 401) return new LLMError('auth', message);
  if (status === 402) return new LLMError('quota', message);
  if (status === 403) return new LLMError('moderation', message);
  if (status === 408) return new LLMError('timeout', message);
  if (status === 429) return new LLMError('rate_limit', message);
  if (status === 400) return new LLMError('bad_request', message);
  return new LLMError('unavailable', message);
}

export class OpenRouterProvider implements ILLMProvider {
  readonly id = 'openrouter';

  constructor(private readonly getApiKey: () => Promise<string | undefined>) {}

  // ... (copy withRetry, sleep, headers from openrouter-client.ts verbatim)
  // listModels: fetch + map to ProviderModel
  // chatStream: identical to existing implementation
  // getAccountBalance: identical to existing implementation
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/providers/openrouter-provider.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add src/providers/openrouter-provider.ts src/providers/openrouter-provider.test.ts
git commit -m "feat(providers): add OpenRouterProvider implementing ILLMProvider"
```

---

## Task 3: Install Anthropic SDK

**Step 1: Install**

```bash
npm install @anthropic-ai/sdk
```

**Step 2: Verify**

```bash
node -e "require('@anthropic-ai/sdk'); console.log('OK')"
```
Expected: `OK`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install @anthropic-ai/sdk"
```

---

## Task 4: AnthropicProvider — translation helpers

The Anthropic SDK uses a different format than OpenAI. Before building the full provider, implement and test the translation functions in isolation.

**Files:**
- Create: `src/providers/anthropic-provider.ts` (translation helpers only, no full class yet)

**Step 1: Write the failing tests**

Create `src/providers/anthropic-provider.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  toAnthropicTools,
  toAnthropicMessages,
  fromAnthropicChunk,
} from './anthropic-provider';

describe('toAnthropicTools', () => {
  it('converts OpenAI tool format to Anthropic format', () => {
    const tools = [{
      type: 'function' as const,
      function: {
        name: 'read_file',
        description: 'Read a file',
        parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      }
    }];

    const result = toAnthropicTools(tools);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('read_file');
    expect(result[0].description).toBe('Read a file');
    expect(result[0].input_schema).toEqual(tools[0].function.parameters);
    expect((result[0] as any).type).toBeUndefined();
    expect((result[0] as any).function).toBeUndefined();
  });
});

describe('toAnthropicMessages', () => {
  it('passes through user and assistant text messages', () => {
    const messages = [
      { role: 'user' as const, content: 'Hello' },
      { role: 'assistant' as const, content: 'Hi there' },
    ];
    const result = toAnthropicMessages(messages);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ role: 'user', content: 'Hello' });
  });

  it('converts tool result messages to Anthropic tool_result blocks', () => {
    const messages = [{
      role: 'tool' as const,
      tool_call_id: 'call_abc',
      content: '{"result": "file contents"}',
    }];
    // Tool results must be embedded in a user message in Anthropic format
    const result = toAnthropicMessages(messages);
    expect(result[0].role).toBe('user');
    const content = result[0].content as any[];
    expect(content[0].type).toBe('tool_result');
    expect(content[0].tool_use_id).toBe('call_abc');
    expect(content[0].content).toBe('{"result": "file contents"}');
  });

  it('converts assistant tool_calls to tool_use content blocks', () => {
    const messages = [{
      role: 'assistant' as const,
      content: '',
      tool_calls: [{
        id: 'call_abc',
        type: 'function' as const,
        function: { name: 'read_file', arguments: '{"path": "/foo.ts"}' },
      }],
    }];
    const result = toAnthropicMessages(messages);
    expect(result[0].role).toBe('assistant');
    const content = result[0].content as any[];
    expect(content[0].type).toBe('tool_use');
    expect(content[0].id).toBe('call_abc');
    expect(content[0].name).toBe('read_file');
    expect(content[0].input).toEqual({ path: '/foo.ts' });
  });
});

describe('fromAnthropicChunk', () => {
  it('converts text delta to ChatResponseChunk', () => {
    const event = { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } };
    const chunk = fromAnthropicChunk(event, 'msg_1', null);
    expect(chunk?.choices[0].delta.content).toBe('Hello');
  });

  it('converts tool_use stop to finish_reason tool_calls', () => {
    const event = { type: 'message_delta', delta: { stop_reason: 'tool_use' } };
    const chunk = fromAnthropicChunk(event, 'msg_1', null);
    expect(chunk?.choices[0].finish_reason).toBe('tool_calls');
  });

  it('converts end_turn stop to finish_reason stop', () => {
    const event = { type: 'message_delta', delta: { stop_reason: 'end_turn' } };
    const chunk = fromAnthropicChunk(event, 'msg_1', null);
    expect(chunk?.choices[0].finish_reason).toBe('stop');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/providers/anthropic-provider.test.ts
```
Expected: FAIL — `Cannot find module './anthropic-provider'`

**Step 3: Implement translation helpers**

In `src/providers/anthropic-provider.ts`, export only the translation functions (no class yet):

```ts
import type { ChatMessage, ToolDefinition, ChatResponseChunk } from '../shared/types';

// OpenAI ToolDefinition → Anthropic tool format
export function toAnthropicTools(tools: ToolDefinition[]) {
  return tools.map(t => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
}

// OpenAI ChatMessage[] → Anthropic message[] (excludes system — handled separately)
export function toAnthropicMessages(messages: ChatMessage[]): Array<{ role: 'user' | 'assistant'; content: unknown }> {
  const result: Array<{ role: 'user' | 'assistant'; content: unknown }> = [];

  for (const msg of messages) {
    if (msg.role === 'system') continue;

    if (msg.role === 'tool') {
      // Tool results → user message with tool_result content block
      result.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: msg.tool_call_id,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        }],
      });
      continue;
    }

    if (msg.role === 'assistant' && msg.tool_calls?.length) {
      // Assistant with tool calls → tool_use content blocks
      const content: unknown[] = [];
      if (msg.content) content.push({ type: 'text', text: typeof msg.content === 'string' ? msg.content : '' });
      for (const tc of msg.tool_calls) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments || '{}'),
        });
      }
      result.push({ role: 'assistant', content });
      continue;
    }

    result.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
  }

  return result;
}

// Anthropic streaming event → ChatResponseChunk (returns null for events we ignore)
export function fromAnthropicChunk(
  event: Record<string, unknown>,
  messageId: string,
  toolUseAccumulator: Map<number, { id: string; name: string; input: string }> | null
): ChatResponseChunk | null {
  const makeChunk = (delta: ChatResponseChunk['choices'][0]['delta'], finishReason: string | null = null): ChatResponseChunk => ({
    id: messageId,
    choices: [{ delta, finish_reason: finishReason }],
  });

  if (event.type === 'content_block_delta') {
    const d = event.delta as Record<string, unknown>;
    if (d.type === 'text_delta') {
      return makeChunk({ content: d.text as string });
    }
    if (d.type === 'input_json_delta' && toolUseAccumulator) {
      const index = event.index as number;
      const acc = toolUseAccumulator.get(index);
      if (acc) acc.input += d.partial_json as string;
      return makeChunk({ tool_calls: [{ index, function: { arguments: d.partial_json as string } }] });
    }
  }

  if (event.type === 'content_block_start') {
    const block = event.content_block as Record<string, unknown>;
    if (block.type === 'tool_use' && toolUseAccumulator) {
      const index = event.index as number;
      toolUseAccumulator.set(index, { id: block.id as string, name: block.name as string, input: '' });
      return makeChunk({ tool_calls: [{ index, id: block.id as string, type: 'function', function: { name: block.name as string, arguments: '' } }] });
    }
  }

  if (event.type === 'message_delta') {
    const d = event.delta as Record<string, unknown>;
    const stopReason = d.stop_reason as string;
    const finishReason = stopReason === 'tool_use' ? 'tool_calls' : stopReason === 'end_turn' ? 'stop' : stopReason;
    return makeChunk({}, finishReason);
  }

  if (event.type === 'message_start') {
    const msg = event.message as Record<string, unknown>;
    const usage = msg.usage as Record<string, number> | undefined;
    if (usage) {
      return { id: messageId, choices: [{ delta: {}, finish_reason: null }], usage: { prompt_tokens: usage.input_tokens ?? 0, completion_tokens: usage.output_tokens ?? 0, total_tokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0) } };
    }
  }

  return null;
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/providers/anthropic-provider.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add src/providers/anthropic-provider.ts src/providers/anthropic-provider.test.ts
git commit -m "feat(providers): add Anthropic message/tool translation helpers"
```

---

## Task 5: AnthropicProvider — full class with streaming

**Files:**
- Modify: `src/providers/anthropic-provider.ts` (add the class)

**Step 1: Add streaming integration tests to the existing test file**

Append to `src/providers/anthropic-provider.test.ts`:
```ts
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicProvider } from './anthropic-provider';

vi.mock('@anthropic-ai/sdk');

describe('AnthropicProvider', () => {
  it('has id anthropic', () => {
    const p = new AnthropicProvider(async () => 'key');
    expect(p.id).toBe('anthropic');
  });

  it('listModels returns static model list', async () => {
    const p = new AnthropicProvider(async () => 'key');
    const models = await p.listModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models[0].id).toMatch(/claude/);
  });

  it('throws LLMError with auth code on AuthenticationError', async () => {
    const { LLMError } = await import('./llm-provider');
    const mockStream = { [Symbol.asyncIterator]: async function*() { throw new Anthropic.AuthenticationError(401, {} as any, '', {} as any); } };
    (Anthropic as any).mockImplementation(() => ({
      messages: { stream: vi.fn().mockReturnValue(mockStream) }
    }));

    const p = new AnthropicProvider(async () => 'key');
    const gen = p.chatStream({ model: 'claude-sonnet-4-6', messages: [{ role: 'user', content: 'hi' }] });
    await expect(gen.next()).rejects.toBeInstanceOf(LLMError);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/providers/anthropic-provider.test.ts
```
Expected: FAIL — `AnthropicProvider is not exported`

**Step 3: Implement the class**

Append to `src/providers/anthropic-provider.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk';
import type { ILLMProvider, ProviderModel } from './llm-provider';
import { LLMError } from './llm-provider';

// Static model list — Anthropic doesn't expose a /models endpoint in the same way
const ANTHROPIC_MODELS: ProviderModel[] = [
  { id: 'claude-opus-4-6',    name: 'Claude Opus 4.6',    contextLength: 200000, pricing: { prompt: '0.015',  completion: '0.075'  } },
  { id: 'claude-sonnet-4-6',  name: 'Claude Sonnet 4.6',  contextLength: 200000, pricing: { prompt: '0.003',  completion: '0.015'  } },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', contextLength: 200000, pricing: { prompt: '0.00025', completion: '0.00125' } },
];

export class AnthropicProvider implements ILLMProvider {
  readonly id = 'anthropic';

  constructor(private readonly getApiKey: () => Promise<string | undefined>) {}

  async listModels(): Promise<ProviderModel[]> {
    return ANTHROPIC_MODELS;
  }

  async *chatStream(request: import('../shared/types').ChatRequest, signal?: AbortSignal): AsyncGenerator<import('../shared/types').ChatResponseChunk, void, unknown> {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new LLMError('auth', 'No Anthropic API key configured. Set lucentCode.providers.anthropic.apiKey.');

    const client = new Anthropic({ apiKey });

    // Extract system message
    const systemMsg = request.messages.find(m => m.role === 'system');
    const system = systemMsg ? [{
      type: 'text' as const,
      text: typeof systemMsg.content === 'string' ? systemMsg.content : '',
      cache_control: { type: 'ephemeral' as const },  // prompt caching, transparent to caller
    }] : undefined;

    const nonSystemMessages = request.messages.filter(m => m.role !== 'system');
    const anthropicMessages = toAnthropicMessages(nonSystemMessages);
    const tools = request.tools ? toAnthropicTools(request.tools) : undefined;

    const toolUseAccumulator = new Map<number, { id: string; name: string; input: string }>();

    try {
      const stream = client.messages.stream({
        model: request.model,
        max_tokens: request.max_tokens ?? 4096,
        temperature: request.temperature,
        system,
        messages: anthropicMessages as Anthropic.MessageParam[],
        tools: tools as Anthropic.Tool[] | undefined,
      });

      if (signal) {
        signal.addEventListener('abort', () => stream.abort(), { once: true });
      }

      for await (const event of stream) {
        const chunk = fromAnthropicChunk(event as unknown as Record<string, unknown>, '', toolUseAccumulator);
        if (chunk) yield chunk;
      }
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw new LLMError('auth', err.message);
      if (err instanceof Anthropic.RateLimitError) throw new LLMError('rate_limit', err.message);
      if (err instanceof Anthropic.APIConnectionError) throw new LLMError('unavailable', err.message);
      if (err instanceof Anthropic.BadRequestError) throw new LLMError('bad_request', err.message);
      throw err;
    }
  }
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/providers/anthropic-provider.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add src/providers/anthropic-provider.ts src/providers/anthropic-provider.test.ts
git commit -m "feat(providers): add AnthropicProvider with streaming and tool translation"
```

---

## Task 6: NvidiaNimProvider

**Files:**
- Create: `src/providers/nvidia-nim-provider.ts`
- Create: `src/providers/nvidia-nim-provider.test.ts`

**Step 1: Write the failing test**

Create `src/providers/nvidia-nim-provider.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { NvidiaNimProvider } from './nvidia-nim-provider';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('NvidiaNimProvider', () => {
  const provider = new NvidiaNimProvider(async () => 'test-key');

  it('has id nvidia-nim', () => {
    expect(provider.id).toBe('nvidia-nim');
  });

  it('listModels returns static curated list', async () => {
    const models = await provider.listModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models.some(m => m.id.includes('nemotron') || m.id.includes('nvidia'))).toBe(true);
  });

  it('chatStream calls NVIDIA NIM endpoint', async () => {
    const lines = [
      'data: {"id":"1","choices":[{"delta":{"content":"Hi"},"finish_reason":null}]}',
      'data: {"id":"1","choices":[{"delta":{},"finish_reason":"stop"}]}',
      'data: [DONE]',
    ].join('\n');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: {
        getReader: () => {
          let done = false;
          return {
            read: async () => done ? { done: true, value: undefined } : (() => { done = true; return { done: false, value: new TextEncoder().encode(lines) }; })(),
            releaseLock: () => {},
          };
        }
      }
    });

    const chunks = [];
    for await (const chunk of provider.chatStream({ model: 'nvidia/nemotron-super-49b-v1', messages: [{ role: 'user', content: 'hi' }] })) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBeGreaterThan(0);

    const [, url] = mockFetch.mock.calls[0];
    // Verify it hit the NIM endpoint
    expect(mockFetch.mock.calls[0][0]).toContain('integrate.api.nvidia.com');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/providers/nvidia-nim-provider.test.ts
```
Expected: FAIL — `Cannot find module './nvidia-nim-provider'`

**Step 3: Implement**

Create `src/providers/nvidia-nim-provider.ts`:

```ts
import type { ChatRequest, ChatResponseChunk } from '../shared/types';
import type { ILLMProvider, ProviderModel } from './llm-provider';
import { LLMError } from './llm-provider';

const DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 8000;
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

// Curated static list — NIM doesn't expose a standard /models list
const NIM_MODELS: ProviderModel[] = [
  { id: 'nvidia/nemotron-super-49b-v1',        name: 'Nemotron Super 49B',         contextLength: 32768,  pricing: { prompt: '0', completion: '0' } },
  { id: 'nvidia/nemotron-nano-8b-instruct',     name: 'Nemotron Nano 8B',           contextLength: 8192,   pricing: { prompt: '0', completion: '0' } },
  { id: 'meta/llama-3.1-70b-instruct',         name: 'Llama 3.1 70B (NIM)',        contextLength: 128000, pricing: { prompt: '0', completion: '0' } },
  { id: 'meta/llama-3.1-8b-instruct',          name: 'Llama 3.1 8B (NIM)',         contextLength: 128000, pricing: { prompt: '0', completion: '0' } },
  { id: 'mistralai/mistral-7b-instruct-v0.3',  name: 'Mistral 7B Instruct (NIM)',  contextLength: 32768,  pricing: { prompt: '0', completion: '0' } },
];

export class NvidiaNimProvider implements ILLMProvider {
  readonly id = 'nvidia-nim';

  constructor(
    private readonly getApiKey: () => Promise<string | undefined>,
    private readonly baseUrl: string = DEFAULT_BASE_URL
  ) {}

  async listModels(): Promise<ProviderModel[]> {
    return NIM_MODELS;
  }

  private async headers(): Promise<Record<string, string>> {
    const key = await this.getApiKey();
    if (!key) throw new LLMError('auth', 'No NVIDIA NIM API key configured. Set lucentCode.providers.nvidianim.apiKey.');
    return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
    });
  }

  private async withRetry(fn: () => Promise<Response>, signal?: AbortSignal): Promise<Response> {
    let lastError: Error = new Error('Retry exhausted');
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await fn();
      if (response.ok) return response;
      const body = await response.text();
      const msg = `NIM API error (${response.status}): ${body}`;
      if (!RETRYABLE.has(response.status)) {
        if (response.status === 401) throw new LLMError('auth', msg);
        if (response.status === 429) throw new LLMError('rate_limit', msg);
        throw new LLMError('bad_request', msg);
      }
      lastError = new LLMError('unavailable', msg);
      if (attempt < MAX_RETRIES) {
        const base = Math.min(RETRY_BASE_MS * Math.pow(2, attempt), RETRY_MAX_MS);
        await this.sleep(Math.round(base + base * 0.2 * (Math.random() * 2 - 1)), signal);
      }
    }
    throw lastError;
  }

  async *chatStream(request: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatResponseChunk, void, unknown> {
    const headers = await this.headers();
    const response = await this.withRetry(() =>
      fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST', headers,
        body: JSON.stringify({ ...request, stream: true }),
        signal,
      }), signal
    );

    const reader = response.body?.getReader();
    if (!reader) throw new LLMError('unavailable', 'No response body from NIM');
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
          if (!trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') return;
          try { yield JSON.parse(data) as ChatResponseChunk; } catch { /* skip malformed */ }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/providers/nvidia-nim-provider.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add src/providers/nvidia-nim-provider.ts src/providers/nvidia-nim-provider.test.ts
git commit -m "feat(providers): add NvidiaNimProvider with OpenAI-compatible streaming"
```

---

## Task 7: ProviderRegistry

**Files:**
- Create: `src/providers/provider-registry.ts`
- Create: `src/providers/provider-registry.test.ts`

**Step 1: Write the failing tests**

Create `src/providers/provider-registry.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { ProviderRegistry } from './provider-registry';

const mockSettings = {
  anthropicApiKey: 'anthro-key',
  nvidiaApiKey: 'nvidia-key',
  nvidiaBaseUrl: '',
  providerOverride: '',
};

describe('ProviderRegistry.resolve auto-detect', () => {
  const registry = new ProviderRegistry(mockSettings as any);

  it('routes claude-* to anthropic', () => {
    expect(registry.resolve('claude-sonnet-4-6').id).toBe('anthropic');
    expect(registry.resolve('claude-opus-4-6').id).toBe('anthropic');
  });

  it('routes anthropic/* to anthropic', () => {
    expect(registry.resolve('anthropic/claude-3-5-sonnet').id).toBe('anthropic');
  });

  it('routes nvidia/* to nvidia-nim', () => {
    expect(registry.resolve('nvidia/nemotron-super-49b-v1').id).toBe('nvidia-nim');
  });

  it('routes nv-* to nvidia-nim', () => {
    expect(registry.resolve('nv-mistralai/mistral-7b').id).toBe('nvidia-nim');
  });

  it('routes everything else to openrouter', () => {
    expect(registry.resolve('gpt-4o').id).toBe('openrouter');
    expect(registry.resolve('meta-llama/llama-3.1-70b-instruct').id).toBe('openrouter');
    expect(registry.resolve('mistralai/mistral-7b-instruct').id).toBe('openrouter');
  });
});

describe('ProviderRegistry.resolve with override', () => {
  it('forces openrouter when override is openrouter', () => {
    const r = new ProviderRegistry({ ...mockSettings, providerOverride: 'openrouter' } as any);
    expect(r.resolve('claude-sonnet-4-6').id).toBe('openrouter');
  });

  it('forces anthropic when override is anthropic', () => {
    const r = new ProviderRegistry({ ...mockSettings, providerOverride: 'anthropic' } as any);
    expect(r.resolve('gpt-4o').id).toBe('anthropic');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/providers/provider-registry.test.ts
```
Expected: FAIL — `Cannot find module './provider-registry'`

**Step 3: Implement**

Create `src/providers/provider-registry.ts`:
```ts
import type { ILLMProvider } from './llm-provider';
import { OpenRouterProvider } from './openrouter-provider';
import { AnthropicProvider } from './anthropic-provider';
import { NvidiaNimProvider } from './nvidia-nim-provider';

export interface ProviderSettings {
  openRouterApiKey: () => Promise<string | undefined>;
  anthropicApiKey: () => Promise<string | undefined>;
  nvidiaApiKey: () => Promise<string | undefined>;
  nvidiaBaseUrl: string;
  providerOverride: string;
}

export class ProviderRegistry {
  private readonly openRouter: OpenRouterProvider;
  private readonly anthropic: AnthropicProvider;
  private readonly nvidianim: NvidiaNimProvider;

  constructor(settings: ProviderSettings) {
    this.openRouter = new OpenRouterProvider(settings.openRouterApiKey);
    this.anthropic  = new AnthropicProvider(settings.anthropicApiKey);
    this.nvidianim  = new NvidiaNimProvider(settings.nvidiaApiKey, settings.nvidiaBaseUrl || undefined);
  }

  resolve(modelId: string): ILLMProvider {
    const override = this.settings?.providerOverride;
    if (override === 'anthropic') return this.anthropic;
    if (override === 'nvidia-nim') return this.nvidianim;
    if (override === 'openrouter') return this.openRouter;

    const id = modelId.toLowerCase();
    if (id.startsWith('claude-') || id.startsWith('anthropic/')) return this.anthropic;
    if (id.startsWith('nvidia/') || id.startsWith('nv-')) return this.nvidianim;
    return this.openRouter;
  }

  // Expose individual providers for model listing (each provider lists its own models)
  get all(): ILLMProvider[] {
    return [this.openRouter, this.anthropic, this.nvidianim];
  }
}
```

Note: `settings` needs to be stored on the instance — fix the `resolve` method to not reference `this.settings` (pass override in constructor instead):

```ts
export class ProviderRegistry {
  private readonly openRouter: OpenRouterProvider;
  private readonly anthropic: AnthropicProvider;
  private readonly nvidianim: NvidiaNimProvider;
  private readonly override: string;

  constructor(settings: ProviderSettings) {
    this.openRouter = new OpenRouterProvider(settings.openRouterApiKey);
    this.anthropic  = new AnthropicProvider(settings.anthropicApiKey);
    this.nvidianim  = new NvidiaNimProvider(settings.nvidiaApiKey, settings.nvidiaBaseUrl || undefined);
    this.override   = settings.providerOverride ?? '';
  }

  resolve(modelId: string): ILLMProvider {
    if (this.override === 'anthropic') return this.anthropic;
    if (this.override === 'nvidia-nim') return this.nvidianim;
    if (this.override === 'openrouter') return this.openRouter;

    const id = modelId.toLowerCase();
    if (id.startsWith('claude-') || id.startsWith('anthropic/')) return this.anthropic;
    if (id.startsWith('nvidia/') || id.startsWith('nv-')) return this.nvidianim;
    return this.openRouter;
  }

  get all(): ILLMProvider[] {
    return [this.openRouter, this.anthropic, this.nvidianim];
  }
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/providers/provider-registry.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add src/providers/provider-registry.ts src/providers/provider-registry.test.ts
git commit -m "feat(providers): add ProviderRegistry with auto-detect and override"
```

---

## Task 8: Add provider settings to package.json and Settings class

**Files:**
- Modify: `package.json` (add configuration properties)
- Modify: `src/core/settings.ts` (add getters for new keys)

**Step 1: Add configuration keys to package.json**

In `package.json`, find the `contributes.configuration.properties` object and add after the last existing property:

```json
"lucentCode.providers.anthropic.apiKey": {
  "type": "string",
  "default": "",
  "description": "Anthropic API key for direct Claude access (prompt caching, native tool calling). Get one at console.anthropic.com.",
  "markdownDescription": "Anthropic API key for direct Claude access (prompt caching, native tool calling). Get one at [console.anthropic.com](https://console.anthropic.com)."
},
"lucentCode.providers.nvidianim.apiKey": {
  "type": "string",
  "default": "",
  "description": "NVIDIA NIM API key. Get one at build.nvidia.com."
},
"lucentCode.providers.nvidianim.baseUrl": {
  "type": "string",
  "default": "https://integrate.api.nvidia.com/v1",
  "description": "NVIDIA NIM API base URL (default: integrate.api.nvidia.com/v1)."
},
"lucentCode.providers.override": {
  "type": "string",
  "default": "",
  "enum": ["", "anthropic", "nvidia-nim", "openrouter"],
  "enumDescriptions": [
    "Auto-detect from model ID (recommended)",
    "Always use Anthropic directly",
    "Always use NVIDIA NIM",
    "Always use OpenRouter"
  ],
  "description": "Force a specific LLM provider. Leave empty for auto-detection based on model ID."
}
```

**Step 2: Add getters to Settings class**

In `src/core/settings.ts`, add after the existing getters:

```ts
get anthropicApiKey(): string {
  return this.config.get<string>('providers.anthropic.apiKey', '');
}

get nvidiaApiKey(): string {
  return this.config.get<string>('providers.nvidianim.apiKey', '');
}

get nvidiaBaseUrl(): string {
  return this.config.get<string>('providers.nvidianim.baseUrl', '');
}

get providerOverride(): string {
  return this.config.get<string>('providers.override', '');
}
```

**Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

**Step 4: Commit**

```bash
git add package.json src/core/settings.ts
git commit -m "feat(settings): add provider API key and override configuration"
```

---

## Task 9: Wire MessageHandler to ILLMProvider

**Files:**
- Modify: `src/chat/message-handler.ts`

**Step 1: Update the import and constructor**

At the top of `src/chat/message-handler.ts`, replace:
```ts
import { OpenRouterClient, OpenRouterError } from '../core/openrouter-client';
```
with:
```ts
import type { ILLMProvider } from '../providers/llm-provider';
import { LLMError } from '../providers/llm-provider';
```

In the constructor, replace:
```ts
private readonly client: OpenRouterClient,
```
with:
```ts
private readonly provider: ILLMProvider,
```

**Step 2: Update chatStream call site**

At line ~392, replace `this.client.chatStream(` with `this.provider.chatStream(`.

**Step 3: Update listModels call site**

In `handleGetModels`, replace `this.client.listModels()` with `this.provider.listModels()` and update the `setModelPricing` call — `ProviderModel` uses `contextLength` instead of `context_length`. Update `setModelPricing` to accept `ProviderModel[]`.

**Step 4: Update error handling**

Replace `handleApiError(error: OpenRouterError, ...)` with `handleApiError(error: LLMError, ...)` and update the switch to use `LLMError` code strings:

```ts
private async handleApiError(error: LLMError, postMessage: (msg: ExtensionMessage) => void): Promise<void> {
  switch (error.code) {
    case 'auth':
      this.onAuthInvalid?.();
      postMessage({ type: 'streamError', error: 'Authentication failed — please check your API key in settings.' });
      break;
    case 'quota':
      postMessage({ type: 'noCredits' });
      postMessage({ type: 'streamError', error: 'Insufficient credits. Please top up your account balance.' });
      break;
    case 'bad_request':
      postMessage({ type: 'streamError', error: `Bad request: ${error.message}` });
      break;
    case 'moderation':
      postMessage({ type: 'streamError', error: 'Content flagged by moderation policy.' });
      break;
    case 'timeout':
      postMessage({ type: 'streamError', error: 'Request timed out. Please try again.' });
      break;
    case 'rate_limit':
      postMessage({ type: 'streamError', error: 'Rate limit reached. Please wait a moment and try again.' });
      break;
    case 'unavailable':
      postMessage({ type: 'streamError', error: 'The model is temporarily unavailable. Try switching to a different model.' });
      break;
    default:
      await this.notifications.handleError(error.message);
      postMessage({ type: 'streamError', error: error.message });
  }
}
```

Also update the catch block in `handleSendMessage` to catch `LLMError` instead of `OpenRouterError`.

**Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

**Step 6: Run existing message-handler tests**

```bash
npx vitest run src/chat/message-handler.test.ts
```
Note: tests will fail because they inject `OpenRouterClient`. Fix the mock in the next task.

**Step 7: Commit**

```bash
git add src/chat/message-handler.ts
git commit -m "refactor(handler): swap OpenRouterClient for ILLMProvider"
```

---

## Task 10: Update InlineCompletionProvider and message-handler tests

**Files:**
- Modify: `src/completions/inline-provider.ts`
- Modify: `src/chat/message-handler.test.ts`

**Step 1: Update InlineCompletionProvider**

In `src/completions/inline-provider.ts`, replace `OpenRouterClient` with `ILLMProvider`:
```ts
import type { ILLMProvider } from '../providers/llm-provider';
// ...
constructor(
  private readonly client: ILLMProvider,  // was OpenRouterClient
  private readonly settings: Settings
)
```

The `inline-provider.ts` calls `this.client.chat(...)` (non-streaming). Check if it uses the `chat()` method — if so, either add `chat()` to `ILLMProvider` or switch it to use `chatStream` and collect the full response. Look at the actual usage and use the minimal fix.

**Step 2: Update message-handler tests**

In `src/chat/message-handler.test.ts`, replace the mock:
```ts
// Old:
const mockClient = { chatStream: vi.fn(), listModels: vi.fn(), getAccountBalance: vi.fn() } as unknown as OpenRouterClient;

// New:
import type { ILLMProvider } from '../providers/llm-provider';
const mockProvider: ILLMProvider = {
  id: 'openrouter',
  chatStream: vi.fn(),
  listModels: vi.fn(),
  getAccountBalance: vi.fn(),
};
```
Update all `MessageHandler` constructor calls to pass `mockProvider`.

**Step 3: Run all tests**

```bash
npx vitest run
```
Expected: PASS

**Step 4: Commit**

```bash
git add src/completions/inline-provider.ts src/chat/message-handler.test.ts
git commit -m "refactor: update InlineProvider and tests to use ILLMProvider"
```

---

## Task 11: Wire extension.ts to use ProviderRegistry

**Files:**
- Modify: `src/extension.ts`

**Step 1: Replace client construction**

In `src/extension.ts`, replace:
```ts
import { OpenRouterClient } from './core/openrouter-client';
// ...
const client = new OpenRouterClient(() => auth.getApiKey());
```
with:
```ts
import { ProviderRegistry } from './providers/provider-registry';
// ...
const providerRegistry = new ProviderRegistry({
  openRouterApiKey: () => auth.getApiKey(),
  anthropicApiKey:  async () => settings.anthropicApiKey || undefined,
  nvidiaApiKey:     async () => settings.nvidiaApiKey || undefined,
  nvidiaBaseUrl:    settings.nvidiaBaseUrl,
  providerOverride: settings.providerOverride,
});
```

**Step 2: Update MessageHandler construction**

Replace `client` with a dynamic provider resolver. Since the model can change mid-session, pass a proxy or resolve at call time. The simplest approach: create a thin `DynamicProvider` that delegates to the registry based on the current model. Or pass the registry itself and let `MessageHandler` resolve it per-message.

Update `MessageHandler` constructor to accept `ProviderRegistry` and resolve the provider inside `handleSendMessage`:
```ts
// In MessageHandler constructor:
private readonly providerRegistry: ProviderRegistry

// In handleSendMessage:
const provider = this.providerRegistry.resolve(model);
// use provider.chatStream(...) instead of this.provider.chatStream(...)
```

**Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

**Step 4: Commit**

```bash
git add src/extension.ts src/chat/message-handler.ts
git commit -m "feat(extension): wire ProviderRegistry into MessageHandler"
```

---

## Task 12: Provider badge in webview

**Files:**
- Modify: `webview/src/App.tsx` or the model selector component

**Step 1: Send provider ID with model info**

In `extension.ts` or `message-handler.ts`, when posting `modelChanged` or alongside model info, include the active provider ID. Add `provider?: string` to the `modelChanged` message type in `src/shared/types.ts`:
```ts
| { type: 'modelChanged'; modelId: string; provider?: string }
```

**Step 2: Display in webview**

In the model selector component, display a small badge after the model name:
```tsx
{providerName && (
  <span className="provider-badge">{providerName}</span>
)}
```

Style in CSS:
```css
.provider-badge {
  font-size: 0.7em;
  opacity: 0.6;
  margin-left: 4px;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  padding: 1px 4px;
  border-radius: 3px;
}
```

**Step 3: Run all tests**

```bash
npx vitest run
```
Expected: PASS

**Step 4: Build and verify**

```bash
npm run compile
```
Expected: no errors

**Step 5: Commit**

```bash
git add src/shared/types.ts webview/src/
git commit -m "feat(ui): show active provider badge next to model name"
```

---

## Task 13: Final verification

**Step 1: Run full test suite**

```bash
npx vitest run
```
Expected: all tests PASS

**Step 2: TypeScript clean compile**

```bash
npx tsc --noEmit
```
Expected: no errors

**Step 3: Build vsix**

```bash
npm run package
```
Expected: `.vsix` file generated without errors

**Step 4: Commit if anything was adjusted**

```bash
git add -A
git commit -m "chore: final cleanup and verification"
```
