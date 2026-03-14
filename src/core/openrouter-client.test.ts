import { describe, it, expect, vi, beforeEach } from 'vitest';

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
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error'),
      });

      const generator = client.chatStream({
        model: 'anthropic/claude-sonnet-4',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      await expect(generator.next()).rejects.toThrow('OpenRouter API error (500)');
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
});
