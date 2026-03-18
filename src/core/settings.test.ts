import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';

// Mock vscode module
vi.mock('vscode', () => {
  const configValues: Record<string, unknown> = {
    'chat.model': '',
    'chat.temperature': 0.7,
    'chat.maxTokens': 4096,
    'completions.model': '',
    'completions.triggerMode': 'auto',
    'completions.debounceMs': 300,
    'completions.maxContextLines': 100,
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

  it('should return default completions model as empty string', () => {
    expect(settings.completionsModel).toBe('');
  });

  it('should return default trigger mode as auto', () => {
    expect(settings.completionsTriggerMode).toBe('auto');
  });

  it('should return default debounce as 300', () => {
    expect(settings.completionsDebounceMs).toBe(300);
  });

  it('should return default max context lines as 100', () => {
    expect(settings.completionsMaxContextLines).toBe(100);
  });

  it('should return false for autonomousMode by default', () => {
    expect(settings.autonomousMode).toBe(false);
  });

  it('should return true for autonomousMode when config is true', () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
      get: vi.fn().mockReturnValue(true),
      update: vi.fn(),
    } as any);
    const s2 = new Settings();
    expect(s2.autonomousMode).toBe(true);
  });
});
