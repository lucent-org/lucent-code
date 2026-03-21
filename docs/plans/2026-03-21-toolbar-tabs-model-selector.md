# Toolbar Chat Tabs + Bottom Model Selector Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the toolbar ModelSelector with closeable chat tabs, and move ModelSelector to the bottom-right of the chat input with a context fill % indicator.

**Architecture:** Three focused changes — (1) add `removeFromRecents` to the store, (2) new `ChatTabs` component replaces `ModelSelector` in the toolbar and absorbs `SessionStrip`, (3) `ModelSelector` moves into `ChatInput` with context fill % computed from message chars and model context_length.

**Tech Stack:** SolidJS, TypeScript, CSS custom properties (VS Code theme tokens)

---

## Task 1: Add `removeFromRecents` to the chat store

**Files:**
- Modify: `webview/src/stores/chat.ts`

**Step 1: Add the function after `pushRecent`**

In `webview/src/stores/chat.ts`, after the `pushRecent` function (line ~58), add:

```ts
function removeFromRecents(id: string) {
  setRecentConversationIds((prev) => {
    const next = prev.filter((x) => x !== id);
    vscode.setState({ ...(vscode.getState() as object ?? {}), recentConversationIds: next });
    return next;
  });
}
```

**Step 2: Export it in the return object**

In the `return { ... }` block, add `removeFromRecents` alongside `recentConversationIds`.

**Step 3: Verify it compiles**

```bash
cd webview && npx tsc --noEmit
```
Expected: no errors.

**Step 4: Commit**

```bash
git add webview/src/stores/chat.ts
git commit -m "feat(store): add removeFromRecents action"
```

---

## Task 2: Create `ChatTabs` component

This replaces the `SessionStrip` component and lives in the toolbar. It shows recently opened chats as tabs, each with a close button.

**Files:**
- Create: `webview/src/components/ChatTabs.tsx`

**Step 1: Create the component**

```tsx
import { Component, For, Show, createMemo } from 'solid-js';
import type { ConversationSummary } from '@shared';

interface ChatTabsProps {
  recentIds: string[];
  conversations: ConversationSummary[];
  currentId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

const ChatTabs: Component<ChatTabsProps> = (props) => {
  const recentConversations = createMemo(() =>
    props.recentIds
      .map((id) => props.conversations.find((c) => c.id === id))
      .filter((c): c is ConversationSummary => c !== undefined)
  );

  return (
    <Show when={recentConversations().length > 0}>
      <div class="chat-tabs" role="tablist" aria-label="Open chats">
        <For each={recentConversations()}>
          {(conv) => (
            <div
              class={`chat-tab ${conv.id === props.currentId ? 'chat-tab--active' : ''}`}
              role="tab"
              aria-selected={conv.id === props.currentId}
            >
              <button
                class="chat-tab__label"
                onClick={() => props.onSelect(conv.id)}
                title={conv.title}
              >
                {conv.title}
              </button>
              <button
                class="chat-tab__close"
                onClick={(e) => { e.stopPropagation(); props.onClose(conv.id); }}
                title="Close tab"
                aria-label={`Close ${conv.title}`}
              >
                ×
              </button>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
};

export default ChatTabs;
```

**Step 2: Verify it compiles**

```bash
cd webview && npx tsc --noEmit
```
Expected: no errors.

**Step 3: Commit**

```bash
git add webview/src/components/ChatTabs.tsx
git commit -m "feat(ui): add ChatTabs component with close buttons"
```

---

## Task 3: Wire `ChatTabs` into `App.tsx`, remove `SessionStrip`

**Files:**
- Modify: `webview/src/App.tsx`

**Step 1: Swap imports**

Remove the `ModelSelector` and `SessionStrip` imports:
```ts
// DELETE these two lines:
import ModelSelector from './components/ModelSelector';
import SessionStrip from './components/SessionStrip';
```

Add the `ChatTabs` import:
```ts
import ChatTabs from './components/ChatTabs';
```

**Step 2: Replace `ModelSelector` in the toolbar**

Find the `<ModelSelector ... />` block in the toolbar JSX and replace it with `ChatTabs`:

```tsx
// REMOVE:
<ModelSelector
  models={chatStore.models()}
  selectedModel={chatStore.selectedModel()}
  onSelect={chatStore.selectModel}
/>

// ADD:
<ChatTabs
  recentIds={chatStore.recentConversationIds()}
  conversations={chatStore.conversations()}
  currentId={chatStore.currentConversationId()}
  onSelect={chatStore.loadConversation}
  onClose={chatStore.removeFromRecents}
/>
```

**Step 3: Remove the `SessionStrip` block**

Delete the entire `<Show when={chatStore.recentConversationIds().length > 1}>` block that renders `<SessionStrip ... />`.

**Step 4: Pass model props to `ChatInput`**

Add three new props to the existing `<ChatInput ...>` element:

```tsx
<ChatInput
  onSend={handleSend}
  onCancel={chatStore.cancelRequest}
  isStreaming={chatStore.isStreaming()}
  onResolveMention={handleResolveMention}
  skills={chatStore.availableSkills()}
  onResolveSkill={handleResolveSkill}
  pendingChip={chatStore.pendingSkillChip()}
  onPendingChipConsumed={() => chatStore.setPendingSkillChip(null)}
  models={chatStore.models()}
  selectedModel={chatStore.selectedModel()}
  onSelectModel={chatStore.selectModel}
/>
```

**Step 5: Verify it compiles**

```bash
cd webview && npx tsc --noEmit
```
Expected: errors only about `ChatInput` not yet accepting model props (fixed in Task 4).

**Step 6: Commit**

```bash
git add webview/src/App.tsx
git commit -m "feat(app): replace ModelSelector+SessionStrip with ChatTabs in toolbar"
```

---

## Task 4: Move `ModelSelector` into `ChatInput` with context fill %

**Files:**
- Modify: `webview/src/components/ChatInput.tsx`
- Modify: `webview/src/components/ModelSelector.tsx`

### 4a: Update `ModelSelector` — add context fill, open upward

In `webview/src/components/ModelSelector.tsx`:

**Step 1: Add new props**

```ts
interface ModelSelectorProps {
  models: OpenRouterModel[];
  selectedModel: string;
  onSelect: (modelId: string) => void;
  contextFillPct?: number;  // 0-100, undefined = hide
}
```

**Step 2: Add a helper to derive the colour class**

Inside the component, before the return:

```ts
const fillClass = () => {
  const pct = props.contextFillPct;
  if (pct === undefined) return '';
  if (pct >= 80) return 'context-fill--danger';
  if (pct >= 60) return 'context-fill--warn';
  return 'context-fill--ok';
};
```

**Step 3: Update the toggle button to show fill %**

```tsx
<button class="model-selector-toggle" onClick={() => setIsOpen(!isOpen())}>
  {selectedModelName()}
  <Show when={props.contextFillPct !== undefined}>
    <span class={`context-fill ${fillClass()}`}>
      {' · '}{props.contextFillPct}%
    </span>
  </Show>
</button>
```

**Step 4: Make the dropdown open upward**

Change `top: 100%` to `bottom: 100%` in the dropdown — this is done in CSS (Task 5). No JSX change needed here, but add a CSS modifier class to the selector so we can target it:

```tsx
<div class="model-selector-dropdown model-selector-dropdown--up">
```

**Step 5: Verify it compiles**

```bash
cd webview && npx tsc --noEmit
```

### 4b: Update `ChatInput` — add model props + render `ModelSelector`

**Step 1: Add model props to the interface**

```ts
interface ChatInputProps {
  onSend: (content: string, images: string[]) => void;
  onCancel: () => void;
  isStreaming: boolean;
  onResolveMention: (type: string) => Promise<string | null>;
  skills: { name: string; description: string }[];
  onResolveSkill: (name: string) => Promise<string | null>;
  pendingChip?: { name: string; content: string };
  onPendingChipConsumed?: () => void;
  models: OpenRouterModel[];
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
}
```

**Step 2: Add the import**

```ts
import ModelSelector from './ModelSelector';
import type { OpenRouterModel } from '@shared';
```

**Step 3: Compute context fill %**

Inside the component function (after existing signals), add a derived value. Access the `messages` store through props isn't possible, so pass `messages` in as a prop — wait, that would require changing more. Instead, compute it more elegantly: import `chatStore` directly inside ChatInput, just for the messages signal read.

Actually, cleaner: add a `messages` prop:

```ts
// Add to ChatInputProps:
messages: { role: string; content: string }[];
```

Then in `App.tsx` add `messages={chatStore.messages()}` to `<ChatInput>`.

Compute fill inside `ChatInput`:

```ts
import { createMemo } from 'solid-js';

const contextFillPct = createMemo(() => {
  const model = props.models.find((m) => m.id === props.selectedModel);
  if (!model?.context_length || props.messages.length === 0) return undefined;
  const totalChars = props.messages.reduce((sum, m) => sum + m.content.length, 0);
  const estimated = Math.round(totalChars / 4);
  return Math.min(100, Math.round((estimated / model.context_length) * 100));
});
```

**Step 4: Render `ModelSelector` in the button row**

In the `chat-input-actions` div, insert before the Send/Stop button:

```tsx
<ModelSelector
  models={props.models}
  selectedModel={props.selectedModel}
  onSelect={props.onSelectModel}
  contextFillPct={contextFillPct()}
/>
```

**Step 5: Also add `messages` prop to `<ChatInput>` in `App.tsx`**

```tsx
messages={chatStore.messages()}
```

**Step 6: Verify full compile**

```bash
cd webview && npx tsc --noEmit
```
Expected: no errors.

**Step 7: Commit**

```bash
git add webview/src/components/ModelSelector.tsx webview/src/components/ChatInput.tsx webview/src/App.tsx
git commit -m "feat(ui): move ModelSelector to chat input bottom-right with context fill %"
```

---

## Task 5: CSS — toolbar tabs + bottom model selector

**Files:**
- Modify: `webview/src/styles.css`

### 5a: Toolbar tab styles

**Step 1: Add styles for `.chat-tabs` and `.chat-tab`**

After the `.toolbar` block, add:

```css
/* Toolbar chat tabs */
.chat-tabs {
  display: flex;
  overflow-x: auto;
  scrollbar-width: none;
  flex: 1;
  min-width: 0;
  gap: 2px;
}

.chat-tabs::-webkit-scrollbar {
  display: none;
}

.chat-tab {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  max-width: 140px;
  background: transparent;
  border-bottom: 2px solid transparent;
  color: var(--vscode-foreground);
  opacity: 0.6;
  font-size: 12px;
  transition: opacity 0.1s;
}

.chat-tab:hover {
  opacity: 1;
  background: var(--bg-secondary);
}

.chat-tab--active {
  opacity: 1;
  border-bottom-color: var(--accent);
}

.chat-tab__label {
  flex: 1;
  min-width: 0;
  padding: 4px 6px 4px 8px;
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: inherit;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
}

.chat-tab__close {
  flex-shrink: 0;
  padding: 2px 5px;
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  opacity: 0;
  transition: opacity 0.1s;
}

.chat-tab:hover .chat-tab__close,
.chat-tab--active .chat-tab__close {
  opacity: 0.7;
}

.chat-tab__close:hover {
  opacity: 1 !important;
  color: var(--vscode-editorError-foreground, #f44747);
}
```

### 5b: Bottom model selector styles

**Step 1: Override `.model-selector` for the bottom placement**

The selector is now inside `.chat-input-actions` rather than the toolbar. Replace the current `.model-selector { flex: 1 }` approach (which was for the toolbar) with a contained version:

```css
/* Model selector inside chat input bar */
.chat-input-actions .model-selector {
  flex: 0 0 auto;
  position: relative;
}

.chat-input-actions .model-selector-toggle {
  width: auto;
  padding: 3px 7px;
  font-size: 11px;
  white-space: nowrap;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Dropdown opens upward */
.model-selector-dropdown--up {
  top: auto !important;
  bottom: 100%;
  margin-bottom: 4px;
}
```

### 5c: Context fill colour classes

```css
.context-fill {
  font-size: 0.9em;
}

.context-fill--ok {
  color: var(--vscode-foreground);
  opacity: 0.5;
}

.context-fill--warn {
  color: var(--vscode-editorWarning-foreground, #e2c08d);
}

.context-fill--danger {
  color: var(--vscode-editorError-foreground, #f44747);
}
```

### 5d: Remove old `.session-strip` block (no longer needed)

Delete the CSS rules for `.session-strip`, `.session-strip-tabs`, `.session-strip-tabs::-webkit-scrollbar`, `.session-tab`, `.session-tab:hover`, `.session-tab--active`, `.session-strip-select`.

**Step 2: Verify the dev server picks up changes**

```bash
# Dev server should HMR-update automatically — check browser for visual correctness
```

**Step 3: Commit**

```bash
git add webview/src/styles.css
git commit -m "style(ui): toolbar chat tabs, bottom model selector, context fill colours"
```

---

## Task 6: Delete `SessionStrip` component

**Files:**
- Delete: `webview/src/components/SessionStrip.tsx`

**Step 1: Confirm no remaining imports**

```bash
grep -r "SessionStrip" webview/src/
```
Expected: no output (it was removed from `App.tsx` in Task 3).

**Step 2: Delete the file**

```bash
rm webview/src/components/SessionStrip.tsx
```

**Step 3: Final compile check**

```bash
cd webview && npx tsc --noEmit
```
Expected: no errors.

**Step 4: Commit**

```bash
git add -u webview/src/components/SessionStrip.tsx
git commit -m "refactor: delete SessionStrip (replaced by ChatTabs in toolbar)"
```

---

## Task 7: Visual verification

**Step 1: Open the webview dev server**

```bash
cd webview && npm run dev
```
Navigate to `http://localhost:5177/` (or whichever port Vite picks).

**Step 2: Inject a mock conversation to see tabs**

In the browser console:
```js
window.dispatchEvent(new MessageEvent('message', { data: {
  type: 'modelsLoaded',
  models: [{ id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', context_length: 200000 }]
}}));
window.dispatchEvent(new MessageEvent('message', { data: { type: 'modelChanged', modelId: 'claude-sonnet-4-6' }}));
window.dispatchEvent(new MessageEvent('message', { data: {
  type: 'conversationLoaded',
  conversation: { id: 'c1', messages: [
    { role: 'user', content: 'Explain AuthService.validateToken' },
    { role: 'assistant', content: 'It validates a JWT...' }
  ]}
}}));
```

**Step 3: Verify**

- [ ] Toolbar shows chat tab with title "New chat" or generated title, with `×` close button
- [ ] Clicking `×` removes the tab
- [ ] Model selector is visible in the chat input bar (bottom right)
- [ ] Context fill % shows e.g. `· 0%` with muted colour
- [ ] Model selector dropdown opens upward

**Step 4: Commit any final tweaks, then final compile check**

```bash
cd webview && npx tsc --noEmit
git add webview/src/
git commit -m "fix(ui): visual tweaks from manual verification"
```
