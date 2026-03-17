# V1 Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement three v1-blocking features: import conversations, type unification across the webview/extension boundary, and OAuth token management with status bar + server-side revocation.

**Architecture:** `ConversationHistory` gains `importFromJson()`; a Vite `@shared` alias lets the webview import types directly from `src/shared/types.ts`; `AuthManager` gains `isAuthenticated()` and `signOut()` (with best-effort API revocation); a status bar item in `extension.ts` reflects live auth state.

**Tech Stack:** TypeScript, VSCode Extension API, Solid.js, Vitest, Vite

---

### Task 1: Add `importFromJson` to `ConversationHistory`

**Files:**
- Modify: `src/chat/history.ts`
- Modify: `src/chat/history.test.ts`

**Step 1: Write the failing tests**

Add a new `describe('importFromJson', ...)` block at the bottom of `src/chat/history.test.ts` (inside the outer `describe('ConversationHistory', ...)`):

```ts
describe('importFromJson', () => {
  it('imports a valid conversation with a new ID', async () => {
    const source = JSON.stringify({
      id: 'conv-original-id',
      title: 'Imported Chat',
      model: 'gpt-4',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
      ],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    });

    const imported = await history.importFromJson(source);
    expect(imported.id).not.toBe('conv-original-id'); // new ID
    expect(imported.title).toBe('Imported Chat');
    expect(imported.model).toBe('gpt-4');
    expect(imported.messages).toHaveLength(2);

    // Verify it was saved to disk
    const loaded = await history.load(imported.id);
    expect(loaded).toBeDefined();
    expect(loaded!.title).toBe('Imported Chat');
  });

  it('throws on invalid JSON', async () => {
    await expect(history.importFromJson('not-json')).rejects.toThrow();
  });

  it('throws when title is missing', async () => {
    const json = JSON.stringify({
      id: 'x', model: 'gpt-4', messages: [],
      createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
    });
    await expect(history.importFromJson(json)).rejects.toThrow('Invalid conversation: missing title');
  });

  it('throws when model is missing', async () => {
    const json = JSON.stringify({
      id: 'x', title: 'Test', messages: [],
      createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
    });
    await expect(history.importFromJson(json)).rejects.toThrow('Invalid conversation: missing model');
  });

  it('throws when messages is not an array', async () => {
    const json = JSON.stringify({
      id: 'x', title: 'Test', model: 'gpt-4', messages: 'bad',
      createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
    });
    await expect(history.importFromJson(json)).rejects.toThrow('Invalid conversation: messages must be an array');
  });

  it('throws when a message has invalid role', async () => {
    const json = JSON.stringify({
      id: 'x', title: 'Test', model: 'gpt-4',
      messages: [{ role: 'system', content: 'bad' }],
      createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
    });
    await expect(history.importFromJson(json)).rejects.toThrow('Invalid conversation: message role must be user or assistant');
  });
});
```

**Step 2: Run to verify tests fail**

```
npx vitest run src/chat/history.test.ts
```

Expected: 5 new tests fail with "history.importFromJson is not a function".

**Step 3: Implement `importFromJson`**

Add this method to `ConversationHistory` in `src/chat/history.ts`, after `exportAsMarkdown`:

```ts
async importFromJson(json: string): Promise<Conversation> {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('Invalid JSON');
  }

  const raw = data as Record<string, unknown>;
  if (typeof raw.title !== 'string') throw new Error('Invalid conversation: missing title');
  if (typeof raw.model !== 'string') throw new Error('Invalid conversation: missing model');
  if (!Array.isArray(raw.messages)) throw new Error('Invalid conversation: messages must be an array');
  for (const msg of raw.messages as unknown[]) {
    const m = msg as Record<string, unknown>;
    if (m.role !== 'user' && m.role !== 'assistant') {
      throw new Error('Invalid conversation: message role must be user or assistant');
    }
  }

  const conversation: Conversation = {
    id: this.generateId(),
    title: raw.title as string,
    model: raw.model as string,
    messages: (raw.messages as Array<{ role: string; content: string }>).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: String(m.content ?? ''),
    })),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await this.save(conversation);
  return conversation;
}
```

**Step 4: Run tests**

```
npx vitest run src/chat/history.test.ts
```

Expected: all tests pass including the 5 new ones.

**Step 5: Run all tests**

```
npx vitest run
```

Expected: all 144 tests pass.

**Step 6: Commit**

```bash
git add src/chat/history.ts src/chat/history.test.ts
git commit -m "feat: add importFromJson to ConversationHistory"
```

---

### Task 2: Register `openRouterChat.importConversation` command

**Files:**
- Modify: `src/extension.ts`
- Modify: `package.json`

**Step 1: Add command to `package.json`**

In `package.json`, find the `contributes.commands` array. Add after `openRouterChat.setApiKey`:

```json
{
  "command": "openRouterChat.importConversation",
  "title": "Import Conversation",
  "category": "OpenRouter Chat"
}
```

**Step 2: Register the command in `extension.ts`**

In `src/extension.ts`, add the following after the `openRouterChat.newChat` command registration (around line 91):

```ts
context.subscriptions.push(
  vscode.commands.registerCommand('openRouterChat.importConversation', async () => {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { 'JSON': ['json'] },
      openLabel: 'Import Conversation',
    });
    if (!picked || picked.length === 0) return;

    try {
      const bytes = await vscode.workspace.fs.readFile(picked[0]);
      const json = new TextDecoder().decode(bytes);
      const imported = await history.importFromJson(json);
      vscode.window.showInformationMessage(`Conversation imported: "${imported.title}"`);
      // Refresh conversation list in webview if it's open
      const conversations = await history.list();
      chatProvider.postMessageToWebview({ type: 'conversationList', conversations });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Import failed: ${msg}`);
    }
  })
);
```

**Step 3: Run all tests**

```
npx vitest run
```

Expected: all tests pass (no unit tests for the command itself — it's a thin orchestration wrapper).

**Step 4: Commit**

```bash
git add src/extension.ts package.json
git commit -m "feat: add importConversation command to extension"
```

---

### Task 3: Type unification — Vite alias + tsconfig + webview store

**Files:**
- Modify: `webview/vite.config.ts`
- Modify: `webview/tsconfig.json`
- Modify: `webview/src/stores/chat.ts`

**Step 1: Add Vite path alias**

Replace the contents of `webview/vite.config.ts` with:

```ts
import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import path from 'path';

export default defineConfig({
  plugins: [solidPlugin()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../src/shared/types'),
    },
  },
  build: {
    outDir: '../dist/webview',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'index.js',
        assetFileNames: '[name][extname]',
      },
    },
  },
});
```

**Step 2: Add tsconfig paths and remove rootDir**

Replace `webview/tsconfig.json` with:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist",
    "paths": {
      "@shared": ["../src/shared/types"]
    }
  },
  "include": ["src/**/*"]
}
```

Note: `rootDir` is removed. Vite handles the build; `rootDir` only constrained tsc output structure.

**Step 3: Update `webview/src/stores/chat.ts`**

At the top of the file, replace the existing interface definitions with imports from `@shared`. The full updated top of the file:

```ts
import { createSignal, createRoot } from 'solid-js';
import { getVsCodeApi } from '../utils/vscode-api';
import type { DiffLine } from '../components/DiffView';
import type { ConversationSummary, OpenRouterModel, Conversation } from '@shared';
```

Delete these three interfaces from the file (they are now imported):
- `interface ChatMessage { ... }` — **keep this one** — it has `isStreaming?: boolean` which doesn't exist in the extension's `ChatMessage`
- `interface Model { ... }` — **delete this** — replaced by `OpenRouterModel`
- `interface ConversationSummary { ... }` — **delete this** — replaced by import

Replace all usages of `Model` with `OpenRouterModel` in `chat.ts`:
- `const [models, setModels] = createSignal<Model[]>([])` → `createSignal<OpenRouterModel[]>([])`
- `function handleModelsLoaded(modelList: Model[])` → `handleModelsLoaded(modelList: OpenRouterModel[])`
- Return type `models` is now `Accessor<OpenRouterModel[]>` (inferred)

Replace the inline type in `handleConversationLoaded` with `Conversation`:
```ts
function handleConversationLoaded(conversation: Conversation) {
  setCurrentConversationId(conversation.id);
  setMessages(conversation.messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })));
  setShowConversationList(false);
}
```

**Step 4: Build the webview**

```
npm run build
```

Expected: no errors, output in `dist/webview/`.

**Step 5: Run all extension tests**

```
npx vitest run
```

Expected: all 144 tests pass.

**Step 6: Commit**

```bash
git add webview/vite.config.ts webview/tsconfig.json webview/src/stores/chat.ts
git commit -m "refactor: unify ConversationSummary and Model types via @shared alias"
```

---

### Task 4: Add `isAuthenticated` and `signOut` to `AuthManager`

**Files:**
- Modify: `src/core/auth.ts`
- Modify: `src/core/auth.test.ts`

**Step 1: Write the failing tests**

Add a new `describe('isAuthenticated', ...)` and `describe('signOut', ...)` block in `src/core/auth.test.ts`.

The test file already has `mockWindow` with `showInformationMessage`. You also need to mock `fetch` for the revocation call. Add at the top of the test file (before `vi.mock('vscode', ...)`), inside a `vi.hoisted` block, add `mockFetch`:

```ts
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
```

Then after the `vi.mock('vscode', ...)` block, add:

```ts
vi.stubGlobal('fetch', mockFetch);
```

Now add the new tests at the bottom of `describe('AuthManager', ...)`:

```ts
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
```

**Step 2: Run to verify tests fail**

```
npx vitest run src/core/auth.test.ts
```

Expected: 6 new tests fail.

**Step 3: Implement the methods**

In `src/core/auth.ts`, add after `ensureAuthenticated()`:

```ts
async isAuthenticated(): Promise<boolean> {
  return !!(await this.getApiKey());
}

async signOut(): Promise<void> {
  const key = await this.getApiKey();
  if (!key) return;

  // Best-effort server-side revocation — don't block or throw on failure
  try {
    await fetch('https://openrouter.ai/api/v1/auth/key', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${key}` },
    });
  } catch { /* ignore network errors */ }

  await this.clearApiKey();
}
```

**Step 4: Run tests**

```
npx vitest run src/core/auth.test.ts
```

Expected: all tests pass including the 6 new ones.

**Step 5: Run all tests**

```
npx vitest run
```

Expected: all tests pass.

**Step 6: Commit**

```bash
git add src/core/auth.ts src/core/auth.test.ts
git commit -m "feat: add isAuthenticated and signOut (with server-side revocation) to AuthManager"
```

---

### Task 5: Status bar item + auth commands in `extension.ts`

**Files:**
- Modify: `src/extension.ts`
- Modify: `package.json`

**Step 1: Add new commands to `package.json`**

In the `contributes.commands` array, add:

```json
{
  "command": "openRouterChat.signOut",
  "title": "Sign Out",
  "category": "OpenRouter Chat"
},
{
  "command": "openRouterChat.authMenu",
  "title": "Manage Authentication",
  "category": "OpenRouter Chat"
}
```

**Step 2: Add status bar item and auth commands to `extension.ts`**

After the line `const notifications = new NotificationService();` and before the `messageHandler` construction, add the status bar setup:

```ts
// Auth status bar item
const authStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
authStatusBar.command = 'openRouterChat.authMenu';
context.subscriptions.push(authStatusBar);

const updateAuthStatus = async () => {
  const isAuthed = await auth.isAuthenticated();
  if (isAuthed) {
    authStatusBar.text = '$(key) OpenRouter';
    authStatusBar.tooltip = 'OpenRouter: Signed in — click to manage';
    authStatusBar.backgroundColor = undefined;
  } else {
    authStatusBar.text = '$(warning) OpenRouter: No API key';
    authStatusBar.tooltip = 'OpenRouter: Not signed in — click to set up';
    authStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }
  authStatusBar.show();
};

// Update status bar on auth changes
context.subscriptions.push(
  auth.onDidChangeAuth(() => updateAuthStatus())
);

// Set initial state
updateAuthStatus();
```

Then register the two new commands (add after the existing `openRouterChat.focusChat` command):

```ts
context.subscriptions.push(
  vscode.commands.registerCommand('openRouterChat.signOut', async () => {
    await auth.signOut();
    vscode.window.showInformationMessage('Signed out of OpenRouter.');
  })
);

context.subscriptions.push(
  vscode.commands.registerCommand('openRouterChat.authMenu', async () => {
    const isAuthed = await auth.isAuthenticated();
    const options = isAuthed
      ? ['Set API Key', 'Sign in with OAuth', 'Sign out']
      : ['Set API Key', 'Sign in with OAuth'];

    const choice = await vscode.window.showQuickPick(options, {
      placeHolder: isAuthed ? 'OpenRouter: Signed in' : 'OpenRouter: Not signed in',
    });

    if (choice === 'Set API Key') auth.promptForApiKey();
    else if (choice === 'Sign in with OAuth') auth.startOAuth();
    else if (choice === 'Sign out') {
      await auth.signOut();
      vscode.window.showInformationMessage('Signed out of OpenRouter.');
    }
  })
);
```

**Step 3: Run all tests**

```
npx vitest run
```

Expected: all tests pass.

**Step 4: Commit**

```bash
git add src/extension.ts package.json
git commit -m "feat: add auth status bar item and signOut/authMenu commands"
```

---

### Task 6: Update `docs/features.md`

**Files:**
- Modify: `docs/features.md`

**Step 1: Mark items as done**

Find the following entries and mark them ✅:

1. In the **Chat Panel** table: `Import conversations` → `✅ Import conversations`
2. In the **Authentication** table: `Token management` → `✅ Token management`
3. In the **Backlog — Suggestions** table: `Type duplication` → `✅ Type duplication`
4. In the **P2 Backlog** table: mark `Import conversations`, `OAuth token management`, and `Type duplication` as done

Update the test count from 144 to 150 (6 new tests: 5 import + 6 auth = 11, but some may already be counted — verify the actual count by running `npx vitest run` and checking the output).

**Step 2: Run final test suite**

```
npx vitest run
```

Note the exact test count and update `features.md` with the correct number.

**Step 3: Commit**

```bash
git add docs/features.md
git commit -m "docs: mark v1 features as implemented in features.md"
```
