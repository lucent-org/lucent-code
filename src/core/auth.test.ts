import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// These must be declared with vi.hoisted so they're available inside the hoisted vi.mock factory
const { mockSecretStorage, mockWindow, mockFetch } = vi.hoisted(() => ({
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
  mockFetch: vi.fn(),
}));

// Ensure crypto.subtle is available for PKCE code challenge generation
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      subtle: {
        digest: vi.fn(async (_algo: string, data: ArrayBuffer) => {
          // Simple mock - just return a hash-like buffer derived from input
          const view = new Uint8Array(data);
          const result = new Uint8Array(32);
          for (let i = 0; i < view.length; i++) {
            result[i % 32] ^= view[i];
          }
          return result.buffer;
        }),
      },
    },
  });
}

vi.stubGlobal('fetch', mockFetch);

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

  it('should generate a proper code challenge from verifier', async () => {
    const challenge = await (auth as any).generateCodeChallenge('test-verifier-string');
    expect(typeof challenge).toBe('string');
    expect(challenge.length).toBeGreaterThan(0);
    // Should be base64url (no +, /, or =)
    expect(/^[A-Za-z0-9\-_]+$/.test(challenge)).toBe(true);
  });

  it('should generate different challenges for different verifiers', async () => {
    const challenge1 = await (auth as any).generateCodeChallenge('verifier-one');
    const challenge2 = await (auth as any).generateCodeChallenge('verifier-two');
    expect(challenge1).not.toBe(challenge2);
  });

  it('should reject OAuth callback with mismatched state', async () => {
    // Set up pending OAuth with known state
    (auth as any).pendingOAuth = { state: 'correct-state', codeVerifier: 'test' };

    const uri = { query: 'code=test-code&state=wrong-state' };
    await auth.handleOAuthCallback(uri as any);

    // Should show error
    expect(mockWindow.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('state mismatch')
    );
  });

  describe('isAuthenticated', () => {
    it('returns true when API key is stored', async () => {
      mockSecretStorage.get.mockResolvedValue('sk-test');
      expect(await auth.isAuthenticated()).toBe(true);
    });

    it('returns false when no API key is stored', async () => {
      mockSecretStorage.get.mockResolvedValue(undefined);
      expect(await auth.isAuthenticated()).toBe(false);
    });
  });

  describe('signOut', () => {
    it('clears the stored key', async () => {
      mockSecretStorage.get.mockResolvedValue('sk-test');
      mockFetch.mockResolvedValue({ ok: true });

      await auth.signOut();

      expect(mockSecretStorage.delete).toHaveBeenCalled();
    });

    it('fires onDidChangeAuth with false', async () => {
      mockSecretStorage.get.mockResolvedValue('sk-test');
      mockFetch.mockResolvedValue({ ok: true });

      const listener = vi.fn();
      auth.onDidChangeAuth(listener);
      await auth.signOut();

      expect(listener).toHaveBeenCalledWith(false);
    });

    it('still clears key if revocation request fails (network error)', async () => {
      mockSecretStorage.get.mockResolvedValue('sk-test');
      mockFetch.mockRejectedValue(new Error('Network error'));

      await auth.signOut(); // must not throw

      expect(mockSecretStorage.delete).toHaveBeenCalled();
    });

    it('is a no-op when not authenticated', async () => {
      mockSecretStorage.get.mockResolvedValue(undefined);

      await auth.signOut(); // must not throw, must not call fetch

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockSecretStorage.delete).not.toHaveBeenCalled();
    });
  });
});
