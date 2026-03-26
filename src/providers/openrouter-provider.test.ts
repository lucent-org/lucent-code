import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenRouterProvider } from './openrouter-provider';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('OpenRouterProvider', () => {
  const provider = new OpenRouterProvider(async () => 'test-key');

  it('has id openrouter', () => {
    expect(provider.id).toBe('openrouter');
  });

  it('listModels returns models from API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: 'model-1', name: 'Model 1', context_length: 4096, pricing: { prompt: '0.001', completion: '0.002' } }] }),
    });

    const models = await provider.listModels();
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe('model-1');
    expect(models[0].contextLength).toBe(4096);
  });

  it('getAccountBalance returns usage and limit', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { usage: 5.0, limit: 10.0 } }),
    });

    const balance = await provider.getAccountBalance!();
    expect(balance.usage).toBe(5.0);
    expect(balance.limit).toBe(10.0);
  });
});
