# Credits Awareness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show per-message cost on hover, session total in a consolidated status bar, account balance from OpenRouter API, and gracefully disable the chat when credits run out.

**Architecture:** Extension tracks session cost from stream `usage` data and polls `/api/v1/auth/key` for account balance. Sends `usageUpdate` to webview after each message. Status bar is consolidated into one clickable item. Webview disables input and shows a banner when no credits remain.

**Tech Stack:** TypeScript (extension), SolidJS (webview), VS Code status bar API, OpenRouter `/api/v1/auth/key` endpoint.

---

### Task 1: Add `usage` to `ChatResponseChunk` and `usageUpdate` message type

**Files:**
- Modify: `src/shared/types.ts`

**Step 1: Add `usage` to `ChatResponseChunk`**

In `src/shared/types.ts`, the `ChatResponseChunk` interface (line 55) is missing `usage`. Add it:

```ts
export interface ChatResponseChunk {
  id: string;
  choices: Array<{
    delta: {
      content?: string;
      role?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
```

**Step 2: Add `usageUpdate` to `ExtensionMessage` union**

In `src/shared/types.ts`, add to the `ExtensionMessage` union (after line 110):

```ts
| { type: 'usageUpdate'; lastMessageCost: number; lastMessageTokens: number; sessionCost: number; creditsUsed: number; creditsLimit: number | null }
| { type: 'noCredits' }
```

**Step 3: Verify build passes**

Run: `npm run build:ext`
Expected: `Build complete.` with no errors.

**Step 4: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(credits): add usage types and usageUpdate message"
```

---

### Task 2: Track session cost and fetch account balance in `MessageHandler`

**Files:**
- Modify: `src/chat/message-handler.ts`
- Modify: `src/core/openrouter-client.ts`

**Step 1: Add account balance fetch to `OpenRouterClient`**

In `src/core/openrouter-client.ts`, add this method before the closing `}` of the class:

```ts
async getAccountBalance(): Promise<{ usage: number; limit: number | null }> {
  const headers = await this.headers();
  const response = await fetch('https://openrouter.ai/api/v1/auth/key', { headers });
  if (!response.ok) return { usage: 0, limit: null };
  const data = await response.json() as { data?: { usage?: number; limit?: number | null } };
  return {
    usage: data.data?.usage ?? 0,
    limit: data.data?.limit ?? null,
  };
}
```

**Step 2: Add session cost tracking to `MessageHandler`**

In `src/chat/message-handler.ts`, add a `sessionCost` property to the class (near the top with other private fields):

```ts
private sessionCost = 0;
```

**Step 3: Capture `usage` from the final stream chunk**

In `src/chat/message-handler.ts`, in the `for await (const chunk of stream)` loop (around line 262), add usage capture:

```ts
let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;

for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta;
  if (delta?.content) {
    fullContent += delta.content;
    postMessage({ type: 'streamChunk', content: delta.content });
  }
  if (delta?.tool_calls) { /* ... existing tool_calls handling ... */ }
  if (chunk.usage) usage = chunk.usage;
  finishReason = chunk.choices[0]?.finish_reason ?? finishReason;
}
```

**Step 4: Calculate cost and send `usageUpdate` after each stream**

After the stream loop completes (before the tool_calls check, around line 282), calculate cost and send it. You'll need to pass the model pricing to the handler. The `model` string is available; the pricing comes from the models list. Add a `private modelPricing = new Map<string, { prompt: string; completion: string }>()` field to the class, and a `setModelPricing` method:

```ts
private modelPricing = new Map<string, { prompt: string; completion: string }>();

setModelPricing(models: import('../shared/types').OpenRouterModel[]): void {
  for (const m of models) {
    this.modelPricing.set(m.id, m.pricing);
  }
}
```

Then after the stream loop, before checking `finishReason`:

```ts
if (usage) {
  const pricing = this.modelPricing.get(model);
  const promptCost = pricing ? usage.prompt_tokens * parseFloat(pricing.prompt) : 0;
  const completionCost = pricing ? usage.completion_tokens * parseFloat(pricing.completion) : 0;
  const lastMessageCost = promptCost + completionCost;
  this.sessionCost += lastMessageCost;

  let creditsUsed = 0;
  let creditsLimit: number | null = null;
  try {
    const balance = await this.client.getAccountBalance();
    creditsUsed = balance.usage;
    creditsLimit = balance.limit;
  } catch { /* non-fatal */ }

  postMessage({
    type: 'usageUpdate',
    lastMessageCost,
    lastMessageTokens: usage.total_tokens,
    sessionCost: this.sessionCost,
    creditsUsed,
    creditsLimit,
  });

  if (creditsLimit !== null && creditsUsed >= creditsLimit) {
    postMessage({ type: 'noCredits' });
  }
}
```

**Step 5: Call `setModelPricing` when models are loaded**

In `src/chat/message-handler.ts`, in `handleGetModels` (around line 439):

```ts
private async handleGetModels(postMessage: (msg: ExtensionMessage) => void): Promise<void> {
  try {
    const models = await this.client.listModels();
    this.setModelPricing(models);           // <-- add this line
    postMessage({ type: 'modelsLoaded', models });
  } catch (error) {
    ...
  }
}
```

**Step 6: Handle 402 → send `noCredits`**

In `src/chat/message-handler.ts`, in the catch block (around line 414):

```ts
} catch (error) {
  if (error instanceof Error && error.name === 'AbortError') {
    postMessage({ type: 'streamEnd' });
  } else {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage.includes('402') || errorMessage.toLowerCase().includes('insufficient credits')) {
      postMessage({ type: 'noCredits' });
      postMessage({ type: 'streamEnd' });
    } else {
      postMessage({ type: 'streamError', error: errorMessage });
      ...
    }
  }
}
```

**Step 7: Verify build passes**

Run: `npm run build:ext`
Expected: `Build complete.`

**Step 8: Commit**

```bash
git add src/chat/message-handler.ts src/core/openrouter-client.ts
git commit -m "feat(credits): track session cost and fetch account balance"
```

---

### Task 3: Consolidate status bar into one item with cost display

**Files:**
- Modify: `src/extension.ts`

**Step 1: Remove the second "OpenRouter" status bar item and consolidate**

In `src/extension.ts`, there are two status bar items for OpenRouter (lines ~170 and ~200 — `authStatusBar` and `skillsStatusBar`). Keep only `authStatusBar`, rename it to `openRouterStatusBar`, and update `updateAuthStatus` to accept an optional session cost:

Replace the auth status bar section with:

```ts
// OpenRouter status bar (consolidated)
const openRouterStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
openRouterStatusBar.command = 'lucentCode.authMenu';
context.subscriptions.push(openRouterStatusBar);

let currentSessionCost = 0;
let hasNoCredits = false;

const updateOpenRouterStatus = async () => {
  const isAuthed = await auth.isAuthenticated();
  if (hasNoCredits) {
    openRouterStatusBar.text = '$(warning) OpenRouter: No credits';
    openRouterStatusBar.tooltip = 'No credits remaining — click to manage';
    openRouterStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  } else if (isAuthed) {
    const costStr = currentSessionCost > 0 ? ` · $${currentSessionCost.toFixed(4)}` : '';
    openRouterStatusBar.text = `$(key) OpenRouter${costStr}`;
    openRouterStatusBar.tooltip = 'OpenRouter: Signed in — click to manage';
    openRouterStatusBar.backgroundColor = undefined;
  } else {
    openRouterStatusBar.text = '$(warning) OpenRouter: Not signed in';
    openRouterStatusBar.tooltip = 'OpenRouter: Not signed in — click to sign in';
    openRouterStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }
  openRouterStatusBar.show();
};
```

**Step 2: Update auth change handler to use new function name**

```ts
context.subscriptions.push(
  auth.onDidChangeAuth(() => {
    hasNoCredits = false;
    updateOpenRouterStatus();
    handler.handleMessage({ type: 'getModels' }, (msg) => chatProvider.postMessageToWebview(msg));
  })
);
void updateOpenRouterStatus();
```

**Step 3: Update `authMenu` command to show balance info**

In the `lucentCode.authMenu` command handler, enhance the QuickPick to show credits and session cost. Replace the existing `authMenu` handler:

```ts
vscode.commands.registerCommand('lucentCode.authMenu', async () => {
  const isAuthed = await auth.isAuthenticated();

  let balanceInfo = '';
  if (isAuthed) {
    try {
      const balance = await openRouterClient.getAccountBalance();
      if (balance.limit !== null) {
        const remaining = Math.max(0, balance.limit - balance.usage);
        balanceInfo = `$${remaining.toFixed(4)} remaining`;
      } else {
        balanceInfo = 'No credit limit set';
      }
    } catch { balanceInfo = 'Could not fetch balance'; }
  }

  const sessionStr = currentSessionCost > 0 ? `Session: $${currentSessionCost.toFixed(4)}` : 'Session: $0.0000';

  const items: vscode.QuickPickItem[] = isAuthed
    ? [
        { label: '$(key) Signed in', description: balanceInfo, kind: vscode.QuickPickItemKind.Default },
        { label: sessionStr, kind: vscode.QuickPickItemKind.Default },
        { label: '', kind: vscode.QuickPickItemKind.Separator },
        { label: '$(globe) Buy credits', description: 'openrouter.ai/settings/credits' },
        { label: '$(sign-out) Sign out' },
        { label: '$(edit) Set API key manually' },
      ]
    : [
        { label: '$(sign-in) Sign in with OpenRouter (OAuth)' },
        { label: '$(edit) Set API key manually' },
      ];

  const choice = await vscode.window.showQuickPick(items, {
    placeHolder: isAuthed ? 'OpenRouter account' : 'OpenRouter: Not signed in',
  });

  if (!choice) return;
  if (choice.label.includes('Sign in')) auth.startOAuth();
  else if (choice.label.includes('Set API key')) auth.promptForApiKey();
  else if (choice.label.includes('Sign out')) {
    await auth.signOut();
    vscode.window.showInformationMessage('Signed out of OpenRouter.');
  } else if (choice.label.includes('Buy credits')) {
    vscode.env.openExternal(vscode.Uri.parse('https://openrouter.ai/settings/credits'));
  }
})
```

**Step 4: Handle `usageUpdate` and `noCredits` from webview message loop**

In the `webview.onDidReceiveMessage` handler (around line 236 in `src/extension.ts`), the handler dispatches all messages to `handler.handleMessage`. But `usageUpdate` and `noCredits` come FROM the extension TO the webview, not the other way. What we need instead is: after `handler.handleMessage` processes a `sendMessage`, the extension needs to update the status bar.

The simplest approach: expose an `onUsageUpdate` callback on `MessageHandler`, or just update the status bar inside the existing `auth.onDidChangeAuth` flow.

Actually the cleaner approach: in `extension.ts`, wrap the `postMessage` function passed to `handler.handleMessage` to intercept `usageUpdate` and `noCredits`:

```ts
webview.onDidReceiveMessage(async (message: WebviewMessage) => {
  const postMessage = (msg: ExtensionMessage) => {
    // Intercept usage updates to update status bar
    if (msg.type === 'usageUpdate') {
      currentSessionCost = msg.sessionCost;
      void updateOpenRouterStatus();
    }
    if (msg.type === 'noCredits') {
      hasNoCredits = true;
      void updateOpenRouterStatus();
    }
    chatProvider.postMessageToWebview(msg);
  };
  await handler.handleMessage(message, postMessage);
});
```

**Step 5: Verify build passes**

Run: `npm run build:ext`
Expected: `Build complete.`

**Step 6: Commit**

```bash
git add src/extension.ts
git commit -m "feat(credits): consolidate status bar, show session cost, credits menu"
```

---

### Task 4: Handle `usageUpdate` and `noCredits` in webview store

**Files:**
- Modify: `webview/src/stores/chat.ts`
- Modify: `src/shared/types.ts` (ChatMessage interface)

**Step 1: Add `cost` and `tokens` to the webview `ChatMessage` type**

In `webview/src/stores/chat.ts`, the local `ChatMessage` interface (at the top) needs cost fields. Find the interface and add:

```ts
interface ChatMessage {
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'error';
  content: string;
  images?: string[];
  isStreaming?: boolean;
  toolName?: string;
  toolArgs?: string;
  toolResult?: string;
  diff?: DiffLine[];
  cost?: number;      // <-- add
  tokens?: number;    // <-- add
}
```

**Step 2: Add `noCredits` signal to the store**

In `webview/src/stores/chat.ts`, add a signal near the other signals:

```ts
const [noCredits, setNoCredits] = createSignal(false);
```

**Step 3: Handle `usageUpdate` message — attach cost/tokens to last assistant message**

Add `handleUsageUpdate` function:

```ts
function handleUsageUpdate(lastMessageCost: number, lastMessageTokens: number) {
  setMessages((prev) => {
    const updated = [...prev];
    // Find the last assistant message and attach cost
    for (let i = updated.length - 1; i >= 0; i--) {
      if (updated[i].role === 'assistant') {
        updated[i] = { ...updated[i], cost: lastMessageCost, tokens: lastMessageTokens };
        break;
      }
    }
    return updated;
  });
}
```

**Step 4: Handle `noCredits` message**

```ts
function handleNoCredits() {
  setNoCredits(true);
}
```

Reset on new chat:

```ts
function newChat() {
  setMessages([]);
  setCurrentConversationId('');
  setShowConversationList(false);
  setNoCredits(false);   // <-- add
  vscode.postMessage({ type: 'newChat' });
}
```

**Step 5: Export new state and handlers**

Add to the return object of `createChatStore`:
```ts
noCredits,
handleUsageUpdate,
handleNoCredits,
```

**Step 6: Wire up in `App.tsx`**

In `webview/src/App.tsx`, in the `window.addEventListener('message', ...)` switch:

```ts
case 'usageUpdate':
  chatStore.handleUsageUpdate(message.lastMessageCost, message.lastMessageTokens);
  break;
case 'noCredits':
  chatStore.handleNoCredits();
  break;
```

**Step 7: Verify build passes**

Run: `npm run build`
Expected: builds without errors.

**Step 8: Commit**

```bash
git add webview/src/stores/chat.ts webview/src/App.tsx
git commit -m "feat(credits): handle usageUpdate and noCredits in webview store"
```

---

### Task 5: Per-message cost tooltip on hover

**Files:**
- Modify: `webview/src/components/ChatMessage.tsx`
- Modify: `webview/src/styles.css`

**Step 1: Add cost display to assistant messages**

In `webview/src/components/ChatMessage.tsx`, find where the message content is rendered (around line 78). After the streaming cursor `Show`, add:

```tsx
<Show when={props.message.role === 'assistant' && props.message.cost !== undefined}>
  <div class="message-cost">
    · ${props.message.cost!.toFixed(4)} · {props.message.tokens?.toLocaleString()} tokens
  </div>
</Show>
```

**Step 2: Add hover CSS**

In `webview/src/styles.css`, add after the `.cursor-blink` block:

```css
.message-cost {
  font-size: 10px;
  color: var(--text-muted, #666);
  text-align: right;
  margin-top: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.message:hover .message-cost {
  opacity: 1;
}
```

**Step 3: Verify build passes**

Run: `npm run build`
Expected: builds without errors.

**Step 4: Commit**

```bash
git add webview/src/components/ChatMessage.tsx webview/src/styles.css
git commit -m "feat(credits): show per-message cost on hover"
```

---

### Task 6: No-credits banner and disabled chat input

**Files:**
- Modify: `webview/src/App.tsx`
- Modify: `webview/src/components/ChatInput.tsx`
- Modify: `webview/src/styles.css`

**Step 1: Add `noCredits` prop to `ChatInput`**

In `webview/src/components/ChatInput.tsx`, add `noCredits?: boolean` to the props interface (near line 46):

```ts
interface ChatInputProps {
  // ... existing props ...
  noCredits?: boolean;
}
```

Then disable the textarea and buttons when `noCredits` is true. Find the `disabled={props.isStreaming || ...}` attributes (around line 428) and add `|| !!props.noCredits` to each.

**Step 2: Pass `noCredits` from `App.tsx` to `ChatInput`**

In `webview/src/App.tsx`, find the `<ChatInput` component and add:

```tsx
noCredits={chatStore.noCredits()}
```

**Step 3: Add no-credits banner in `App.tsx`**

Just above the `<ChatInput` component in `App.tsx`, add:

```tsx
<Show when={chatStore.noCredits()}>
  <div class="no-credits-banner">
    <span>⚠ Insufficient credits — your account has no remaining balance.</span>
    <a
      href="https://openrouter.ai/settings/credits"
      onClick={(e) => { e.preventDefault(); vscode.postMessage({ type: 'openExternal', url: 'https://openrouter.ai/settings/credits' } as any); }}
    >
      Buy credits ↗
    </a>
  </div>
</Show>
```

**Step 4: Add banner CSS**

In `webview/src/styles.css`:

```css
.no-credits-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--vscode-inputValidation-warningBackground, #332b00);
  border-top: 1px solid var(--vscode-inputValidation-warningBorder, #b89500);
  font-size: 12px;
  gap: 8px;
}

.no-credits-banner a {
  color: var(--vscode-textLink-foreground);
  white-space: nowrap;
  text-decoration: none;
}

.no-credits-banner a:hover {
  text-decoration: underline;
}
```

**Step 5: Handle `openExternal` in extension**

In `src/extension.ts`, in the `webview.onDidReceiveMessage` handler, add a case:

```ts
if ((message as any).type === 'openExternal') {
  vscode.env.openExternal(vscode.Uri.parse((message as any).url));
  return;
}
```

Add this at the top of the handler, before calling `handler.handleMessage`.

**Step 6: Verify build passes**

Run: `npm run build`
Expected: builds without errors.

**Step 7: Package and install**

```bash
npx vsce package --no-dependencies
"/c/Program Files/Microsoft VS Code/bin/code.cmd" --install-extension lucent-code-0.2.7.vsix --force
```

**Step 8: Commit**

```bash
git add webview/src/App.tsx webview/src/components/ChatInput.tsx webview/src/styles.css src/extension.ts
git commit -m "feat(credits): no-credits banner and disabled input state"
```

---

### Task 7: Wire `openExternal` to WebviewMessage type and final cleanup

**Files:**
- Modify: `src/shared/types.ts`

**Step 1: Add `openExternal` to `WebviewMessage`**

```ts
| { type: 'openExternal'; url: string }
```

**Step 2: Handle it properly in extension (remove the `as any` cast)**

In `src/extension.ts`, update the handler to handle the typed message.

**Step 3: Final build, package, install**

```bash
npm run build
npx vsce package --no-dependencies
"/c/Program Files/Microsoft VS Code/bin/code.cmd" --install-extension lucent-code-0.2.7.vsix --force
```

**Step 4: Final commit**

```bash
git add src/shared/types.ts src/extension.ts
git commit -m "feat(credits): type openExternal message, complete credits awareness"
```
