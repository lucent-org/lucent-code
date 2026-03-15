import type { OpenRouterModel, ChatRequest, ChatResponse, ChatResponseChunk } from '../shared/types';

const BASE_URL = 'https://openrouter.ai/api/v1';

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 8000;

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

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
        return;
      }

      const timer = setTimeout(resolve, ms);

      if (signal) {
        const onAbort = () => {
          clearTimeout(timer);
          reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }

  private async withRetry(
    fn: () => Promise<Response>,
    signal?: AbortSignal
  ): Promise<Response> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await fn();

      if (response.ok) {
        return response;
      }

      const { status } = response;

      if (!RETRYABLE_STATUS_CODES.has(status)) {
        // Non-retryable client error — throw immediately
        const body = await response.text();
        throw new Error(`OpenRouter API error (${status}): ${body}`);
      }

      // It's a retryable status — record the error
      const body = await response.text();
      lastError = new Error(`OpenRouter API error (${status}): ${body}`);

      if (attempt === MAX_RETRIES) {
        break;
      }

      // Determine delay
      let delayMs: number;
      const retryAfterHeader = response.headers.get('Retry-After');
      if (retryAfterHeader !== null) {
        const retryAfterSec = parseInt(retryAfterHeader, 10);
        delayMs = isNaN(retryAfterSec) ? RETRY_BASE_MS : retryAfterSec * 1000;
      } else {
        const base = Math.min(RETRY_BASE_MS * Math.pow(2, attempt), RETRY_MAX_MS);
        const jitter = base * 0.2 * (Math.random() * 2 - 1); // ±20%
        delayMs = Math.round(base + jitter);
      }

      await this.sleep(delayMs, signal);
    }

    throw lastError!;
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
