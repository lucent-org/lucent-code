import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { OpenRouterClient } from './openrouter-client';

describe('OpenRouterClient', () => {
  let client: OpenRouterClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new OpenRouterClient(() => Promise.resolve('sk-test-key'));
  });

  describe('listModels', () => {
    it('should fetch and return models from OpenRouter API', async () => {
      const mockModels = {
        data: [
          {
            id: 'anthropic/claude-sonnet-4',
            name: 'Claude Sonnet 4',
            context_length: 200000,
            pricing: { prompt: '0.000003', completion: '0.000015' },
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockModels),
      });

      const models = await client.listModels();
      expect(models).toHaveLength(1);
      expect(models[0].id).toBe('anthropic/claude-sonnet-4');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/models',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer sk-test-key',
          }),
        })
      );
    });

    it('should throw on API error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('Invalid API key'),
      });

      await expect(client.listModels()).rejects.toThrow('OpenRouter API error (401)');
    });
  });

  describe('chat (non-streaming)', () => {
    it('should send a chat request and return the response', async () => {
      const mockResponse = {
        id: 'gen-123',
        choices: [{ message: { role: 'assistant', content: 'Hello!' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const response = await client.chat({
        model: 'anthropic/claude-sonnet-4',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(response.choices[0].message.content).toBe('Hello!');
    });

    it('should send correct request body with model, messages, and stream:false', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'gen-1', choices: [], usage: {} }),
      });

      await client.chat({
        model: 'anthropic/claude-sonnet-4',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            model: 'anthropic/claude-sonnet-4',
            messages: [{ role: 'user', content: 'Hi' }],
            stream: false,
          }),
        })
      );
    });
  });

  describe('chatStream', () => {
    function createSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
      const encoder = new TextEncoder();
      return new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      });
    }

    it('should yield parsed ChatResponseChunk objects from SSE data', async () => {
      const sseData = [
        'data: {"id":"gen-1","choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
        'data: {"id":"gen-1","choices":[{"delta":{"content":" world"},"finish_reason":null}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const stream = createSSEStream(sseData);

      mockFetch.mockResolvedValue({
        ok: true,
        body: stream,
      });

      const chunks = [];
      for await (const chunk of client.chatStream({
        model: 'anthropic/claude-sonnet-4',
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[0].id).toBe('gen-1');
      expect(chunks[0].choices[0].delta.content).toBe('Hello');
      expect(chunks[1].choices[0].delta.content).toBe(' world');
    });

    it('should throw on API error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: { get: () => null },
        text: () => Promise.resolve('Bad request'),
      });

      const generator = client.chatStream({
        model: 'anthropic/claude-sonnet-4',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      await expect(generator.next()).rejects.toThrow('OpenRouter API error (400)');
    });

    it('should stop when it encounters [DONE] marker', async () => {
      const sseData = [
        'data: {"id":"gen-1","choices":[{"delta":{"content":"Hi"},"finish_reason":null}]}\n\n',
        'data: [DONE]\n\n',
        'data: {"id":"gen-1","choices":[{"delta":{"content":"should not appear"},"finish_reason":null}]}\n\n',
      ];

      const stream = createSSEStream(sseData);

      mockFetch.mockResolvedValue({
        ok: true,
        body: stream,
      });

      const chunks = [];
      for await (const chunk of client.chatStream({
        model: 'anthropic/claude-sonnet-4',
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0].choices[0].delta.content).toBe('Hi');
    });

    it('should skip malformed JSON chunks without throwing', async () => {
      const sseData = [
        'data: {"id":"gen-1","choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n\n',
        'data: {not valid json\n\n',
        'data: {"id":"gen-1","choices":[{"delta":{"content":"also ok"},"finish_reason":null}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const stream = createSSEStream(sseData);

      mockFetch.mockResolvedValue({
        ok: true,
        body: stream,
      });

      const chunks = [];
      for await (const chunk of client.chatStream({
        model: 'anthropic/claude-sonnet-4',
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[0].choices[0].delta.content).toBe('ok');
      expect(chunks[1].choices[0].delta.content).toBe('also ok');
    });

    it('should throw when response has no body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        body: null,
      });

      const generator = client.chatStream({
        model: 'anthropic/claude-sonnet-4',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      await expect(generator.next()).rejects.toThrow('No response body');
    });
  });

  describe('headers', () => {
    it('should throw when no API key is configured', async () => {
      const noKeyClient = new OpenRouterClient(() => Promise.resolve(undefined));

      await expect(
        noKeyClient.listModels()
      ).rejects.toThrow('No API key configured');
    });
  });

  describe('withRetry', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('retries on 429 and succeeds on second attempt', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: { get: () => null },
          text: () => Promise.resolve('Rate limited'),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'gen-1', choices: [], usage: {} }),
        });

      const promise = client.chat({
        model: 'anthropic/claude-sonnet-4',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      // Advance timers to skip the backoff delay
      await vi.runAllTimersAsync();

      await expect(promise).resolves.toBeDefined();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('retries on 500 and succeeds', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          headers: { get: () => null },
          text: () => Promise.resolve('Server error'),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'gen-1', choices: [], usage: {} }),
        });

      const promise = client.chat({
        model: 'anthropic/claude-sonnet-4',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      await vi.runAllTimersAsync();

      await expect(promise).resolves.toBeDefined();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('does NOT retry on 400', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        headers: { get: () => null },
        text: () => Promise.resolve('Bad request'),
      });

      await expect(
        client.chat({
          model: 'anthropic/claude-sonnet-4',
          messages: [{ role: 'user', content: 'Hi' }],
        })
      ).rejects.toThrow('OpenRouter API error (400)');

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('exhausts retries and throws after 4 total attempts', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        headers: { get: () => null },
        text: () => Promise.resolve('Service unavailable'),
      });

      const promise = client.chat({
        model: 'anthropic/claude-sonnet-4',
        messages: [{ role: 'user', content: 'Hi' }],
      });
      // Prevent unhandled rejection while timers run
      promise.catch(() => {});

      await vi.runAllTimersAsync();

      await expect(promise).rejects.toThrow('OpenRouter API error (503)');
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('respects Retry-After header on 429', async () => {
      const retryAfterSeconds = 2;
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: { get: (name: string) => name.toLowerCase() === 'retry-after' ? String(retryAfterSeconds) : null },
          text: () => Promise.resolve('Rate limited'),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'gen-1', choices: [], usage: {} }),
        });

      // Spy on setTimeout to capture delay values
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

      const promise = client.chat({
        model: 'anthropic/claude-sonnet-4',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      await vi.runAllTimersAsync();
      await promise;

      // The delay used should be 2000ms (from Retry-After: 2)
      const delayArgs = setTimeoutSpy.mock.calls.map(call => call[1]);
      expect(delayArgs.some(d => d === retryAfterSeconds * 1000)).toBe(true);
    });

    it('aborts during backoff sleep', async () => {
      const controller = new AbortController();

      // chatStream accepts a signal, so use it to test abort propagation
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        headers: { get: () => null },
        text: () => Promise.resolve('Service unavailable'),
      });

      const gen = client.chatStream(
        { model: 'anthropic/claude-sonnet-4', messages: [{ role: 'user', content: 'Hi' }] },
        controller.signal
      );

      // Start the generator — it will hit 503, then start sleeping
      const promise = gen.next();
      // Suppress unhandled rejection while we set up assertions
      promise.catch(() => {});

      // Abort during the backoff sleep, then advance timers
      controller.abort();
      await vi.runAllTimersAsync();

      await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
      // Should not have retried after abort — only 1 fetch call
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
