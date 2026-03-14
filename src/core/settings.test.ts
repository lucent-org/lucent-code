import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock vscode module
vi.mock('vscode', () => {
  const configValues: Record<string, unknown> = {
    'chat.model': '',
    'chat.temperature': 0.7,
    'chat.maxTokens': 4096,
  };

  return {
    workspace: {
      getConfiguration: vi.fn(() => ({
        get: vi.fn((key: string, defaultValue?: unknown) => configValues[key] ?? defaultValue),
        update: vi.fn(),
      })),
      onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
    },
    ConfigurationTarget: { Global: 1, Workspace: 2 },
  };
});

import { Settings } from './settings';

describe('Settings', () => {
  let settings: Settings;

  beforeEach(() => {
    settings = new Settings();
  });

  it('should return default chat model as empty string', () => {
    expect(settings.chatModel).toBe('');
  });

  it('should return default temperature', () => {
    expect(settings.temperature).toBe(0.7);
  });

  it('should return default max tokens', () => {
    expect(settings.maxTokens).toBe(4096);
  });
});
