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

  describe('setChatModel', () => {
    it('updates workspace configuration', async () => {
      const mockUpdate = vi.fn();
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn((key: string, defaultValue?: unknown) => defaultValue),
        update: mockUpdate,
      } as any);
      const s = new Settings();
      await s.setChatModel('anthropic/claude-3-5-sonnet');
      expect(mockUpdate).toHaveBeenCalledWith(
        'chat.model',
        'anthropic/claude-3-5-sonnet',
        vscode.ConfigurationTarget.Global,
      );
    });
  });

  describe('onDidChange', () => {
    it('fires callback when configuration changes', () => {
      const callback = vi.fn();
      let changeHandler: ((e: { affectsConfiguration: (s: string) => boolean }) => void) | undefined;
      vi.mocked(vscode.workspace.onDidChangeConfiguration).mockImplementationOnce((cb: any) => {
        changeHandler = cb;
        return { dispose: vi.fn() };
      });
      settings.onDidChange(callback);
      expect(changeHandler).toBeDefined();
      changeHandler!({ affectsConfiguration: () => true });
      expect(callback).toHaveBeenCalled();
    });
  });

  describe('skillSources', () => {
    it('returns configured skill sources array', () => {
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
        get: vi.fn((key: string) => {
          if (key === 'skills.sources') return [{ type: 'github', url: 'https://github.com/org/repo' }];
          return undefined;
        }),
        update: vi.fn(),
      } as any);
      const s = new Settings();
      expect(s.skillSources).toEqual([{ type: 'github', url: 'https://github.com/org/repo' }]);
    });

    it('returns empty array when not configured', () => {
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValueOnce({
        get: vi.fn().mockReturnValue([]),
        update: vi.fn(),
      } as any);
      const s = new Settings();
      expect(s.skillSources).toEqual([]);
    });
  });
});
