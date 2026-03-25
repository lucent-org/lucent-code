import { describe, it, expect } from 'vitest';
import { ProviderRegistry } from './provider-registry';

const mockSettings = {
  openRouterApiKey: async () => 'or-key' as string | undefined,
  anthropicApiKey:  async () => 'anthro-key' as string | undefined,
  nvidiaApiKey:     async () => 'nvidia-key' as string | undefined,
  nvidiaBaseUrl:    '',
  providerOverride: '',
};

describe('ProviderRegistry.resolve auto-detect', () => {
  const registry = new ProviderRegistry(mockSettings);

  it('routes claude-* to anthropic', () => {
    expect(registry.resolve('claude-sonnet-4-6').id).toBe('anthropic');
    expect(registry.resolve('claude-opus-4-6').id).toBe('anthropic');
  });

  it('routes anthropic/* to anthropic', () => {
    expect(registry.resolve('anthropic/claude-3-5-sonnet').id).toBe('anthropic');
  });

  it('routes nvidia/* to nvidia-nim', () => {
    expect(registry.resolve('nvidia/nemotron-super-49b-v1').id).toBe('nvidia-nim');
  });

  it('routes nv-* to nvidia-nim', () => {
    expect(registry.resolve('nv-mistralai/mistral-7b').id).toBe('nvidia-nim');
  });

  it('routes everything else to openrouter', () => {
    expect(registry.resolve('gpt-4o').id).toBe('openrouter');
    expect(registry.resolve('meta-llama/llama-3.1-70b-instruct').id).toBe('openrouter');
    expect(registry.resolve('mistralai/mistral-7b-instruct').id).toBe('openrouter');
  });
});

describe('ProviderRegistry.resolve with override', () => {
  it('forces openrouter when override is openrouter', () => {
    const r = new ProviderRegistry({ ...mockSettings, providerOverride: 'openrouter' });
    expect(r.resolve('claude-sonnet-4-6').id).toBe('openrouter');
  });

  it('forces anthropic when override is anthropic', () => {
    const r = new ProviderRegistry({ ...mockSettings, providerOverride: 'anthropic' });
    expect(r.resolve('gpt-4o').id).toBe('anthropic');
  });

  it('forces nvidia-nim when override is nvidia-nim', () => {
    const r = new ProviderRegistry({ ...mockSettings, providerOverride: 'nvidia-nim' });
    expect(r.resolve('gpt-4o').id).toBe('nvidia-nim');
  });
});

describe('ProviderRegistry.all', () => {
  it('returns all three providers', () => {
    const registry = new ProviderRegistry(mockSettings);
    const ids = registry.all.map(p => p.id);
    expect(ids).toContain('openrouter');
    expect(ids).toContain('anthropic');
    expect(ids).toContain('nvidia-nim');
  });
});
