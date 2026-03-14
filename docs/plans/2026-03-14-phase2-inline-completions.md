# Phase 2 — Inline Completions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Copilot-like ghost text inline completions powered by any OpenRouter model, with automatic and manual trigger modes.

**Architecture:** Register a `vscode.InlineCompletionItemProvider` that builds a completion prompt from the code surrounding the cursor, sends it to OpenRouter via the existing `OpenRouterClient`, and returns the result as ghost text. A `TriggerConfig` module handles debouncing, auto/manual mode switching, and request cancellation. New settings are added to `package.json` and `Settings` class.

**Tech Stack:** TypeScript, VSCode InlineCompletionItemProvider API, existing OpenRouterClient

---

### Task 1: Add Completion Settings to package.json and Settings Class

**Files:**
- Modify: `package.json` — add 4 new configuration properties
- Modify: `src/core/settings.ts` — add 4 new getters
- Modify: `src/core/settings.test.ts` — add tests for new getters

**Step 1: Add new configuration properties to package.json**

Add these properties inside `contributes.configuration.properties`:

```json
"openRouterChat.completions.model": {
  "type": "string",
  "default": "",
  "description": "Model ID for inline completions (e.g., 'anthropic/claude-haiku-4-5-20251001'). Leave empty to use the chat model."
},
"openRouterChat.completions.triggerMode": {
  "type": "string",
  "enum": ["auto", "manual"],
  "default": "auto",
  "description": "Trigger mode for inline completions: 'auto' (suggest while typing) or 'manual' (only via keyboard shortcut)"
},
"openRouterChat.completions.debounceMs": {
  "type": "number",
  "default": 300,
  "minimum": 100,
  "maximum": 2000,
  "description": "Debounce delay in milliseconds for auto-trigger mode"
},
"openRouterChat.completions.maxContextLines": {
  "type": "number",
  "default": 100,
  "minimum": 10,
  "maximum": 500,
  "description": "Maximum number of lines before/after cursor to include as context"
}
```

Also add a new command:

```json
{
  "command": "openRouterChat.triggerCompletion",
  "title": "OpenRouter Chat: Trigger Inline Completion"
}
```

And add a keybinding in a new `keybindings` section in `contributes`:

```json
"keybindings": [
  {
    "command": "openRouterChat.triggerCompletion",
    "key": "alt+\\",
    "when": "editorTextFocus"
  }
]
```

**Step 2: Add new getters to Settings class**

Add to `src/core/settings.ts`:

```typescript
get completionsModel(): string {
  return this.config.get<string>('completions.model', '');
}

get completionsTriggerMode(): 'auto' | 'manual' {
  return this.config.get<string>('completions.triggerMode', 'auto') as 'auto' | 'manual';
}

get completionsDebounceMs(): number {
  return this.config.get<number>('completions.debounceMs', 300);
}

get completionsMaxContextLines(): number {
  return this.config.get<number>('completions.maxContextLines', 100);
}
```

**Step 3: Write tests for new settings**

Add to `src/core/settings.test.ts`:

```typescript
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
```

Update the mock `configValues` to include:
```typescript
'completions.model': '',
'completions.triggerMode': 'auto',
'completions.debounceMs': 300,
'completions.maxContextLines': 100,
```

**Step 4: Run tests**

Run: `npx vitest run src/core/settings.test.ts`
Expected: All 7 tests pass (3 existing + 4 new)

**Step 5: Build**

Run: `node esbuild.config.mjs`

**Step 6: Commit**

```bash
git add package.json src/core/settings.ts src/core/settings.test.ts
git commit -m "feat: add inline completion settings (model, triggerMode, debounce, maxContextLines)"
```

---

### Task 2: Trigger Configuration Module

**Files:**
- Create: `src/completions/trigger-config.ts`
- Create: `src/completions/trigger-config.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string) => {
        const vals: Record<string, unknown> = {
          'completions.triggerMode': 'auto',
          'completions.debounceMs': 300,
        };
        return vals[key];
      }),
    })),
  },
}));

import { TriggerConfig } from './trigger-config';

describe('TriggerConfig', () => {
  let config: TriggerConfig;

  beforeEach(() => {
    vi.useFakeTimers();
    config = new TriggerConfig();
  });

  afterEach(() => {
    vi.useRealTimers();
    config.dispose();
  });

  it('should debounce calls in auto mode', async () => {
    const callback = vi.fn();
    config.trigger(callback, 'auto', 300);
    config.trigger(callback, 'auto', 300);
    config.trigger(callback, 'auto', 300);

    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should execute immediately in manual mode', () => {
    const callback = vi.fn();
    config.trigger(callback, 'manual', 300);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should cancel pending triggers', () => {
    const callback = vi.fn();
    config.trigger(callback, 'auto', 300);
    config.cancel();
    vi.advanceTimersByTime(300);
    expect(callback).not.toHaveBeenCalled();
  });

  it('should abort in-flight requests via signal', () => {
    config.trigger(() => {}, 'manual', 300);
    const signal = config.getAbortSignal();
    expect(signal.aborted).toBe(false);

    config.cancel();
    expect(signal.aborted).toBe(true);
  });

  it('should cancel previous request when new one starts', () => {
    config.trigger(() => {}, 'manual', 300);
    const firstSignal = config.getAbortSignal();

    config.trigger(() => {}, 'manual', 300);
    expect(firstSignal.aborted).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/completions/trigger-config.test.ts`
Expected: FAIL — cannot find module

**Step 3: Write the implementation**

```typescript
export class TriggerConfig {
  private debounceTimer?: ReturnType<typeof setTimeout>;
  private abortController?: AbortController;

  trigger(callback: () => void, mode: 'auto' | 'manual', debounceMs: number): void {
    // Cancel any pending debounce
    this.clearDebounce();

    // Abort previous in-flight request
    this.abortController?.abort();
    this.abortController = new AbortController();

    if (mode === 'manual') {
      callback();
    } else {
      this.debounceTimer = setTimeout(callback, debounceMs);
    }
  }

  cancel(): void {
    this.clearDebounce();
    this.abortController?.abort();
  }

  getAbortSignal(): AbortSignal {
    if (!this.abortController) {
      this.abortController = new AbortController();
    }
    return this.abortController.signal;
  }

  private clearDebounce(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
  }

  dispose(): void {
    this.cancel();
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/completions/trigger-config.test.ts`
Expected: All 5 tests pass

**Step 5: Commit**

```bash
git add src/completions/trigger-config.ts src/completions/trigger-config.test.ts
git commit -m "feat: add TriggerConfig with debounce, manual trigger, and cancellation"
```

---

### Task 3: Completion Prompt Builder

**Files:**
- Create: `src/completions/prompt-builder.ts`
- Create: `src/completions/prompt-builder.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { buildCompletionPrompt } from './prompt-builder';

describe('buildCompletionPrompt', () => {
  const fullContent = [
    'function greet(name: string) {',
    '  console.log(`Hello, ${name}!`);',
    '}',
    '',
    'function add(a: number, b: number) {',
    '  return a + b;',
    '}',
    '',
    'function main() {',
    '  const result = add(1, 2);',
    '  ',
    '}',
  ].join('\n');

  it('should split content at cursor into prefix and suffix', () => {
    const result = buildCompletionPrompt(fullContent, 10, 2, 'typescript', 100);
    expect(result.prefix).toContain('function main()');
    expect(result.prefix).toEndWith('  ');
    expect(result.suffix).toContain('}');
  });

  it('should include language in the prompt', () => {
    const result = buildCompletionPrompt(fullContent, 10, 2, 'typescript', 100);
    expect(result.languageId).toBe('typescript');
  });

  it('should limit context to maxLines before and after cursor', () => {
    const result = buildCompletionPrompt(fullContent, 10, 2, 'typescript', 3);
    const prefixLines = result.prefix.split('\n');
    expect(prefixLines.length).toBeLessThanOrEqual(4); // 3 before + current line
  });

  it('should handle cursor at start of file', () => {
    const result = buildCompletionPrompt(fullContent, 0, 0, 'typescript', 100);
    expect(result.prefix).toBe('');
    expect(result.suffix.length).toBeGreaterThan(0);
  });

  it('should handle cursor at end of file', () => {
    const lines = fullContent.split('\n');
    const lastLine = lines.length - 1;
    const lastChar = lines[lastLine].length;
    const result = buildCompletionPrompt(fullContent, lastLine, lastChar, 'typescript', 100);
    expect(result.suffix).toBe('');
    expect(result.prefix.length).toBeGreaterThan(0);
  });

  it('should build chat messages for the API call', () => {
    const result = buildCompletionPrompt(fullContent, 10, 2, 'typescript', 100);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].role).toBe('system');
    expect(result.messages[0].content).toContain('code completion');
    expect(result.messages[1].role).toBe('user');
    expect(result.messages[1].content).toContain(result.prefix);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/completions/prompt-builder.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
import type { ChatMessage } from '../shared/types';

export interface CompletionPrompt {
  prefix: string;
  suffix: string;
  languageId: string;
  messages: ChatMessage[];
}

export function buildCompletionPrompt(
  content: string,
  cursorLine: number,
  cursorCharacter: number,
  languageId: string,
  maxContextLines: number
): CompletionPrompt {
  const lines = content.split('\n');

  // Calculate windowed range
  const startLine = Math.max(0, cursorLine - maxContextLines);
  const endLine = Math.min(lines.length - 1, cursorLine + maxContextLines);

  // Build prefix: from startLine to cursor position
  const prefixLines = lines.slice(startLine, cursorLine);
  const currentLinePrefix = lines[cursorLine]?.substring(0, cursorCharacter) ?? '';
  const prefix = [...prefixLines, currentLinePrefix].join('\n');

  // Build suffix: from cursor position to endLine
  const currentLineSuffix = lines[cursorLine]?.substring(cursorCharacter) ?? '';
  const suffixLines = lines.slice(cursorLine + 1, endLine + 1);
  const suffix = [currentLineSuffix, ...suffixLines].join('\n');

  // Build messages for the API
  const systemMessage: ChatMessage = {
    role: 'system',
    content: `You are a code completion assistant. You provide short, accurate code completions for ${languageId} code. Only output the completion text — no explanations, no markdown, no code fences. Continue from exactly where the cursor is.`,
  };

  const userMessage: ChatMessage = {
    role: 'user',
    content: `Complete the following ${languageId} code at the cursor position marked with <CURSOR>:\n\n${prefix}<CURSOR>${suffix}`,
  };

  return {
    prefix,
    suffix,
    languageId,
    messages: [systemMessage, userMessage],
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/completions/prompt-builder.test.ts`
Expected: All 6 tests pass

**Step 5: Commit**

```bash
git add src/completions/prompt-builder.ts src/completions/prompt-builder.test.ts
git commit -m "feat: add completion prompt builder with windowed context"
```

---

### Task 4: Inline Completion Provider

**Files:**
- Create: `src/completions/inline-provider.ts`
- Create: `src/completions/inline-provider.test.ts`

**Step 1: Write the failing test**

```typescript
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
        };
        return vals[key];
      }),
    })),
  },
  ConfigurationTarget: { Global: 1 },
}));

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

  it('should return empty list when API key is missing', async () => {
    const noKeyClient = new OpenRouterClient(() => Promise.resolve(undefined));
    const noKeyProvider = new InlineCompletionProvider(noKeyClient, settings);

    mockFetch.mockRejectedValue(new Error('No API key'));

    const document = {
      getText: () => 'code',
      languageId: 'typescript',
      uri: { toString: () => 'file:///test.ts' },
    };

    const result = await noKeyProvider.provideInlineCompletionItems(
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
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/completions/inline-provider.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
import * as vscode from 'vscode';
import { OpenRouterClient } from '../core/openrouter-client';
import { Settings } from '../core/settings';
import { TriggerConfig } from './trigger-config';
import { buildCompletionPrompt } from './prompt-builder';

export class InlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  private readonly triggerConfig = new TriggerConfig();

  constructor(
    private readonly client: OpenRouterClient,
    private readonly settings: Settings
  ) {}

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionList> {
    const emptyResult = new vscode.InlineCompletionList([]);

    // Determine which model to use
    const model = this.settings.completionsModel || this.settings.chatModel;
    if (!model) {
      return emptyResult;
    }

    // Build the completion prompt
    const prompt = buildCompletionPrompt(
      document.getText(),
      position.line,
      position.character,
      document.languageId,
      this.settings.completionsMaxContextLines
    );

    // Cancel previous request
    this.triggerConfig.cancel();

    try {
      const response = await this.client.chat({
        model,
        messages: prompt.messages,
        temperature: 0.2,
        max_tokens: 256,
      });

      // Check if cancelled while waiting
      if (token.isCancellationRequested) {
        return emptyResult;
      }

      const completionText = response.choices[0]?.message?.content?.trim();
      if (!completionText) {
        return emptyResult;
      }

      const item = new vscode.InlineCompletionItem(completionText);
      return new vscode.InlineCompletionList([item]);
    } catch {
      return emptyResult;
    }
  }

  dispose(): void {
    this.triggerConfig.dispose();
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/completions/inline-provider.test.ts`
Expected: All 3 tests pass

**Step 5: Commit**

```bash
git add src/completions/inline-provider.ts src/completions/inline-provider.test.ts
git commit -m "feat: add InlineCompletionProvider with model selection and prompt building"
```

---

### Task 5: Register Provider in Extension Entry Point

**Files:**
- Modify: `src/extension.ts`
- Modify: `package.json` (already done in Task 1 for the command)

**Step 1: Update extension.ts to register the inline completion provider**

Add import at the top:
```typescript
import { InlineCompletionProvider } from './completions/inline-provider';
```

Add after the message handler setup (after line ~46 in current file), before the commands section:

```typescript
  // Register inline completion provider
  const completionProvider = new InlineCompletionProvider(client, settings);
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      { pattern: '**' },
      completionProvider
    )
  );

  // Register manual trigger command
  context.subscriptions.push(
    vscode.commands.registerCommand('openRouterChat.triggerCompletion', () => {
      vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
    })
  );
```

Add cleanup in the dispose section:
```typescript
  context.subscriptions.push({
    dispose: () => {
      auth.dispose();
      completionProvider.dispose();
    },
  });
```

(Replace the existing dispose that only calls `auth.dispose()`)

**Step 2: Build**

Run: `node esbuild.config.mjs`
Expected: Build succeeds

**Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/extension.ts
git commit -m "feat: register InlineCompletionProvider and manual trigger command"
```

---

### Task 6: Add Debounce-Aware Triggering

**Files:**
- Modify: `src/completions/inline-provider.ts` — integrate TriggerConfig debounce into the provider

**Step 1: Update the provider to use debounce for auto mode**

Replace the `provideInlineCompletionItems` method to wrap the API call with the trigger config:

```typescript
async provideInlineCompletionItems(
  document: vscode.TextDocument,
  position: vscode.Position,
  context: vscode.InlineCompletionContext,
  token: vscode.CancellationToken
): Promise<vscode.InlineCompletionList> {
  const emptyResult = new vscode.InlineCompletionList([]);

  const model = this.settings.completionsModel || this.settings.chatModel;
  if (!model) {
    return emptyResult;
  }

  const prompt = buildCompletionPrompt(
    document.getText(),
    position.line,
    position.character,
    document.languageId,
    this.settings.completionsMaxContextLines
  );

  // Cancel any previous pending request
  this.triggerConfig.cancel();

  // In auto mode, debounce the request
  const triggerMode = this.settings.completionsTriggerMode;
  const debounceMs = this.settings.completionsDebounceMs;

  if (triggerMode === 'auto') {
    await new Promise<void>((resolve) => {
      this.triggerConfig.trigger(resolve, 'auto', debounceMs);
    });
  }

  if (token.isCancellationRequested) {
    return emptyResult;
  }

  try {
    const response = await this.client.chat({
      model,
      messages: prompt.messages,
      temperature: 0.2,
      max_tokens: 256,
    });

    if (token.isCancellationRequested) {
      return emptyResult;
    }

    const completionText = response.choices[0]?.message?.content?.trim();
    if (!completionText) {
      return emptyResult;
    }

    const item = new vscode.InlineCompletionItem(completionText);
    return new vscode.InlineCompletionList([item]);
  } catch {
    return emptyResult;
  }
}
```

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 3: Build**

Run: `node esbuild.config.mjs`

**Step 4: Commit**

```bash
git add src/completions/inline-provider.ts
git commit -m "feat: integrate debounce into inline completion provider for auto mode"
```

---

### Task 7: End-to-End Verification & Status Bar Indicator

**Files:**
- Modify: `src/completions/inline-provider.ts` — add status bar item showing completion state

**Step 1: Add a status bar item to show completion activity**

Add to the constructor:
```typescript
private readonly statusBarItem: vscode.StatusBarItem;

constructor(
  private readonly client: OpenRouterClient,
  private readonly settings: Settings
) {
  this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  this.statusBarItem.text = '$(sparkle) OpenRouter';
  this.statusBarItem.tooltip = 'OpenRouter Inline Completions';
  this.statusBarItem.show();
}
```

Update `provideInlineCompletionItems` to show loading state:
- Before the API call: `this.statusBarItem.text = '$(loading~spin) OpenRouter';`
- After success: `this.statusBarItem.text = '$(sparkle) OpenRouter';`
- After error/empty: `this.statusBarItem.text = '$(sparkle) OpenRouter';`

Update `dispose`:
```typescript
dispose(): void {
  this.triggerConfig.dispose();
  this.statusBarItem.dispose();
}
```

**Step 2: Build and run all tests**

Run: `npx vitest run && node esbuild.config.mjs`
Expected: All pass

**Step 3: Commit**

```bash
git add src/completions/inline-provider.ts
git commit -m "feat: add status bar indicator for inline completion activity"
```

---

### Task 8: Manual End-to-End Test

**Step 1: Press F5 in VSCode to launch Extension Development Host**

Expected:
1. Status bar shows "OpenRouter" sparkle icon on the right
2. Open any code file (e.g., a `.ts` file)
3. Start typing — after 300ms pause, ghost text appears (auto mode)
4. Press `Alt+\` — manually triggers a completion
5. Press Escape to dismiss
6. Change `openRouterChat.completions.triggerMode` to `manual` in settings
7. Typing should no longer auto-trigger — only `Alt+\` works

**Step 2: Test edge cases**

- Empty file — should not crash
- Very large file — context should be windowed
- No API key — should silently return no completions
- Cancel by continuing to type — previous request should be aborted

**Step 3: Fix any issues found**

**Step 4: Final commit if fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during inline completions testing"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Completion settings | `package.json`, `src/core/settings.ts` + test |
| 2 | Trigger config | `src/completions/trigger-config.ts` + test |
| 3 | Prompt builder | `src/completions/prompt-builder.ts` + test |
| 4 | Inline provider | `src/completions/inline-provider.ts` + test |
| 5 | Extension wiring | `src/extension.ts` |
| 6 | Debounce integration | `src/completions/inline-provider.ts` |
| 7 | Status bar indicator | `src/completions/inline-provider.ts` |
| 8 | End-to-end test | Manual testing |
