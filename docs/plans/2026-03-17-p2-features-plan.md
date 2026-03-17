# P2 Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement four P2 backlog features: AI commit message generation, @mentions context system with @terminal, contextual code actions in the system prompt, and Tavily premium web search.

**Architecture:** Each feature is an independent addition — no existing behaviour changes, only new commands, new context providers, and new tool routing. The @mentions system introduces a new message roundtrip (webview → extension → webview) using the existing postMessage channel. All new tests follow the Vitest + vi.mock('vscode') pattern already used throughout the codebase.

**Tech Stack:** TypeScript, VS Code Extension API, Solid.js (webview), Vitest, VS Code Git extension API (built-in), Tavily Search API.

---

## Task 1: Generate commit message — package.json

**Files:**
- Modify: `package.json`

**Step 1: Add the command entry**

In `package.json` → `contributes.commands`, add after the last command:

```json
{
  "command": "lucentCode.generateCommitMessage",
  "title": "Generate Commit Message",
  "category": "Lucent Code",
  "icon": "$(sparkle)"
}
```

**Step 2: Add the SCM input box menu contribution**

In `package.json` → `contributes.menus`, add a new `"scm/inputBox"` key alongside the existing menu keys:

```json
"scm/inputBox": [
  {
    "command": "lucentCode.generateCommitMessage",
    "group": "navigation"
  }
]
```

**Step 3: Verify the JSON is valid**

```bash
node -e "require('./package.json'); console.log('valid')"
```

Expected: `valid`

**Step 4: Commit**

```bash
git add package.json
git commit -m "feat: add generateCommitMessage command to package.json"
```

---

## Task 2: Generate commit message — extension.ts

**Files:**
- Modify: `src/extension.ts`

**Step 1: Add the Git extension interface types**

At the top of `src/extension.ts`, after the existing imports, add:

```typescript
interface GitExtension {
  getAPI(version: 1): GitAPI;
}
interface GitAPI {
  repositories: Array<{
    diff(staged: boolean): Promise<string>;
    inputBox: { value: string };
  }>;
}
```

**Step 2: Register the command in activate()**

In `src/extension.ts`, inside `activate()`, after the context menu commands block (around line 207), add:

```typescript
context.subscriptions.push(
  vscode.commands.registerCommand('lucentCode.generateCommitMessage', async () => {
    const gitExt = vscode.extensions.getExtension<GitExtension>('vscode.git');
    if (!gitExt) {
      vscode.window.showInformationMessage('Git extension not found.');
      return;
    }
    const git = gitExt.exports.getAPI(1);
    const repo = git.repositories[0];
    if (!repo) {
      vscode.window.showInformationMessage('No Git repository found.');
      return;
    }
    const diff = await repo.diff(true);
    if (!diff.trim()) {
      vscode.window.showInformationMessage('No staged changes to generate a message from.');
      return;
    }
    const key = await auth.ensureAuthenticated();
    if (!key) return;
    const model = settings.chatModel || 'anthropic/claude-haiku-4-5-20251001';
    try {
      const response = await client.chat({
        model,
        messages: [{
          role: 'user',
          content: `Write a concise conventional commit message for this staged diff. Return only the commit message line, no explanation, no markdown.\n\n${diff}`,
        }],
        temperature: 0.3,
        max_tokens: 100,
      });
      const message = response.choices[0]?.message?.content?.trim() ?? '';
      if (message) repo.inputBox.value = message;
    } catch (error) {
      await notifications.handleError(error instanceof Error ? error : new Error(String(error)));
    }
  })
);
```

**Step 3: Build to verify no TypeScript errors**

```bash
npm run build
```

Expected: exit 0, no errors

**Step 4: Commit**

```bash
git add src/extension.ts
git commit -m "feat: implement generateCommitMessage command with Git API + LLM"
```

---

## Task 3: Terminal buffer service

**Files:**
- Create: `src/core/terminal-buffer.ts`
- Create: `src/core/terminal-buffer.test.ts`

**Step 1: Write the failing test**

Create `src/core/terminal-buffer.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Terminal } from 'vscode';

// Capture the onDidWriteTerminalData listener so tests can call it directly
let writeDataListener: ((e: { terminal: Terminal; data: string }) => void) | undefined;
let closeListener: ((terminal: Terminal) => void) | undefined;

vi.mock('vscode', () => ({
  window: {
    onDidWriteTerminalData: vi.fn((cb) => { writeDataListener = cb; return { dispose: vi.fn() }; }),
    onDidCloseTerminal: vi.fn((cb) => { closeListener = cb; return { dispose: vi.fn() }; }),
    activeTerminal: undefined as Terminal | undefined,
  },
}));

import { TerminalBuffer } from './terminal-buffer';

const makeTerminal = (name: string) => ({ name } as unknown as Terminal);

describe('TerminalBuffer', () => {
  beforeEach(() => {
    writeDataListener = undefined;
    closeListener = undefined;
  });

  it('returns undefined when no active terminal', () => {
    const buf = new TerminalBuffer();
    expect(buf.getActiveTerminalOutput()).toBeUndefined();
    buf.dispose();
  });

  it('buffers lines written to the active terminal', async () => {
    const term = makeTerminal('bash');
    const vscode = await import('vscode');
    (vscode.window as { activeTerminal: Terminal | undefined }).activeTerminal = term;
    const buf = new TerminalBuffer();

    writeDataListener!({ terminal: term, data: 'hello\nworld\n' });

    expect(buf.getActiveTerminalOutput()).toContain('hello');
    expect(buf.getActiveTerminalOutput()).toContain('world');
    buf.dispose();
  });

  it('keeps only last 200 lines', async () => {
    const term = makeTerminal('zsh');
    const vscode = await import('vscode');
    (vscode.window as { activeTerminal: Terminal | undefined }).activeTerminal = term;
    const buf = new TerminalBuffer();

    const data = Array.from({ length: 300 }, (_, i) => `line${i}`).join('\n') + '\n';
    writeDataListener!({ terminal: term, data });

    const output = buf.getActiveTerminalOutput()!;
    const lines = output.split('\n').filter(Boolean);
    expect(lines.length).toBeLessThanOrEqual(200);
    expect(lines[lines.length - 1]).toBe('line299');
    buf.dispose();
  });

  it('clears buffer when terminal is closed', async () => {
    const term = makeTerminal('fish');
    const vscode = await import('vscode');
    (vscode.window as { activeTerminal: Terminal | undefined }).activeTerminal = term;
    const buf = new TerminalBuffer();

    writeDataListener!({ terminal: term, data: 'some output\n' });
    closeListener!(term);

    expect(buf.getActiveTerminalOutput()).toBeUndefined();
    buf.dispose();
  });
});
```

**Step 2: Run to verify it fails**

```bash
npx vitest run src/core/terminal-buffer.test.ts
```

Expected: FAIL — `Cannot find module './terminal-buffer'`

**Step 3: Write the implementation**

Create `src/core/terminal-buffer.ts`:

```typescript
import * as vscode from 'vscode';

export class TerminalBuffer implements vscode.Disposable {
  private readonly buffers = new WeakMap<vscode.Terminal, string[]>();
  private readonly disposables: vscode.Disposable[] = [];
  private static readonly MAX_LINES = 200;

  constructor() {
    this.disposables.push(
      vscode.window.onDidWriteTerminalData(({ terminal, data }) => {
        const existing = this.buffers.get(terminal) ?? [];
        const newLines = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
        const combined = [...existing, ...newLines].slice(-TerminalBuffer.MAX_LINES);
        this.buffers.set(terminal, combined);
      }),
      vscode.window.onDidCloseTerminal((terminal) => {
        this.buffers.delete(terminal);
      })
    );
  }

  getActiveTerminalOutput(): string | undefined {
    const terminal = vscode.window.activeTerminal;
    if (!terminal) return undefined;
    const lines = this.buffers.get(terminal);
    if (!lines || lines.length === 0) return undefined;
    return lines.join('\n');
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/core/terminal-buffer.test.ts
```

Expected: 4 passing

**Step 5: Commit**

```bash
git add src/core/terminal-buffer.ts src/core/terminal-buffer.test.ts
git commit -m "feat: add TerminalBuffer service — buffers last 200 lines per terminal"
```

---

## Task 4: @terminal — types, message handler, extension wiring

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/chat/message-handler.ts`
- Modify: `src/extension.ts`

**Step 1: Add message types to `src/shared/types.ts`**

In `WebviewMessage`, add:

```typescript
| { type: 'getTerminalOutput' }
```

In `ExtensionMessage`, add:

```typescript
| { type: 'terminalOutput'; content: string | null }
```

**Step 2: Add TerminalBuffer to MessageHandler constructor**

In `src/chat/message-handler.ts`:

Add import at top:
```typescript
import { TerminalBuffer } from '../core/terminal-buffer';
```

Add `terminalBuffer` as the last optional constructor parameter:
```typescript
constructor(
  private readonly client: OpenRouterClient,
  private readonly contextBuilder: ContextBuilder,
  private readonly settings: Settings,
  private readonly toolExecutor?: EditorToolExecutor,
  private readonly history?: ConversationHistory,
  private readonly notifications: NotificationService = new NotificationService(),
  private readonly terminalBuffer?: TerminalBuffer
) {}
```

Add the `getTerminalOutput` case to `handleMessage()`:

```typescript
case 'getTerminalOutput': {
  const content = this.terminalBuffer?.getActiveTerminalOutput() ?? null;
  postMessage({ type: 'terminalOutput', content });
  break;
}
```

**Step 3: Wire TerminalBuffer in `src/extension.ts`**

Add import:
```typescript
import { TerminalBuffer } from './core/terminal-buffer';
```

Inside `activate()`, after the `notifications` line, add:
```typescript
const terminalBuffer = new TerminalBuffer();
```

Update the `MessageHandler` instantiation to pass `terminalBuffer` as the 7th argument:
```typescript
messageHandler = new MessageHandler(client, contextBuilder, settings, toolExecutor, history, notifications, terminalBuffer);
```

Add `terminalBuffer` to the cleanup disposable:
```typescript
context.subscriptions.push({
  dispose: () => {
    auth.dispose();
    completionProvider.dispose();
    instructionsLoader.dispose();
    terminalBuffer.dispose();
  },
});
```

**Step 4: Build to verify**

```bash
npm run build
```

Expected: exit 0

**Step 5: Run full test suite**

```bash
npx vitest run
```

Expected: all existing tests pass (new case in handler is untested — covered by integration)

**Step 6: Commit**

```bash
git add src/shared/types.ts src/chat/message-handler.ts src/extension.ts
git commit -m "feat: wire @terminal — message types, handler case, TerminalBuffer in activate"
```

---

## Task 5: @mentions webview UI

**Files:**
- Modify: `webview/src/components/ChatInput.tsx`
- Modify: `webview/src/App.tsx`
- Modify: `webview/src/styles.css`

**Step 1: Update `webview/src/components/ChatInput.tsx`**

Replace the entire file with:

```tsx
import { Component, createSignal, Show, For } from 'solid-js';

interface MentionSource {
  id: string;
  label: string;
  description: string;
}

const MENTION_SOURCES: MentionSource[] = [
  { id: 'terminal', label: '@terminal', description: 'Last 200 lines of active terminal' },
];

interface ChatInputProps {
  onSend: (content: string) => void;
  onCancel: () => void;
  isStreaming: boolean;
  onResolveMention: (type: string) => Promise<string | null>;
}

const ChatInput: Component<ChatInputProps> = (props) => {
  const [input, setInput] = createSignal('');
  const [showMentions, setShowMentions] = createSignal(false);
  const [mentionFilter, setMentionFilter] = createSignal('');

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowMentions(false);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !showMentions()) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: Event) => {
    const value = (e.currentTarget as HTMLTextAreaElement).value;
    setInput(value);

    // Detect @ trigger — only open at start or after a space
    const lastAt = value.lastIndexOf('@');
    if (lastAt !== -1 && (lastAt === 0 || value[lastAt - 1] === ' ')) {
      const after = value.slice(lastAt + 1);
      // Only show if no space after @
      if (!after.includes(' ')) {
        setMentionFilter(after.toLowerCase());
        setShowMentions(true);
        return;
      }
    }
    setShowMentions(false);
  };

  const filteredSources = () =>
    MENTION_SOURCES.filter((s) => s.label.toLowerCase().includes(mentionFilter()));

  const selectMention = async (source: MentionSource) => {
    setShowMentions(false);
    const value = input();
    const lastAt = value.lastIndexOf('@');
    const beforeAt = lastAt !== -1 ? value.slice(0, lastAt) : value;

    const content = await props.onResolveMention(source.id);
    if (content) {
      setInput(`${beforeAt}<${source.id} output>\n${content}\n</${source.id} output> `);
    } else {
      setInput(`${beforeAt}[${source.label}: not available] `);
    }
  };

  const handleSend = () => {
    const content = input().trim();
    if (content && !props.isStreaming) {
      props.onSend(content);
      setInput('');
    }
  };

  return (
    <div class="chat-input-container">
      <div class="chat-input-wrapper">
        <Show when={showMentions() && filteredSources().length > 0}>
          <div class="mention-dropdown">
            <For each={filteredSources()}>
              {(source) => (
                <button
                  class="mention-item"
                  onMouseDown={(e) => { e.preventDefault(); void selectMention(source); }}
                >
                  <span class="mention-item-label">{source.label}</span>
                  <span class="mention-item-desc">{source.description}</span>
                </button>
              )}
            </For>
          </div>
        </Show>
        <textarea
          class="chat-input"
          value={input()}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your code... Type @ for context"
          rows={3}
          disabled={props.isStreaming}
        />
      </div>
      <div class="chat-input-actions">
        <Show
          when={props.isStreaming}
          fallback={
            <button class="send-button" onClick={handleSend} disabled={!input().trim()}>
              Send
            </button>
          }
        >
          <button class="cancel-button" onClick={props.onCancel}>
            Stop
          </button>
        </Show>
      </div>
    </div>
  );
};

export default ChatInput;
```

**Step 2: Update `webview/src/App.tsx` — wire `onResolveMention`**

Find where `<ChatInput` is rendered in `App.tsx`. Add the `onResolveMention` prop:

```tsx
<ChatInput
  onSend={handleSend}
  onCancel={handleCancel}
  isStreaming={isStreaming()}
  onResolveMention={handleResolveMention}
/>
```

Add the `handleResolveMention` function to `App.tsx` (place it alongside the other handlers):

```typescript
const handleResolveMention = (type: string): Promise<string | null> => {
  return new Promise((resolve) => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as { type: string; content?: string | null };
      if (msg.type === 'terminalOutput') {
        window.removeEventListener('message', handler);
        resolve(msg.content ?? null);
      }
    };
    window.addEventListener('message', handler);
    vscode.postMessage({ type: 'getTerminalOutput' });
    setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve(null);
    }, 3000);
  });
};
```

**Step 3: Add CSS to `webview/src/styles.css`**

Add after the `.chat-input:focus` block:

```css
/* Mention dropdown */
.chat-input-wrapper {
  position: relative;
}

.mention-dropdown {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
  margin-bottom: 4px;
  z-index: 200;
  overflow: hidden;
}

.mention-item {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 6px 10px;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  gap: 2px;
}

.mention-item:hover {
  background: var(--accent);
}

.mention-item-label {
  font-weight: 600;
  font-size: 0.9em;
  color: var(--fg-primary);
}

.mention-item-desc {
  font-size: 0.8em;
  color: var(--fg-secondary);
}

.mention-item:hover .mention-item-label,
.mention-item:hover .mention-item-desc {
  color: var(--accent-fg);
}
```

**Step 4: Build to verify**

```bash
npm run build
```

Expected: exit 0

**Step 5: Commit**

```bash
git add webview/src/components/ChatInput.tsx webview/src/App.tsx webview/src/styles.css
git commit -m "feat: add @mentions UI with @terminal support to chat input"
```

---

## Task 6: Contextual code actions

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/core/context-builder.ts`
- Modify: `src/core/context-builder.test.ts`

**Step 1: Add `codeActions` to `CodeContext` in `src/shared/types.ts`**

In the `CodeContext` interface, add after `diagnostics`:

```typescript
codeActions?: string[];
```

**Step 2: Write the failing test**

In `src/core/context-builder.test.ts`, add a new `describe('buildEnrichedContext — code actions')` block. First, look at how the existing tests mock `vscode.commands.executeCommand` and follow the same pattern.

Add this test block at the end of the file:

```typescript
describe('buildEnrichedContext — code actions', () => {
  it('populates codeActions from executeCodeActionProvider', async () => {
    const mockActions = [
      { title: 'Add missing import' },
      { title: 'Extract to function', kind: { value: 'refactor' } },
    ];
    vi.mocked(vscode.commands.executeCommand).mockResolvedValueOnce(undefined) // resolveContext
      .mockResolvedValueOnce(mockActions); // executeCodeActionProvider

    const builder = new ContextBuilder();
    // need an active file in context — mock activeTextEditor
    const mockEditor = {
      document: { uri: { toString: () => 'file:///test.ts' }, languageId: 'typescript', getText: () => '' },
      selection: { active: { line: 5, character: 0 }, isEmpty: true, start: { line: 5 }, end: { line: 5 } },
    };
    vi.mocked(vscode.window).activeTextEditor = mockEditor as unknown as vscode.TextEditor;
    vi.mocked(vscode.window).visibleTextEditors = [];

    const context = await builder.buildEnrichedContext();
    expect(context.codeActions).toEqual(['Add missing import', 'Extract to function']);
  });

  it('omits codeActions when none available', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([]);
    const builder = new ContextBuilder();
    const context = await builder.buildEnrichedContext();
    expect(context.codeActions).toBeUndefined();
  });
});
```

**Step 3: Run to verify tests fail**

```bash
npx vitest run src/core/context-builder.test.ts
```

Expected: 2 new tests failing

**Step 4: Update `buildEnrichedContext()` in `src/core/context-builder.ts`**

At the end of `buildEnrichedContext()`, after the diagnostics block (before `return context`), add:

```typescript
// Fetch available code actions at cursor
try {
  const uri = vscode.Uri.parse(context.activeFile!.uri);
  const pos = new vscode.Position(line, char);
  const range = new vscode.Range(pos, pos);
  const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
    'vscode.executeCodeActionProvider',
    uri,
    range,
    vscode.CodeActionKind.QuickFix.value
  );
  if (actions && actions.length > 0) {
    context.codeActions = actions.map((a) => a.title);
  }
} catch {
  // Code actions not supported for this language — omit
}
```

**Step 5: Update `formatEnrichedPrompt()` in `src/core/context-builder.ts`**

After the diagnostics block in `formatEnrichedPrompt()`, add:

```typescript
if (context.codeActions && context.codeActions.length > 0) {
  prompt += '\n\n## Available Code Actions at Cursor:\n';
  for (const action of context.codeActions) {
    prompt += `- ${action}\n`;
  }
}
```

**Step 6: Run tests**

```bash
npx vitest run src/core/context-builder.test.ts
```

Expected: all passing (including the 2 new ones)

**Step 7: Run full test suite**

```bash
npx vitest run
```

Expected: all passing

**Step 8: Commit**

```bash
git add src/shared/types.ts src/core/context-builder.ts src/core/context-builder.test.ts
git commit -m "feat: inject available code actions at cursor into system prompt context"
```

---

## Task 7: Tavily premium web search

**Files:**
- Modify: `src/core/auth.ts`
- Modify: `src/lsp/editor-tools.ts`
- Modify: `src/lsp/editor-tools.test.ts`
- Modify: `package.json`
- Modify: `src/extension.ts`

**Step 1: Write the failing test for Tavily in `src/lsp/editor-tools.test.ts`**

Find the existing `search_web` test block in `src/lsp/editor-tools.test.ts` and add two new tests:

```typescript
it('uses Tavily when a key is provided', async () => {
  const tavilyResponse = {
    results: [
      { title: 'Result 1', url: 'https://example.com', content: 'Some content' },
    ],
  };
  vi.mocked(global.fetch).mockResolvedValueOnce({
    ok: true,
    json: async () => tavilyResponse,
  } as Response);

  const executor = new EditorToolExecutor(async () => 'tvly-test-key');
  const result = await executor.execute('search_web', { query: 'typescript generics' });

  expect(result.success).toBe(true);
  expect(result.message).toContain('Result 1');
  const call = vi.mocked(global.fetch).mock.calls[0];
  expect(call[0]).toBe('https://api.tavily.com/search');
});

it('falls back to DuckDuckGo when no Tavily key', async () => {
  const ddgResponse = { Abstract: 'TypeScript is a language', RelatedTopics: [] };
  vi.mocked(global.fetch).mockResolvedValueOnce({
    ok: true,
    json: async () => ddgResponse,
  } as Response);

  const executor = new EditorToolExecutor(async () => undefined);
  const result = await executor.execute('search_web', { query: 'typescript' });

  expect(result.success).toBe(true);
  const call = vi.mocked(global.fetch).mock.calls[0];
  expect((call[0] as string)).toContain('duckduckgo.com');
});
```

**Step 2: Run to verify they fail**

```bash
npx vitest run src/lsp/editor-tools.test.ts
```

Expected: 2 new tests fail — `EditorToolExecutor` constructor doesn't accept arguments yet

**Step 3: Update `src/lsp/editor-tools.ts`**

Add a constructor to `EditorToolExecutor`:

```typescript
export class EditorToolExecutor {
  constructor(
    private readonly getTavilyApiKey?: () => Promise<string | undefined>
  ) {}
```

Refactor `searchWeb()` to split into three methods:

```typescript
private async searchWeb(args: Record<string, unknown>): Promise<ToolResult> {
  const query = args.query as string;
  const tavilyKey = await this.getTavilyApiKey?.();
  if (tavilyKey) {
    try {
      return await this.searchWebTavily(query, tavilyKey);
    } catch {
      // Fall through to DuckDuckGo
    }
  }
  return this.searchWebDuckDuckGo(query);
}

private async searchWebTavily(query: string, apiKey: string): Promise<ToolResult> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, max_results: 5, search_depth: 'basic' }),
  });
  if (!response.ok) throw new Error(`Tavily search failed: ${response.status}`);
  const data = await response.json() as {
    results: Array<{ title: string; url: string; content: string }>;
  };
  const parts = data.results.map((r) => `**${r.title}**\n${r.url}\n${r.content}`);
  return { success: true, message: parts.join('\n\n') || 'No results found' };
}

private async searchWebDuckDuckGo(query: string): Promise<ToolResult> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const response = await fetch(url);
  if (!response.ok) return { success: false, error: `Search failed: ${response.status}` };
  const data = await response.json() as {
    Abstract?: string;
    RelatedTopics?: Array<{ Text?: string }>;
  };
  const parts: string[] = [];
  if (data.Abstract) parts.push(data.Abstract);
  if (data.RelatedTopics) {
    for (const topic of data.RelatedTopics.slice(0, 5)) {
      if (topic.Text) parts.push(`- ${topic.Text}`);
    }
  }
  return { success: true, message: parts.join('\n') || 'No results found' };
}
```

Remove the old `searchWeb` private method body (the one calling duckduckgo.com directly).

**Step 4: Run tests**

```bash
npx vitest run src/lsp/editor-tools.test.ts
```

Expected: all passing including 2 new tests

**Step 5: Add Tavily key methods to `src/core/auth.ts`**

After `clearApiKey()`, add:

```typescript
private static readonly TAVILY_KEY = 'lucentCode.tavilyApiKey';

async getTavilyApiKey(): Promise<string | undefined> {
  return this.secretStorage.get(AuthManager.TAVILY_KEY);
}

async setTavilyApiKey(key: string): Promise<void> {
  await this.secretStorage.store(AuthManager.TAVILY_KEY, key);
  vscode.window.showInformationMessage('Tavily API key saved.');
}

async promptForTavilyApiKey(): Promise<void> {
  const key = await vscode.window.showInputBox({
    prompt: 'Enter your Tavily API key for premium web search',
    placeHolder: 'tvly-...',
    password: true,
    ignoreFocusOut: true,
  });
  if (key) await this.setTavilyApiKey(key);
}
```

**Step 6: Add command to `package.json`**

In `contributes.commands`, add:

```json
{
  "command": "lucentCode.setTavilyApiKey",
  "title": "Set Tavily API Key (Premium Web Search)",
  "category": "Lucent Code"
}
```

**Step 7: Wire in `src/extension.ts`**

Update the `EditorToolExecutor` instantiation to pass the Tavily key getter:

```typescript
const toolExecutor = new EditorToolExecutor(() => auth.getTavilyApiKey());
```

Register the command (inside `activate()`, alongside the other commands):

```typescript
context.subscriptions.push(
  vscode.commands.registerCommand('lucentCode.setTavilyApiKey', () => {
    auth.promptForTavilyApiKey();
  })
);
```

**Step 8: Run full test suite**

```bash
npx vitest run
```

Expected: all tests passing

**Step 9: Build**

```bash
npm run build
```

Expected: exit 0

**Step 10: Commit**

```bash
git add src/core/auth.ts src/lsp/editor-tools.ts src/lsp/editor-tools.test.ts package.json src/extension.ts
git commit -m "feat: add Tavily premium web search with DuckDuckGo fallback"
```

---

## Final verification

```bash
npx vitest run && npm run build
```

Expected: all tests pass, clean build.
