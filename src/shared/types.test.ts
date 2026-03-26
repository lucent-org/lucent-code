import { describe, it, expect } from 'vitest';
import type { ExtensionMessage, WebviewMessage } from './types';

describe('ExtensionMessage types', () => {
  it('includes providersLoaded', () => {
    const msg: ExtensionMessage = {
      type: 'providersLoaded',
      providers: [{ id: 'anthropic', name: 'Anthropic', isConfigured: true }],
    };
    expect(msg.type).toBe('providersLoaded');
  });

  it('modelChanged includes optional warning', () => {
    const msg: ExtensionMessage = {
      type: 'modelChanged',
      modelId: 'claude-sonnet-4-6',
      warning: 'Model not available',
    };
    expect(msg.type).toBe('modelChanged');
  });
});

describe('WebviewMessage types', () => {
  it('includes switchProvider', () => {
    const msg: WebviewMessage = { type: 'switchProvider', providerId: 'anthropic' };
    expect(msg.type).toBe('switchProvider');
  });

  it('includes openProviderSettings', () => {
    const msg: WebviewMessage = { type: 'openProviderSettings', providerId: 'nvidia-nim' };
    expect(msg.type).toBe('openProviderSettings');
  });
});
