import type { OpenRouterModel, ChatRequest, ChatResponse, ChatResponseChunk } from '../shared/types';

const BASE_URL = 'https://openrouter.ai/api/v1';

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
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: await this.headers(),
      body: JSON.stringify({ ...request, stream: false }),
    });

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
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: await this.headers(),
      body: JSON.stringify({ ...request, stream: true }),
      signal,
    });

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
