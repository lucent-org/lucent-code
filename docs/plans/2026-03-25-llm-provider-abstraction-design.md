# LLM Provider Abstraction — Design

**Date:** 2026-03-25
**Status:** Approved

## Goal

Replace the hardcoded `OpenRouterClient` with an injectable `ILLMProvider` interface. Implement three providers: Anthropic (native SDK), OpenRouter (existing logic wrapped), and NVIDIA NIM (OpenAI-compatible adapter). `MessageHandler` becomes provider-agnostic.

## Motivation

The extension is currently limited to OpenRouter's proxy layer, which means:
- No native tool calling (OpenRouter injects prompt hacks for models without it)
- No prompt caching (Anthropic `cache_control` headers unavailable)
- No extended thinking support
- No direct NVIDIA NIM access

Native API support per provider unlocks these capabilities without changing the core message loop.

---

## Interface

**File:** `src/providers/llm-provider.ts`

```ts
export interface ILLMProvider {
  readonly id: 'openrouter' | 'anthropic' | 'nvidia-nim';
  chatStream(request: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatResponseChunk>;
  listModels(): Promise<ProviderModel[]>;
  getAccountBalance?(): Promise<{ usage: number; limit: number | null }>;
}

export interface ProviderModel {
  id: string;
  name: string;
  contextLength: number;
  pricing: { prompt: string; completion: string };
}
```

All types remain OpenAI-compatible (`ChatRequest`, `ChatResponseChunk`, `ChatMessage`, `ToolDefinition`). Providers translate internally — `MessageHandler` never changes its message shapes.

---

## Providers

### OpenRouterProvider (`src/providers/openrouter-provider.ts`)
Wraps existing `openrouter-client.ts` logic. No behavioral changes — streaming, retry, balance check all stay identical. This is a structural lift-and-shift.

### AnthropicProvider (`src/providers/anthropic-provider.ts`)
Uses `@anthropic-ai/sdk`. Translates OpenAI-compatible types to Anthropic format and back.

**Tool definition translation (outbound):**
```
{ type: 'function', function: { name, description, parameters } }
→ { name, description, input_schema: parameters }
```

**Tool call translation (inbound, streaming):**
```
Anthropic: stop_reason 'tool_use', content block { type: 'tool_use', id, name, input }
→ finish_reason: 'tool_calls', delta.tool_calls: [{ id, function: { name, arguments: JSON.stringify(input) } }]
```

**Tool result translation (outbound, next turn):**
```
ChatMessage { role: 'tool', tool_call_id, content }
→ { type: 'tool_result', tool_use_id: tool_call_id, content }
```

**Prompt caching:** System message is sent as a content block with `cache_control: { type: 'ephemeral' }` — transparent to `MessageHandler`.

### NvidiaNimProvider (`src/providers/nvidia-nim-provider.ts`)
OpenAI-compatible endpoint at `https://integrate.api.nvidia.com/v1`. Minimal adapter — same streaming/retry logic as OpenRouter, different base URL and auth header. Model list is static (curated) since NIM doesn't expose a `/models` endpoint in the same way.

---

## Provider Resolution

**File:** `src/providers/provider-registry.ts`

```ts
class ProviderRegistry {
  resolve(modelId: string, settings: Settings): ILLMProvider
}
```

**Resolution order:**
1. Explicit override from `lucentCode.providers.override` setting
2. Auto-detect from model ID:
   - `claude-*` or `anthropic/*` → `AnthropicProvider`
   - `nvidia/*` or `nv-*` → `NvidiaNimProvider`
   - everything else → `OpenRouterProvider`

---

## Settings

New VSCode configuration keys (added to `package.json` contributes):

| Key | Default | Purpose |
|-----|---------|---------|
| `lucentCode.providers.anthropic.apiKey` | `""` | Anthropic API key |
| `lucentCode.providers.nvidianim.apiKey` | `""` | NVIDIA NIM API key |
| `lucentCode.providers.nvidianim.baseUrl` | `https://integrate.api.nvidia.com/v1` | NIM endpoint |
| `lucentCode.providers.override` | `""` | Force a specific provider (`anthropic`, `nvidia-nim`, `openrouter`) |

Existing `lucentCode.apiKey` remains the OpenRouter key — no migration.

---

## MessageHandler Change

Single change: `this.client: OpenRouterClient` → `this.provider: ILLMProvider`, resolved via `ProviderRegistry` at construction. All call sites (`chatStream`, `listModels`, `getAccountBalance`) use the interface.

---

## UI

Provider badge displayed next to the model name in the webview (e.g. `claude-sonnet-4-6 · Anthropic`). Derived from `ProviderRegistry.resolve()` result — no separate state needed.

---

## Error Handling

Shared `LLMError` type with normalized codes:

```ts
type LLMErrorCode = 'auth' | 'rate_limit' | 'quota' | 'unavailable' | 'bad_request';

class LLMError extends Error {
  constructor(public code: LLMErrorCode, message: string) { super(message); }
}
```

Each provider maps its SDK/HTTP errors to `LLMError`. `MessageHandler` handles codes once.

---

## Testing

- Unit tests per provider: mock `fetch` / Anthropic SDK, verify translation correctness
- `ProviderRegistry` unit tests: verify auto-detect for known model ID patterns
- `message-handler.test.ts` injects a mock `ILLMProvider` — fully decoupled from OpenRouter

---

## What Does Not Change

Tool execution, approval flows, skill injection, MCP routing, conversation persistence, context builder. None of these touch the provider layer.

---

## Scope

**In:** `ILLMProvider` interface, `OpenRouterProvider`, `AnthropicProvider`, `NvidiaNimProvider`, `ProviderRegistry`, settings, provider badge in UI, `LLMError`, updated tests.

**Out:** Extended thinking UI, prompt caching controls, per-provider model filtering in the model picker (follow-up work).
