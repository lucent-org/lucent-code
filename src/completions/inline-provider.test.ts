import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

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
import { OpenRouterClient } from '../core/openrouter-client';

describe('InlineCompletionProvider', () => {
  let provider: InlineCompletionProvider;
  let client: OpenRouterClient;
  let settings: Settings;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new OpenRouterClient(() => Promise.resolve('sk-test'));
    settings = new Settings();
    provider = new InlineCompletionProvider(client, settings);
  });

  it('should return completions from the API', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 'gen-1',
          choices: [{ message: { role: 'assistant', content: 'completed code' }, finish_reason: 'stop' }],
        }),
    });

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
    mockFetch.mockRejectedValue(new Error('Network error'));

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
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 'gen-1',
          choices: [{ message: { role: 'assistant', content: 'x' }, finish_reason: 'stop' }],
        }),
    });

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

    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(fetchBody.model).toBe('test/model');
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
    const noModelProvider = new InlineCompletionProvider(client, noModelSettings);

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
