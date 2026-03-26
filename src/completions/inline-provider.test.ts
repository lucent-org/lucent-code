import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({
  InlineCompletionItem: class {
    insertText: string;
    constructor(insertText: string) {
      this.insertText = insertText;
    }
  },
  InlineCompletionList: class {
    items: unknown[];
    constructor(items: unknown[]) {
      this.items = items;
    }
  },
  Range: class {
    constructor(
      public startLine: number,
      public startChar: number,
      public endLine: number,
      public endChar: number
    ) {}
  },
  Position: class {
    constructor(public line: number, public character: number) {}
  },
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string) => {
        const vals: Record<string, unknown> = {
          'completions.model': 'test/model',
          'completions.triggerMode': 'auto',
          'completions.debounceMs': 300,
          'completions.maxContextLines': 100,
          'chat.model': 'fallback/model',
          'chat.temperature': 0.7,
          'chat.maxTokens': 4096,
        };
        return vals[key];
      }),
    })),
    onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
  },
  ConfigurationTarget: { Global: 1 },
  window: {
    createStatusBarItem: vi.fn(() => ({
      text: '',
      tooltip: '',
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
    })),
  },
  StatusBarAlignment: { Right: 2 },
}));

import * as vscodeModule from 'vscode';
import { InlineCompletionProvider } from './inline-provider';
import { Settings } from '../core/settings';
import type { ILLMProvider } from '../providers/llm-provider';

// Helper to create a mock stream returning a single assistant content response
async function* mockCompletionStream(content: string) {
  yield {
    id: 'gen-1',
    choices: [{ delta: { content }, finish_reason: null }],
  };
  yield {
    id: 'gen-1',
    choices: [{ delta: { content: '' }, finish_reason: 'stop' }],
  };
}

describe('InlineCompletionProvider', () => {
  let provider: InlineCompletionProvider;
  let mockLLMProvider: ILLMProvider;
  let settings: Settings;
  let mockDocument: any;
  let mockPosition: any;
  let mockToken: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLLMProvider = {
      id: 'openrouter',
      chatStream: vi.fn(),
      listModels: vi.fn(),
      getAccountBalance: vi.fn(),
    };
    settings = new Settings();
    provider = new InlineCompletionProvider(mockLLMProvider, settings);
    mockDocument = {
      getText: () => 'function hello() {\n  \n}',
      languageId: 'typescript',
      uri: { toString: () => 'file:///test.ts' },
    };
    mockPosition = { line: 1, character: 2 };
    mockToken = { isCancellationRequested: false, onCancellationRequested: vi.fn() };
  });

  it('should return completions from the API', async () => {
    vi.mocked(mockLLMProvider.chatStream).mockReturnValue(
      mockCompletionStream('completed code')
    );

    const document = {
      getText: () => 'function hello() {\n  \n}',
      languageId: 'typescript',
      uri: { toString: () => 'file:///test.ts' },
    };

    const position = { line: 1, character: 2 };
    const context = { triggerKind: 0 };
    const token = { isCancellationRequested: false, onCancellationRequested: vi.fn() };

    const result = await provider.provideInlineCompletionItems(
      document as any,
      position as any,
      context as any,
      token as any
    );

    expect(result).toBeDefined();
    expect(result!.items).toHaveLength(1);
    expect(result!.items[0].insertText).toBe('completed code');
  });

  it('should return empty list when API fails', async () => {
    vi.mocked(mockLLMProvider.chatStream).mockImplementation(async function* () {
      throw new Error('Network error');
    });

    const document = {
      getText: () => 'code',
      languageId: 'typescript',
      uri: { toString: () => 'file:///test.ts' },
    };

    const result = await provider.provideInlineCompletionItems(
      document as any,
      { line: 0, character: 4 } as any,
      { triggerKind: 0 } as any,
      { isCancellationRequested: false, onCancellationRequested: vi.fn() } as any
    );

    expect(result!.items).toHaveLength(0);
  });

  it('should use completions.model setting when set', async () => {
    vi.mocked(mockLLMProvider.chatStream).mockReturnValue(
      mockCompletionStream('x')
    );

    const document = {
      getText: () => 'code',
      languageId: 'typescript',
      uri: { toString: () => 'file:///test.ts' },
    };

    await provider.provideInlineCompletionItems(
      document as any,
      { line: 0, character: 4 } as any,
      { triggerKind: 0 } as any,
      { isCancellationRequested: false, onCancellationRequested: vi.fn() } as any
    );

    const callArgs = vi.mocked(mockLLMProvider.chatStream).mock.calls[0][0];
    expect(callArgs.model).toBe('test/model');
  });

  it('should return empty list when editor.inlineSuggest.enabled is false', async () => {
    const { workspace } = await import('vscode');
    (workspace.getConfiguration as any).mockImplementation((section: string) => ({
      get: (key: string, defaultValue?: unknown) => {
        if (section === 'editor' && key === 'inlineSuggest.enabled') return false;
        const vals: Record<string, unknown> = {
          'completions.model': 'test/model',
          'completions.triggerMode': 'manual',
          'completions.debounceMs': 300,
          'completions.maxContextLines': 100,
          'chat.model': 'fallback/model',
          'chat.temperature': 0.7,
          'chat.maxTokens': 4096,
        };
        return vals[`${section}.${key}`] ?? vals[key] ?? defaultValue;
      },
    }));

    const result = await provider.provideInlineCompletionItems(
      mockDocument,
      mockPosition,
      {} as any,
      mockToken
    );

    expect(result.items).toHaveLength(0);
    expect(mockLLMProvider.chatStream).not.toHaveBeenCalled();
  });

  it('should return empty list when isCancellationRequested before API call', async () => {
    const document = {
      getText: () => 'code',
      languageId: 'typescript',
      uri: { toString: () => 'file:///test.ts' },
    };
    const token = { isCancellationRequested: true, onCancellationRequested: vi.fn() };

    // Override triggerMode to 'manual' so we skip the debounce await and test the
    // post-debounce cancellation check directly
    vi.mocked(vscodeModule.workspace.getConfiguration).mockReturnValueOnce({
      get: vi.fn((key: string) => {
        const vals: Record<string, unknown> = {
          'completions.model': 'test/model',
          'completions.triggerMode': 'manual',
          'completions.debounceMs': 0,
          'completions.maxContextLines': 100,
          'chat.model': 'fallback/model',
          'chat.temperature': 0.7,
          'chat.maxTokens': 4096,
        };
        return vals[key];
      }),
    } as any);
    const manualSettings = new Settings();
    const manualProvider = new InlineCompletionProvider(mockLLMProvider, manualSettings);

    const result = await manualProvider.provideInlineCompletionItems(
      document as any,
      { line: 0, character: 4 } as any,
      { triggerKind: 0 } as any,
      token as any
    );

    expect(result.items).toHaveLength(0);
    expect(mockLLMProvider.chatStream).not.toHaveBeenCalled();
  });

  describe('onLoadingChange callback', () => {
    beforeEach(() => {
      vi.mocked(vscodeModule.workspace.getConfiguration).mockImplementation((section?: string) => ({
        get: (key: string, defaultValue?: unknown) => {
          const vals: Record<string, unknown> = {
            'completions.model': 'test/model',
            'completions.triggerMode': 'manual',
            'completions.debounceMs': 0,
            'completions.maxContextLines': 100,
            'chat.model': 'fallback/model',
            'chat.temperature': 0.7,
            'chat.maxTokens': 4096,
          };
          return vals[`${section}.${key}`] ?? vals[key] ?? defaultValue;
        },
      } as any));
    });

    it('calls onLoadingChange(true) when completion starts', async () => {
      const onLoadingChange = vi.fn();
      const manualSettings = new Settings();
      const provider = new InlineCompletionProvider(mockLLMProvider, manualSettings, onLoadingChange);
      vi.mocked(mockLLMProvider.chatStream).mockReturnValue(
        mockCompletionStream('completed code')
      );
      await provider.provideInlineCompletionItems(mockDocument, mockPosition, {} as any, mockToken);
      expect(onLoadingChange).toHaveBeenCalledWith(true);
    });

    it('calls onLoadingChange(false) when completion ends', async () => {
      const onLoadingChange = vi.fn();
      const manualSettings = new Settings();
      const provider = new InlineCompletionProvider(mockLLMProvider, manualSettings, onLoadingChange);
      vi.mocked(mockLLMProvider.chatStream).mockReturnValue(
        mockCompletionStream('completed code')
      );
      await provider.provideInlineCompletionItems(mockDocument, mockPosition, {} as any, mockToken);
      expect(onLoadingChange).toHaveBeenLastCalledWith(false);
    });
  });

  it('should return empty when no model configured', async () => {
    // Override settings mock to return empty model
    vi.mocked(vscodeModule.workspace.getConfiguration).mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'completions.model') return '';
        if (key === 'chat.model') return '';
        return undefined;
      }),
    } as any);

    const noModelSettings = new Settings();
    const noModelProvider = new InlineCompletionProvider(mockLLMProvider, noModelSettings);

    const document = {
      getText: () => 'code',
      languageId: 'typescript',
      uri: { toString: () => 'file:///test.ts' },
    };

    const result = await noModelProvider.provideInlineCompletionItems(
      document as any,
      { line: 0, character: 4 } as any,
      { triggerKind: 0 } as any,
      { isCancellationRequested: false, onCancellationRequested: vi.fn() } as any
    );

    expect(result!.items).toHaveLength(0);
  });
});
