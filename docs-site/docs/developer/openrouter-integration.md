---
sidebar_position: 3
title: LLM Providers
description: How Lucent Code abstracts over multiple AI providers — OpenRouter, Anthropic, and NVIDIA NIM.
---

# LLM Providers

Lucent Code routes all AI requests through a provider abstraction layer (`ILLMProvider`) that normalises authentication, streaming, model listing, and error handling across three backends.

## Provider Architecture

```
MessageHandler
    └── ProviderRegistry.resolve(modelId) → ILLMProvider
            ├── OpenRouterProvider   (openrouter.ai/api/v1)
            ├── AnthropicProvider    (api.anthropic.com/v1)
            └── NvidiaNimProvider    (integrate.api.nvidia.com/v1)
```

`ProviderRegistry` selects the active provider using this priority:

1. **Override** — if `lucentCode.providers.override` is set (or the user switched via the UI), that provider is used regardless of model ID
2. **Model ID prefix** — `claude-*` / `anthropic/*` → Anthropic; `nvidia/*` / `nv-*` → NVIDIA NIM; everything else → OpenRouter

## ILLMProvider Interface

Every provider implements:

```typescript
interface ILLMProvider {
  readonly id: string;               // 'openrouter' | 'anthropic' | 'nvidia-nim'
  readonly name: string;             // display name
  chat(request: ChatRequest): Promise<ReadableStream>;
  listModels(): Promise<OpenRouterModel[]>;
  getAccountBalance?(): Promise<{ credits: number; limit: number | null }>;
}
```

`chat()` always returns a `ReadableStream` of newline-delimited SSE chunks — the same shape regardless of provider.

## OpenRouter

**Endpoint:** `https://openrouter.ai/api/v1/chat/completions`

OpenRouter is an OpenAI-compatible proxy that routes to 500+ upstream models. It is the default provider when no override is set.

### Authentication

Two modes — OAuth session token (stored in `SecretStorage` under `openrouter.sessionToken`) or a raw API key (`openrouter.apiKey`).

```typescript
// Read
const key = await context.secrets.get('openrouter.apiKey');
// Write
await context.secrets.store('openrouter.apiKey', value);
```

### Model Catalog

Fetched from `https://openrouter.ai/api/v1/models` on activation. The `supported_parameters` array indicates tool use support:

```typescript
interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
  pricing: { prompt: string; completion: string };  // per-token USD as string
  supported_parameters?: string[];                  // e.g. ['tools', 'reasoning']
}
```

Multiply pricing strings by `1_000_000` to get per-million-token rates.

### Credit Balance

Fetched from `https://openrouter.ai/api/v1/auth/key`. Shown in the status bar alongside per-message and session costs.

## Anthropic (native)

**Endpoint:** `https://api.anthropic.com/v1/messages`

The Anthropic provider calls the native Messages API, giving access to every model and capability Anthropic ships — including extended thinking, the latest Claude versions, and all `supported_parameters` without a proxy layer.

### Why use native instead of OpenRouter?

- **Latest models first** — Anthropic releases new models to the native API before they appear on aggregators
- **Full feature support** — extended thinking, system prompt caching, and all API parameters are available natively
- **No middleman** — direct connection means lower latency and no proxy rate limits

### Authentication

API key stored in VS Code settings as `lucentCode.providers.anthropic.apiKey` (written to SecretStorage, not plaintext settings).

### Request format

The provider translates the shared `ChatRequest` type to Anthropic's Messages API format and converts the SSE response back to the shared chunk format — callers see no difference.

## NVIDIA NIM

**Endpoint:** `https://integrate.api.nvidia.com/v1` (default, overridable via `lucentCode.providers.nvidianim.baseUrl`)

NVIDIA NIM provides direct GPU inference for NVIDIA-hosted models — Nemotron, Llama variants on NVIDIA hardware, and future NVIDIA research models.

### Why use native NIM instead of OpenRouter?

- **Canonical endpoint for Nemotron** — NVIDIA NIM is the primary serving infrastructure for Nemotron; routing via OpenRouter adds a hop
- **Custom base URL** — point at a self-hosted NIM instance or a corporate NIM deployment
- **GPU-specific parameters** — NIM exposes inference parameters (e.g. quantisation hints) not available via aggregators

### Authentication

API key stored in VS Code settings as `lucentCode.providers.nvidianim.apiKey`.

The base URL can be overridden in settings for self-hosted NIM:
```
lucentCode.providers.nvidianim.baseUrl = https://my-nim-server/v1
```

## Error Normalisation

All three providers throw `LLMError` with a normalised code:

```typescript
type LLMErrorCode =
  | 'auth'         // invalid or missing API key
  | 'rate_limit'   // too many requests
  | 'quota'        // out of credits / quota exceeded
  | 'unavailable'  // provider down or model unavailable
  | 'bad_request'  // malformed request
  | 'moderation'   // content filtered
  | 'timeout';     // request timed out
```

The chat handler maps these to user-visible error messages and shows a **Retry** action where appropriate.

## Streaming

All providers use SSE streaming. The shared streaming loop in `MessageHandler`:

```typescript
for await (const chunk of response.body) {
  const parsed: ChatResponseChunk = JSON.parse(line.slice('data: '.length));
  const delta = parsed.choices[0].delta;

  if (delta.content) {
    panel.webview.postMessage({ type: 'streamChunk', content: delta.content });
  }
  if (delta.tool_calls) {
    // accumulate across chunks, then dispatch tool approval
  }
  if (parsed.usage) {
    // final chunk — update cost display
  }
}
```

## Tool Use

Tool calls are only enabled when the selected model lists `'tools'` in `supported_parameters`. The webview filters the skill list to hide workflow skills (which use tool calls internally) when the active model lacks this capability.

```typescript
const isWorkflowCapable = model?.supported_parameters?.includes('tools') ?? false;
```

## Switching Providers

The UI sends `{ type: 'switchProvider', providerId }`. The extension handler:

1. Writes `lucentCode.providers.override` to VS Code settings
2. Calls `providerRegistry.setOverride(providerId)` to update in-memory state immediately
3. Calls `provider.listModels()` to repopulate the model list
4. If the current model is absent from the new list, auto-selects the first model and sends a `modelChanged` message with a `warning` field
