import type { ChatRequest, ChatResponseChunk } from '../shared/types';
import type { ILLMProvider, ProviderModel } from './llm-provider';
import { LLMError } from './llm-provider';

const DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 8000;
const RETRYABLE = new Set([500, 502, 503, 504]); // 429 handled explicitly as rate_limit (not retried)

// Curated static list — NIM doesn't expose a standard /models endpoint
const NIM_MODELS: ProviderModel[] = [
  { id: 'nvidia/nemotron-super-49b-v1',       name: 'Nemotron Super 49B',        contextLength: 32768,  pricing: { prompt: '0', completion: '0' } },
  { id: 'nvidia/nemotron-nano-8b-instruct',    name: 'Nemotron Nano 8B',          contextLength: 8192,   pricing: { prompt: '0', completion: '0' } },
  { id: 'meta/llama-3.1-70b-instruct',        name: 'Llama 3.1 70B (NIM)',       contextLength: 128000, pricing: { prompt: '0', completion: '0' } },
  { id: 'meta/llama-3.1-8b-instruct',         name: 'Llama 3.1 8B (NIM)',        contextLength: 128000, pricing: { prompt: '0', completion: '0' } },
  { id: 'mistralai/mistral-7b-instruct-v0.3', name: 'Mistral 7B Instruct (NIM)', contextLength: 32768,  pricing: { prompt: '0', completion: '0' } },
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
    if (!key) throw new LLMError('auth', 'No NVIDIA NIM API key configured. Set lucentCode.providers.nvidianim.apiKey in settings.');
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
        method: 'POST',
        headers,
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
