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
  });
});
