import { describe, it, expect } from 'vitest';
import type { ExtensionMessage, WebviewMessage } from './types';

describe('ExtensionMessage types', () => {
  it('providersLoaded carries provider array', () => {
    const msg: ExtensionMessage = {
      type: 'providersLoaded',
      providers: [{ id: 'anthropic', name: 'Anthropic', isConfigured: true }],
    };
    expect((msg as Extract<typeof msg, { type: 'providersLoaded' }>).providers[0].isConfigured).toBe(true);
  });

  it('modelChanged accepts optional warning', () => {
    const withWarning: ExtensionMessage = {
      type: 'modelChanged',
      modelId: 'claude-sonnet-4-6',
      warning: 'Model not available',
    };
    const withoutWarning: ExtensionMessage = {
      type: 'modelChanged',
      modelId: 'claude-sonnet-4-6',
    };
    expect((withWarning as Extract<typeof withWarning, { type: 'modelChanged' }>).warning).toBe('Model not available');
    expect((withoutWarning as Extract<typeof withoutWarning, { type: 'modelChanged' }>).warning).toBeUndefined();
  });
});

describe('WebviewMessage types', () => {
  it('switchProvider carries providerId', () => {
    const msg: WebviewMessage = { type: 'switchProvider', providerId: 'anthropic' };
    expect((msg as Extract<typeof msg, { type: 'switchProvider' }>).providerId).toBe('anthropic');
  });

  it('openProviderSettings carries providerId', () => {
    const msg: WebviewMessage = { type: 'openProviderSettings', providerId: 'nvidia-nim' };
    expect((msg as Extract<typeof msg, { type: 'openProviderSettings' }>).providerId).toBe('nvidia-nim');
  });
});
