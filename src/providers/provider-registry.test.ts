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

describe('setOverride', () => {
  it('changes which provider is resolved after calling setOverride', () => {
    const registry = new ProviderRegistry(mockSettings);

    // Default: no override, claude model → anthropic
    const before = registry.resolve('claude-sonnet-4-6');
    expect(before.id).toBe('anthropic');

    // Set override to nvidia-nim
    registry.setOverride('nvidia-nim');
    const after = registry.resolve('claude-sonnet-4-6');
    expect(after.id).toBe('nvidia-nim');

    // Reset for other tests
    registry.setOverride('');
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

describe('getProvider', () => {
  const registry = new ProviderRegistry(mockSettings);

  it('returns anthropic provider for id anthropic', () => {
    const p = registry.getProvider('anthropic');
    expect(p.id).toBe('anthropic');
  });

  it('returns nvidia-nim provider for id nvidia-nim', () => {
    const p = registry.getProvider('nvidia-nim');
    expect(p.id).toBe('nvidia-nim');
  });

  it('returns openrouter provider for unknown id', () => {
    const p = registry.getProvider('unknown');
    expect(p.id).toBe('openrouter');
  });
});

describe('isConfigured', () => {
  const registry = new ProviderRegistry(mockSettings);

  it('returns true for anthropic when key is set', async () => {
    const result = await registry.isConfigured('anthropic');
    expect(result).toBe(true);
  });

  it('returns false for anthropic when key is empty', async () => {
    const emptyRegistry = new ProviderRegistry({
      ...mockSettings,
      anthropicApiKey: async () => undefined,
    });
    const result = await emptyRegistry.isConfigured('anthropic');
    expect(result).toBe(false);
  });

  it('returns openrouter configured status from auth', async () => {
    const mockAuth = { isAuthenticated: async () => true };
    const result = await registry.isConfigured('openrouter', mockAuth);
    expect(result).toBe(true);
  });

  it('returns false for openrouter when no auth provided', async () => {
    const result = await registry.isConfigured('openrouter');
    expect(result).toBe(false);
  });
});
