# Phase 4 — Auth & Persistence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist chat conversations to disk so they survive restarts, with export/import support, auto-titling, and a conversation list sidebar. Add OAuth as an alternative auth method.

**Architecture:** A `ConversationHistory` module manages conversations as JSON files in VSCode's `globalStorageUri`. Each conversation has an id, title, model, messages, and timestamps. The webview gets new message types for listing, loading, saving, and exporting conversations. A conversation list panel replaces the empty state when conversations exist. Auto-titling sends a lightweight LLM call after the first exchange. OAuth uses OpenRouter's PKCE flow with a local redirect URI.

**Tech Stack:** TypeScript, VSCode globalStorageUri, existing OpenRouterClient, Solid.js webview

---

### Task 1: Conversation Types and Message Protocol

**Files:**
- Modify: `src/shared/types.ts`

**Step 1: Add conversation types**

Add at the bottom of `src/shared/types.ts`:

```typescript
// ---- Conversations ----

export interface Conversation {
  id: string;
  title: string;
  model: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  model: string;
  messageCount: number;
  updatedAt: string;
}
```

Update `ExtensionMessage` to add conversation-related messages:

```typescript
export type ExtensionMessage =
  | { type: 'streamChunk'; content: string }
  | { type: 'streamEnd'; usage?: ChatResponse['usage'] }
  | { type: 'streamError'; error: string }
  | { type: 'modelsLoaded'; models: OpenRouterModel[] }
  | { type: 'modelChanged'; modelId: string }
  | { type: 'contextUpdate'; context: CodeContext }
  | { type: 'conversationList'; conversations: ConversationSummary[] }
  | { type: 'conversationLoaded'; conversation: Conversation }
  | { type: 'conversationSaved'; id: string; title: string }
  | { type: 'conversationTitled'; id: string; title: string };
```

Update `WebviewMessage` to add conversation-related messages:

```typescript
export type WebviewMessage =
  | { type: 'sendMessage'; content: string; model: string }
  | { type: 'cancelRequest' }
  | { type: 'getModels' }
  | { type: 'setModel'; modelId: string }
  | { type: 'newChat' }
  | { type: 'ready' }
  | { type: 'listConversations' }
  | { type: 'loadConversation'; id: string }
  | { type: 'deleteConversation'; id: string }
  | { type: 'exportConversation'; id: string; format: 'json' | 'markdown' };
```

**Step 2: Build to verify**

Run: `node esbuild.config.mjs`

**Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add conversation and persistence types to message protocol"
```

---

### Task 2: Conversation History Module

**Files:**
- Create: `src/chat/history.ts`
- Create: `src/chat/history.test.ts`

**Step 1: Write the test file**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';

vi.mock('vscode', () => ({
  Uri: {
    file: (p: string) => ({ fsPath: p, toString: () => `file://${p}` }),
    joinPath: (base: any, ...segments: string[]) => ({
      fsPath: path.join(base.fsPath, ...segments),
      toString: () => `file://${path.join(base.fsPath, ...segments)}`,
    }),
  },
}));

import { ConversationHistory } from './history';
import type { Conversation } from '../shared/types';

describe('ConversationHistory', () => {
  let history: ConversationHistory;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = path.join(__dirname, '../../.test-conversations-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });
    const storageUri = { fsPath: tmpDir, toString: () => `file://${tmpDir}` };
    history = new ConversationHistory(storageUri as any);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create a new conversation', async () => {
    const conv = await history.create('test-model');
    expect(conv.id).toBeDefined();
    expect(conv.model).toBe('test-model');
    expect(conv.messages).toHaveLength(0);
    expect(conv.title).toBe('New conversation');
  });

  it('should save and load a conversation', async () => {
    const conv = await history.create('test-model');
    conv.messages.push({ role: 'user', content: 'Hello' });
    conv.title = 'Test Chat';
    await history.save(conv);

    const loaded = await history.load(conv.id);
    expect(loaded).toBeDefined();
    expect(loaded!.title).toBe('Test Chat');
    expect(loaded!.messages).toHaveLength(1);
  });

  it('should list all conversations as summaries', async () => {
    await history.create('model-1');
    await history.create('model-2');

    const list = await history.list();
    expect(list).toHaveLength(2);
    expect(list[0].model).toBeDefined();
    expect(list[0].messageCount).toBe(0);
  });

  it('should delete a conversation', async () => {
    const conv = await history.create('test-model');
    await history.delete(conv.id);

    const loaded = await history.load(conv.id);
    expect(loaded).toBeUndefined();
  });

  it('should export as JSON', async () => {
    const conv = await history.create('test-model');
    conv.messages.push({ role: 'user', content: 'Hello' });
    await history.save(conv);

    const json = await history.exportAsJson(conv.id);
    expect(json).toBeDefined();
    const parsed = JSON.parse(json!);
    expect(parsed.messages).toHaveLength(1);
  });

  it('should export as Markdown', async () => {
    const conv = await history.create('test-model');
    conv.messages.push(
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' }
    );
    conv.title = 'Test Chat';
    await history.save(conv);

    const md = await history.exportAsMarkdown(conv.id);
    expect(md).toBeDefined();
    expect(md).toContain('# Test Chat');
    expect(md).toContain('**User:**');
    expect(md).toContain('**Assistant:**');
  });

  it('should return undefined for non-existent conversation', async () => {
    const loaded = await history.load('non-existent');
    expect(loaded).toBeUndefined();
  });

  it('should sort list by updatedAt descending', async () => {
    const conv1 = await history.create('model');
    // Small delay to ensure different timestamps
    await new Promise((r) => setTimeout(r, 10));
    const conv2 = await history.create('model');

    const list = await history.list();
    expect(list[0].id).toBe(conv2.id);
  });
});
```

**Step 2: Write the implementation**

```typescript
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { Conversation, ConversationSummary, ChatMessage } from '../shared/types';

export class ConversationHistory {
  private readonly conversationsDir: string;

  constructor(storageUri: vscode.Uri) {
    this.conversationsDir = path.join(storageUri.fsPath, 'conversations');
    if (!fs.existsSync(this.conversationsDir)) {
      fs.mkdirSync(this.conversationsDir, { recursive: true });
    }
  }

  async create(model: string): Promise<Conversation> {
    const conversation: Conversation = {
      id: this.generateId(),
      title: 'New conversation',
      model,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.save(conversation);
    return conversation;
  }

  async save(conversation: Conversation): Promise<void> {
    conversation.updatedAt = new Date().toISOString();
    const filePath = this.getFilePath(conversation.id);
    fs.writeFileSync(filePath, JSON.stringify(conversation, null, 2), 'utf-8');
  }

  async load(id: string): Promise<Conversation | undefined> {
    const filePath = this.getFilePath(id);
    if (!fs.existsSync(filePath)) return undefined;

    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data) as Conversation;
    } catch {
      return undefined;
    }
  }

  async list(): Promise<ConversationSummary[]> {
    if (!fs.existsSync(this.conversationsDir)) return [];

    const files = fs.readdirSync(this.conversationsDir).filter((f) => f.endsWith('.json'));
    const summaries: ConversationSummary[] = [];

    for (const file of files) {
      try {
        const data = fs.readFileSync(path.join(this.conversationsDir, file), 'utf-8');
        const conv = JSON.parse(data) as Conversation;
        summaries.push({
          id: conv.id,
          title: conv.title,
          model: conv.model,
          messageCount: conv.messages.length,
          updatedAt: conv.updatedAt,
        });
      } catch {
        // Skip corrupted files
      }
    }

    return summaries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async delete(id: string): Promise<void> {
    const filePath = this.getFilePath(id);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  async exportAsJson(id: string): Promise<string | undefined> {
    const conv = await this.load(id);
    if (!conv) return undefined;
    return JSON.stringify(conv, null, 2);
  }

  async exportAsMarkdown(id: string): Promise<string | undefined> {
    const conv = await this.load(id);
    if (!conv) return undefined;

    const parts: string[] = [];
    parts.push(`# ${conv.title}`);
    parts.push(`\n*Model: ${conv.model} | ${new Date(conv.createdAt).toLocaleString()}*\n`);

    for (const msg of conv.messages) {
      if (msg.role === 'user') {
        parts.push(`\n**User:**\n\n${msg.content}\n`);
      } else if (msg.role === 'assistant') {
        parts.push(`\n**Assistant:**\n\n${msg.content}\n`);
      }
    }

    return parts.join('\n');
  }

  private getFilePath(id: string): string {
    return path.join(this.conversationsDir, `${id}.json`);
  }

  private generateId(): string {
    return `conv-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }
}
```

**Step 3: Run tests and build**

Run: `npx vitest run src/chat/history.test.ts`
Expected: All 8 tests pass

Run: `node esbuild.config.mjs`

**Step 4: Commit**

```bash
git add src/chat/history.ts src/chat/history.test.ts
git commit -m "feat: add ConversationHistory with save, load, list, delete, and export"
```

---

### Task 3: Integrate History into MessageHandler

**Files:**
- Modify: `src/chat/message-handler.ts`

**Step 1: Update MessageHandler to use ConversationHistory**

Add import:
```typescript
import { ConversationHistory } from './history';
import type { Conversation } from '../shared/types';
```

Update constructor to accept history and client (for auto-titling):
```typescript
private currentConversation?: Conversation;

constructor(
  private readonly client: OpenRouterClient,
  private readonly contextBuilder: ContextBuilder,
  private readonly settings: Settings,
  private readonly toolExecutor?: EditorToolExecutor,
  private readonly history?: ConversationHistory
) {}
```

Add new message handlers in the switch statement:
```typescript
case 'listConversations':
  await this.handleListConversations(postMessage);
  break;
case 'loadConversation':
  await this.handleLoadConversation(message.id, postMessage);
  break;
case 'deleteConversation':
  await this.handleDeleteConversation(message.id, postMessage);
  break;
case 'exportConversation':
  await this.handleExportConversation(message.id, message.format, postMessage);
  break;
```

Update `newChat` to create a new conversation:
```typescript
case 'newChat':
  this.conversationMessages = [];
  this.currentConversation = undefined;
  break;
```

Update `handleSendMessage` to save after each exchange:
- After pushing the assistant message, if `this.history` is available:
  - If no `currentConversation`, create one
  - Update `currentConversation.messages` from `conversationMessages`
  - Save the conversation
  - If it's the first user message (messages.length === 2), auto-title it

Add the new handler methods:
```typescript
private async handleListConversations(postMessage: (msg: ExtensionMessage) => void): Promise<void> {
  if (!this.history) return;
  const conversations = await this.history.list();
  postMessage({ type: 'conversationList', conversations });
}

private async handleLoadConversation(id: string, postMessage: (msg: ExtensionMessage) => void): Promise<void> {
  if (!this.history) return;
  const conversation = await this.history.load(id);
  if (conversation) {
    this.currentConversation = conversation;
    this.conversationMessages = [...conversation.messages];
    postMessage({ type: 'conversationLoaded', conversation });
  }
}

private async handleDeleteConversation(id: string, postMessage: (msg: ExtensionMessage) => void): Promise<void> {
  if (!this.history) return;
  await this.history.delete(id);
  await this.handleListConversations(postMessage);
}

private async handleExportConversation(id: string, format: 'json' | 'markdown', postMessage: (msg: ExtensionMessage) => void): Promise<void> {
  if (!this.history) return;
  const content = format === 'json'
    ? await this.history.exportAsJson(id)
    : await this.history.exportAsMarkdown(id);

  if (content) {
    const doc = await vscode.workspace.openTextDocument({ content, language: format === 'json' ? 'json' : 'markdown' });
    await vscode.window.showTextDocument(doc);
  }
}

private async autoTitle(conversation: Conversation): Promise<void> {
  try {
    const response = await this.client.chat({
      model: conversation.model,
      messages: [
        { role: 'system', content: 'Generate a short title (3-6 words) for this conversation. Output only the title, nothing else.' },
        ...conversation.messages.slice(0, 2),
      ],
      temperature: 0.3,
      max_tokens: 20,
    });

    const title = response.choices[0]?.message?.content?.trim();
    if (title && this.history) {
      conversation.title = title;
      await this.history.save(conversation);
    }
  } catch {
    // Silently fail — title stays as default
  }
}
```

At the end of `handleSendMessage`, after pushing the assistant message and before `postMessage({ type: 'streamEnd' })`, add:

```typescript
// Persist conversation
if (this.history) {
  if (!this.currentConversation) {
    this.currentConversation = await this.history.create(model);
  }
  this.currentConversation.messages = [...this.conversationMessages];
  await this.history.save(this.currentConversation);
  postMessage({ type: 'conversationSaved', id: this.currentConversation.id, title: this.currentConversation.title });

  // Auto-title after first exchange
  if (this.conversationMessages.length === 2) {
    this.autoTitle(this.currentConversation).then(() => {
      if (this.currentConversation) {
        postMessage({ type: 'conversationTitled', id: this.currentConversation.id, title: this.currentConversation.title });
      }
    });
  }
}
```

**Step 2: Update message-handler tests**

Add the `history` parameter as `undefined` to existing test mock constructors so they don't break. Add new tests for `listConversations`, `loadConversation`, `deleteConversation`.

**Step 3: Run tests and build**

Run: `npx vitest run`
Run: `node esbuild.config.mjs`

**Step 4: Commit**

```bash
git add src/chat/message-handler.ts src/chat/message-handler.test.ts
git commit -m "feat: integrate conversation history into MessageHandler with auto-titling"
```

---

### Task 4: Webview — Conversation List & Persistence UI

**Files:**
- Modify: `webview/src/stores/chat.ts` — add conversation state and handlers
- Create: `webview/src/components/ConversationList.tsx`
- Modify: `webview/src/App.tsx` — add conversation list to sidebar
- Modify: `webview/src/styles.css` — add conversation list styles

**Step 1: Update chat store**

Add to `webview/src/stores/chat.ts`:

```typescript
export interface ConversationSummary {
  id: string;
  title: string;
  model: string;
  messageCount: number;
  updatedAt: string;
}

// Add signals:
const [conversations, setConversations] = createSignal<ConversationSummary[]>([]);
const [currentConversationId, setCurrentConversationId] = createSignal<string>('');
const [showConversationList, setShowConversationList] = createSignal(false);

// Add handlers:
function handleConversationList(list: ConversationSummary[]) {
  setConversations(list);
}

function handleConversationLoaded(conversation: { id: string; title: string; messages: Array<{ role: string; content: string }> }) {
  setCurrentConversationId(conversation.id);
  setMessages(conversation.messages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  })));
  setShowConversationList(false);
}

function handleConversationSaved(id: string) {
  setCurrentConversationId(id);
}

function handleConversationTitled(id: string, title: string) {
  setConversations((prev) => prev.map((c) => c.id === id ? { ...c, title } : c));
}

function loadConversation(id: string) {
  vscode.postMessage({ type: 'loadConversation', id });
}

function deleteConversation(id: string) {
  vscode.postMessage({ type: 'deleteConversation', id });
}

function exportConversation(id: string, format: 'json' | 'markdown') {
  vscode.postMessage({ type: 'exportConversation', id, format });
}

function toggleConversationList() {
  if (!showConversationList()) {
    vscode.postMessage({ type: 'listConversations' });
  }
  setShowConversationList(!showConversationList());
}

// Update newChat:
function newChat() {
  setMessages([]);
  setCurrentConversationId('');
  vscode.postMessage({ type: 'newChat' });
}

// Add to return object:
conversations, currentConversationId, showConversationList,
handleConversationList, handleConversationLoaded, handleConversationSaved, handleConversationTitled,
loadConversation, deleteConversation, exportConversation, toggleConversationList,
```

**Step 2: Create ConversationList component**

`webview/src/components/ConversationList.tsx`:
```tsx
import { Component, For, Show } from 'solid-js';
import type { ConversationSummary } from '../stores/chat';

interface ConversationListProps {
  conversations: ConversationSummary[];
  currentId: string;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string, format: 'json' | 'markdown') => void;
}

const ConversationList: Component<ConversationListProps> = (props) => {
  return (
    <div class="conversation-list">
      <div class="conversation-list-header">Conversations</div>
      <Show when={props.conversations.length > 0} fallback={
        <div class="conversation-list-empty">No saved conversations</div>
      }>
        <For each={props.conversations}>
          {(conv) => (
            <div class={`conversation-item ${conv.id === props.currentId ? 'active' : ''}`}>
              <button class="conversation-item-main" onClick={() => props.onLoad(conv.id)}>
                <div class="conversation-title">{conv.title}</div>
                <div class="conversation-meta">
                  {conv.messageCount} messages &middot; {new Date(conv.updatedAt).toLocaleDateString()}
                </div>
              </button>
              <div class="conversation-actions">
                <button onClick={() => props.onExport(conv.id, 'markdown')} title="Export as Markdown">MD</button>
                <button onClick={() => props.onExport(conv.id, 'json')} title="Export as JSON">JS</button>
                <button onClick={() => props.onDelete(conv.id)} title="Delete" class="delete-btn">X</button>
              </div>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
};

export default ConversationList;
```

**Step 3: Update App.tsx**

Add import for ConversationList. Add a history toggle button to the toolbar (between model selector and + button). Show ConversationList when `showConversationList()` is true. Add message handlers for the new conversation messages in the `window.addEventListener('message', ...)` callback.

**Step 4: Add styles**

Add conversation list styles to `webview/src/styles.css`.

**Step 5: Build webview**

Run: `cd webview && npx vite build`

**Step 6: Commit**

```bash
git add webview/src/
git commit -m "feat: add conversation list UI with load, delete, and export actions"
```

---

### Task 5: Wire History into Extension Entry Point

**Files:**
- Modify: `src/extension.ts`

**Step 1: Update extension.ts**

Add import:
```typescript
import { ConversationHistory } from './chat/history';
```

In `activate()`, after creating `contextBuilder`:
```typescript
// Initialize conversation history
const history = new ConversationHistory(context.globalStorageUri);
```

Update MessageHandler constructor:
```typescript
const messageHandler = new MessageHandler(client, contextBuilder, settings, toolExecutor, history);
```

**Step 2: Build and test**

Run: `npx vitest run && node esbuild.config.mjs`

**Step 3: Commit**

```bash
git add src/extension.ts
git commit -m "feat: wire ConversationHistory into extension using globalStorageUri"
```

---

### Task 6: OAuth Authentication (Structure)

**Files:**
- Modify: `src/core/auth.ts` — add OAuth methods
- Modify: `src/core/auth.test.ts` — add OAuth tests

**Step 1: Add OAuth support to AuthManager**

Add to `src/core/auth.ts`:

```typescript
async startOAuth(): Promise<string | undefined> {
  const callbackUri = await vscode.env.asExternalUri(
    vscode.Uri.parse('vscode://openrouter-chat/oauth-callback')
  );

  const codeVerifier = this.generateCodeVerifier();
  const state = this.generateState();

  const authUrl = `https://openrouter.ai/auth?callback_url=${encodeURIComponent(callbackUri.toString())}&code_challenge=${codeVerifier}&state=${state}`;

  await vscode.env.openExternal(vscode.Uri.parse(authUrl));

  // Return the state for verification when callback arrives
  return state;
}

private generateCodeVerifier(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  for (let i = 0; i < 64; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

private generateState(): string {
  return Math.random().toString(36).substring(2, 15);
}
```

**Step 2: Add test**

```typescript
it('should generate OAuth state', async () => {
  // Just verify the method exists and returns a string
  const state = auth['generateState']();
  expect(typeof state).toBe('string');
  expect(state.length).toBeGreaterThan(0);
});
```

**Step 3: Run tests and build**

Run: `npx vitest run && node esbuild.config.mjs`

**Step 4: Commit**

```bash
git add src/core/auth.ts src/core/auth.test.ts
git commit -m "feat: add OAuth PKCE flow structure to AuthManager"
```

---

### Task 7: Update Features, README & Final Tests

**Files:**
- Modify: `docs/features.md`
- Modify: `README.md`

**Step 1: Run full test suite**

Run: `npx vitest run`
Run: `npm run build`

**Step 2: Update features.md — mark Phase 4 items as complete**

**Step 3: Update README — add persistence section to features, update test counts and roadmap**

**Step 4: Commit**

```bash
git add docs/features.md README.md
git commit -m "docs: mark Phase 4 features as complete, update README"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Conversation types + message protocol | `src/shared/types.ts` |
| 2 | ConversationHistory module | `src/chat/history.ts` + test |
| 3 | Integrate history into MessageHandler | `src/chat/message-handler.ts` + test |
| 4 | Webview conversation list UI | `webview/src/` (store, component, App, styles) |
| 5 | Wire history into extension | `src/extension.ts` |
| 6 | OAuth structure | `src/core/auth.ts` + test |
| 7 | Update docs & final tests | `docs/features.md`, `README.md` |
