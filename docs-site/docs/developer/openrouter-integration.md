---
sidebar_position: 3
title: OpenRouter Integration
description: How Lucent Code calls the OpenRouter API — authentication, streaming, tool use, token tracking.
---

# OpenRouter Integration

Lucent Code calls [OpenRouter's chat completions API](https://openrouter.ai/docs) — a drop-in OpenAI-compatible endpoint that routes to hundreds of underlying models.

## API Key Storage

The API key is stored in VS Code's `SecretStorage` (OS keychain-backed, encrypted at rest). It is never stored in settings files or environment variables.

```typescript
// Read
const key = await context.secrets.get('openrouter.apiKey');

// Write
await context.secrets.store('openrouter.apiKey', value);
```

## Making a Chat Request

All requests go to `https://openrouter.ai/api/v1/chat/completions`.

```typescript
const body: ChatRequest = {
  model: 'anthropic/claude-sonnet-4-5',
  messages: conversationHistory,
  stream: true,
  max_tokens: settings.maxTokens,
  temperature: settings.temperature,
  tools: [...editorTools, ...mcpTools],  // merged tool list
};
```

`ChatRequest` and related types are in `src/shared/types.ts`.

## Streaming

Lucent Code uses SSE streaming (`stream: true`). The response is a `ReadableStream` of newline-delimited JSON chunks:

```typescript
for await (const chunk of response.body) {
  const parsed: ChatResponseChunk = JSON.parse(line.slice('data: '.length));
  const delta = parsed.choices[0].delta;

  if (delta.content) {
    panel.webview.postMessage({ type: 'streamChunk', content: delta.content });
  }

  if (delta.tool_calls) {
    // accumulate tool call arguments across chunks
  }

  if (parsed.usage) {
    // final chunk includes token counts
  }
}
```

## Tool Use

When the model returns `tool_calls` in a delta, the chat handler:

1. Accumulates the full tool call across streaming chunks
2. Sends `toolApprovalRequest` to the webview (unless autonomous mode is on)
3. Waits for `toolApprovalResponse`
4. Calls the appropriate handler (`EditorTools` or `McpClientManager`)
5. Appends a `tool` role message with the result
6. Makes another API call to continue the conversation

The loop continues until `finish_reason === 'stop'` (no more tool calls).

## Model Catalog

Models are fetched from `https://openrouter.ai/api/v1/models` on activation and cached for the session. The `OpenRouterModel` type:

```typescript
interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
  pricing: { prompt: string; completion: string };  // cost per token as string
  supported_parameters?: string[];                  // includes 'reasoning' for thinking models
  top_provider?: { max_completion_tokens?: number };
}
```

Pricing strings are per-token floats (e.g. `"0.000003"` = $3/1M tokens). Multiply by 1,000,000 to get the per-million price shown in the UI.

## Token Usage and Credits

The final streaming chunk includes a `usage` object:

```typescript
interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}
```

Cost is calculated as:
```
cost = (prompt_tokens * promptPricePerToken) + (completion_tokens * completionPricePerToken)
```

The credit balance is fetched from `https://openrouter.ai/api/v1/auth/key` and shown in the status bar alongside per-message and per-session cost.

## Error Handling

OpenRouter errors arrive in two forms:
- HTTP 4xx/5xx with a JSON body: `{ error: { code, message, metadata } }`
- Embedded in stream chunks: `{ error: { code, message } }` in a delta

Both are surfaced as `streamError` messages to the webview and shown as error notifications with a **Retry** action.
