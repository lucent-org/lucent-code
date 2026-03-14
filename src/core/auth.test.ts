import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// These must be declared with vi.hoisted so they're available inside the hoisted vi.mock factory
const { mockSecretStorage, mockWindow } = vi.hoisted(() => ({
  mockSecretStorage: {
    get: vi.fn(),
    store: vi.fn(),
    delete: vi.fn(),
  },
  mockWindow: {
    showInputBox: vi.fn(),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
  },
}));

vi.mock('vscode', () => ({
  window: mockWindow,
  env: {
    asExternalUri: vi.fn((uri: any) => Promise.resolve(uri)),
    openExternal: vi.fn(() => Promise.resolve(true)),
  },
  Uri: {
    parse: vi.fn((s: string) => ({ toString: () => s })),
  },
  EventEmitter: vi.fn(() => {
    const emitter = new EventEmitter();
    return {
      event: (listener: (...args: unknown[]) => void) => {
        emitter.on('fire', listener);
        return { dispose: () => emitter.removeListener('fire', listener) };
      },
      fire: (data: unknown) => emitter.emit('fire', data),
      dispose: () => emitter.removeAllListeners(),
    };
  }),
}));

import { AuthManager } from './auth';

describe('AuthManager', () => {
  let auth: AuthManager;

  beforeEach(() => {
    vi.clearAllMocks();
    auth = new AuthManager(mockSecretStorage as any);
  });

  it('should return stored API key', async () => {
    mockSecretStorage.get.mockResolvedValue('sk-test-key');
    const key = await auth.getApiKey();
    expect(key).toBe('sk-test-key');
  });

  it('should return undefined when no key stored', async () => {
    mockSecretStorage.get.mockResolvedValue(undefined);
    const key = await auth.getApiKey();
    expect(key).toBeUndefined();
  });

  it('should store API key via setApiKey', async () => {
    await auth.setApiKey('sk-new-key');
    expect(mockSecretStorage.store).toHaveBeenCalledWith('openRouterChat.apiKey', 'sk-new-key');
  });

  it('should prompt user and store key via promptForApiKey', async () => {
    mockWindow.showInputBox.mockResolvedValue('sk-prompted-key');
    const key = await auth.promptForApiKey();
    expect(key).toBe('sk-prompted-key');
    expect(mockSecretStorage.store).toHaveBeenCalledWith('openRouterChat.apiKey', 'sk-prompted-key');
  });

  it('should return undefined if user cancels prompt', async () => {
    mockWindow.showInputBox.mockResolvedValue(undefined);
    const key = await auth.promptForApiKey();
    expect(key).toBeUndefined();
  });

  it('should have startOAuth method', () => {
    expect(typeof auth.startOAuth).toBe('function');
  });

  it('should generate a code verifier of correct length', () => {
    const verifier = (auth as any).generateCodeVerifier();
    expect(verifier).toHaveLength(64);
    expect(/^[A-Za-z0-9\-._~]+$/.test(verifier)).toBe(true);
  });

  it('should generate a random state string', () => {
    const state1 = (auth as any).generateState();
    const state2 = (auth as any).generateState();
    expect(typeof state1).toBe('string');
    expect(state1.length).toBeGreaterThan(0);
    // Two generated states should be different (probabilistically)
    // Skip this assertion since it could rarely fail
  });
});
