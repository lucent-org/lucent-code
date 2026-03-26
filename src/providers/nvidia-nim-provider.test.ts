import { describe, it, expect, vi } from 'vitest';
import { NvidiaNimProvider } from './nvidia-nim-provider';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('NvidiaNimProvider', () => {
  const provider = new NvidiaNimProvider(async () => 'test-key');

  it('has id nvidia-nim', () => {
    expect(provider.id).toBe('nvidia-nim');
  });

  it('listModels returns static curated list with nvidia models', async () => {
    const models = await provider.listModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models.some(m => m.id.includes('nemotron') || m.id.includes('nvidia'))).toBe(true);
  });

  it('chatStream calls NVIDIA NIM endpoint', async () => {
    const lines = [
      'data: {"id":"1","choices":[{"delta":{"content":"Hi"},"finish_reason":null}]}',
      'data: {"id":"1","choices":[{"delta":{},"finish_reason":"stop"}]}',
      'data: [DONE]',
    ].join('\n');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: {
        getReader: () => {
          let done = false;
          return {
            read: async () => done
              ? { done: true, value: undefined }
              : (() => { done = true; return { done: false, value: new TextEncoder().encode(lines) }; })(),
            releaseLock: () => {},
          };
        }
      }
    });

    const chunks = [];
    for await (const chunk of provider.chatStream({ model: 'nvidia/nemotron-super-49b-v1', messages: [{ role: 'user', content: 'hi' }] })) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBeGreaterThan(0);
    expect(mockFetch.mock.calls[0][0]).toContain('integrate.api.nvidia.com');
  });
});
