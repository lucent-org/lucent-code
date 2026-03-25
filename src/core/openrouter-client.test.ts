import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { OpenRouterClient, OpenRouterError } from './openrouter-client';

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

  describe('OpenRouterError', () => {
    it('has correct name, code, and message', () => {
      const err = new OpenRouterError(429, 'Rate limited');
      expect(err.name).toBe('OpenRouterError');
      expect(err.code).toBe(429);
      expect(err.message).toBe('Rate limited');
      expect(err instanceof Error).toBe(true);
    });

    it('stores metadata when provided', () => {
      const meta = { provider_name: 'anthropic', reasons: ['violence'] };
      const err = new OpenRouterError(403, 'Flagged', meta);
      expect(err.metadata).toEqual(meta);
    });

    it('metadata is undefined when not provided', () => {
      const err = new OpenRouterError(401, 'Unauthorized');
      expect(err.metadata).toBeUndefined();
    });
  });

  describe('error parsing (parseApiError via non-retryable path)', () => {
    it('parses JSON error body into OpenRouterError with correct code and message', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ error: { code: 401, message: 'User not found.' } })),
      });

      const error = await client.listModels().catch((e) => e);
      expect(error).toBeInstanceOf(OpenRouterError);
      expect(error.code).toBe(401);
      expect(error.message).toBe('User not found.');
    });

    it('parses JSON error body with metadata', async () => {
      const body = JSON.stringify({
        error: {
          code: 403,
          message: 'Input flagged',
          metadata: { reasons: ['violence'], provider_name: 'anthropic' },
        },
      });
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        headers: { get: () => null },
        text: () => Promise.resolve(body),
      });

      const error = await client.listModels().catch((e) => e);
      expect(error).toBeInstanceOf(OpenRouterError);
      expect(error.code).toBe(403);
      expect(error.metadata).toMatchObject({ reasons: ['violence'] });
    });

    it('falls back to raw body when JSON is not parseable', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        headers: { get: () => null },
        text: () => Promise.resolve('plain text error'),
      });

      const error = await client.listModels().catch((e) => e);
      expect(error).toBeInstanceOf(OpenRouterError);
      expect(error.code).toBe(400);
      expect(error.message).toContain('plain text error');
    });

    it('uses status code as error code when JSON body omits it', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 408,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ error: { message: 'Timeout' } })),
      });

      const error = await client.listModels().catch((e) => e);
      expect(error).toBeInstanceOf(OpenRouterError);
      expect(error.code).toBe(408);
      expect(error.message).toBe('Timeout');
    });
  });

  describe('chatStream mid-stream errors', () => {
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

    it('throws OpenRouterError when a mid-stream SSE chunk contains an error field', async () => {
      const errorChunk = JSON.stringify({
        error: { code: 503, message: 'No provider available' },
        choices: [{ finish_reason: 'error' }],
      });
      const stream = createSSEStream([
        'data: {"id":"gen-1","choices":[{"delta":{"content":"partial"},"finish_reason":null}]}\n\n',
        `data: ${errorChunk}\n\n`,
      ]);

      mockFetch.mockResolvedValue({ ok: true, body: stream });

      const chunks: unknown[] = [];
      let caughtError: unknown;
      try {
        for await (const chunk of client.chatStream({
          model: 'anthropic/claude-sonnet-4',
          messages: [{ role: 'user', content: 'Hi' }],
        })) {
          chunks.push(chunk);
        }
      } catch (e) {
        caughtError = e;
      }

      expect(chunks).toHaveLength(1); // partial chunk before error
      expect(caughtError).toBeInstanceOf(OpenRouterError);
      expect((caughtError as OpenRouterError).code).toBe(503);
      expect((caughtError as OpenRouterError).message).toBe('No provider available');
    });

    it('includes metadata from mid-stream error chunk', async () => {
      const errorChunk = JSON.stringify({
        error: {
          code: 403,
          message: 'Flagged',
          metadata: { provider_name: 'openai', reasons: ['hate'] },
        },
        choices: [{ finish_reason: 'error' }],
      });
      const stream = createSSEStream([`data: ${errorChunk}\n\n`]);
      mockFetch.mockResolvedValue({ ok: true, body: stream });

      const error = await (async () => {
        for await (const _ of client.chatStream({
          model: 'anthropic/claude-sonnet-4',
          messages: [{ role: 'user', content: 'Hi' }],
        })) { /* consume */ }
      })().catch((e) => e);

      expect(error).toBeInstanceOf(OpenRouterError);
      expect(error.metadata).toMatchObject({ reasons: ['hate'] });
    });
  });

  describe('getAccountBalance', () => {
    it('returns usage and limit when API responds successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { usage: 1.5, limit: 10.0 } }),
      });

      const balance = await client.getAccountBalance();
      expect(balance.usage).toBe(1.5);
      expect(balance.limit).toBe(10.0);
    });

    it('returns null limit when account has no credit limit set', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { usage: 0.5, limit: null } }),
      });

      const balance = await client.getAccountBalance();
      expect(balance.limit).toBeNull();
    });

    it('returns zero usage and null limit when API request fails', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 401 });

      const balance = await client.getAccountBalance();
      expect(balance.usage).toBe(0);
      expect(balance.limit).toBeNull();
    });

    it('returns zero defaults when data fields are missing', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: {} }),
      });

      const balance = await client.getAccountBalance();
      expect(balance.usage).toBe(0);
      expect(balance.limit).toBeNull();
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
