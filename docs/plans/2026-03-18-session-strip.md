# Session Strip Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a session strip above the message list that lets users switch between up to 5 recent conversations — rendered as tabs when the panel is wide (≥400px) or a dropdown when narrow.

**Architecture:** A `recentConversationIds` signal (max 5, most-recent-first) is added to the chat store and updated whenever a conversation is loaded or saved. A new `SessionStrip` SolidJS component uses a `ResizeObserver` to switch between a tab row and a `<select>` dropdown based on panel width. It is mounted in `App.tsx` between the toolbar and the message list, visible only when there are 2+ recent conversations.

**Tech Stack:** SolidJS (signals, `createSignal`, `onMount`, `onCleanup`), `ResizeObserver` Web API, existing `vscode.setState`/`vscode.getState` for persistence across panel reloads.

---

### Task 1: Add `recentConversationIds` to the chat store

**Files:**
- Modify: `webview/src/stores/chat.ts`

The webview has no Vitest unit tests (excluded by `vitest.config.ts`). Verification is done by running the dev server and checking behaviour manually, then confirmed by regression testing in a later task.

**Step 1: Add the signal and a helper to push to recents**

In `webview/src/stores/chat.ts`, add the signal and the helper right after the existing signals (around line 37):

```typescript
const MAX_RECENTS = 5;
const [recentConversationIds, setRecentConversationIds] = createSignal<string[]>(
  (() => {
    const saved = getVsCodeApi().getState() as { recentConversationIds?: string[] } | undefined;
    return saved?.recentConversationIds ?? [];
  })()
);

function pushRecent(id: string) {
  if (!id) return;
  setRecentConversationIds((prev) => {
    const next = [id, ...prev.filter((x) => x !== id)].slice(0, MAX_RECENTS);
    getVsCodeApi().setState({ ...(getVsCodeApi().getState() as object ?? {}), recentConversationIds: next });
    return next;
  });
}
```

**Step 2: Call `pushRecent` in `handleConversationLoaded` and `handleConversationSaved`**

In `handleConversationLoaded` (around line 156), add `pushRecent(conversation.id)` right after `setCurrentConversationId(conversation.id)`:

```typescript
function handleConversationLoaded(conversation: Conversation) {
  setCurrentConversationId(conversation.id);
  pushRecent(conversation.id);          // ← add this line
  setMessages(conversation.messages
    // ... rest unchanged
```

In `handleConversationSaved` (around line 177), add `pushRecent(id)`:

```typescript
function handleConversationSaved(id: string) {
  setCurrentConversationId(id);
  pushRecent(id);          // ← add this line
}
```

**Step 3: Export `recentConversationIds` from the store**

In the `return { ... }` block at the bottom of `createChatStore`, add `recentConversationIds` to the returned object:

```typescript
return {
  // ... existing exports ...
  recentConversationIds,
};
```

**Step 4: Start the dev server and verify manually**

```bash
cd webview && npx vite --host
```

Open the app, start two conversations, and confirm `recentConversationIds` grows (check via browser devtools console: `chatStore.recentConversationIds()`). This can't be tested automatically — verified in regression.

**Step 5: Commit**

```bash
git add webview/src/stores/chat.ts
git commit -m "feat: add recentConversationIds signal to chat store"
```

---

### Task 2: Create `SessionStrip.tsx`

**Files:**
- Create: `webview/src/components/SessionStrip.tsx`

**Step 1: Create the component**

Create `webview/src/components/SessionStrip.tsx` with this content:

```typescript
import { Component, createSignal, onMount, onCleanup, For, Show } from 'solid-js';
import type { ConversationSummary } from '@shared';

interface SessionStripProps {
  recentIds: string[];
  conversations: ConversationSummary[];
  currentId: string;
  onSelect: (id: string) => void;
}

const SessionStrip: Component<SessionStripProps> = (props) => {
  const [wide, setWide] = createSignal(true);
  let wrapperRef: HTMLDivElement | undefined;
  let observer: ResizeObserver | undefined;

  onMount(() => {
    observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setWide(width >= 400);
    });
    if (wrapperRef) {
      observer.observe(wrapperRef);
    }
  });

  onCleanup(() => observer?.disconnect());

  // Build ordered list of ConversationSummary for the recents, skipping deleted ones
  const recentConversations = () =>
    props.recentIds
      .map((id) => props.conversations.find((c) => c.id === id))
      .filter((c): c is ConversationSummary => c !== undefined);

  return (
    <div class="session-strip" ref={wrapperRef}>
      <Show when={wide()} fallback={
        <select
          class="session-strip-select"
          value={props.currentId}
          onChange={(e) => props.onSelect(e.currentTarget.value)}
        >
          <For each={recentConversations()}>
            {(conv) => (
              <option value={conv.id}>{conv.title}</option>
            )}
          </For>
        </select>
      }>
        <div class="session-strip-tabs">
          <For each={recentConversations()}>
            {(conv) => (
              <button
                class={`session-tab ${conv.id === props.currentId ? 'session-tab--active' : ''}`}
                onClick={() => props.onSelect(conv.id)}
                title={conv.title}
              >
                {conv.title}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default SessionStrip;
```

**Step 2: Verify the file was created correctly**

```bash
cat webview/src/components/SessionStrip.tsx
```

**Step 3: Commit**

```bash
git add webview/src/components/SessionStrip.tsx
git commit -m "feat: add SessionStrip component with tab/dropdown responsive layout"
```

---

### Task 3: Mount `SessionStrip` in `App.tsx`

**Files:**
- Modify: `webview/src/App.tsx`

**Step 1: Import SessionStrip**

At the top of `webview/src/App.tsx`, add the import alongside the other component imports:

```typescript
import SessionStrip from './components/SessionStrip';
```

**Step 2: Mount the strip between the toolbar and the messages div**

In the JSX return of `App.tsx`, after the `<Show when={chatStore.showConversationList()}>` block (around line 176) and before `<div class="messages">`, add:

```typescript
<Show when={chatStore.recentConversationIds().length > 1}>
  <SessionStrip
    recentIds={chatStore.recentConversationIds()}
    conversations={chatStore.conversations()}
    currentId={chatStore.currentConversationId()}
    onSelect={chatStore.loadConversation}
  />
</Show>
```

**Step 3: Ensure conversations are loaded when the strip is visible**

The `SessionStrip` needs the `conversations` list to look up titles. The conversations list is populated when the ☰ panel is opened (via `listConversations`). To ensure the strip has titles without requiring the user to open ☰, request the conversation list on `ready`.

In `onMount`, the `vscode.postMessage({ type: 'ready' })` call is already there. That handler in the extension host already fetches models and context — add a `listConversations` request right after:

```typescript
vscode.postMessage({ type: 'ready' });
vscode.postMessage({ type: 'listConversations' });  // ← add this line
```

**Step 4: Run the dev server and verify the strip appears**

```bash
cd webview && npx vite --host
```

The strip should be hidden on first load (no recents). After loading two conversations via the ☰ panel, the strip should appear.

**Step 5: Commit**

```bash
git add webview/src/App.tsx
git commit -m "feat: mount SessionStrip in App and fetch conversations on ready"
```

---

### Task 4: Add CSS for `SessionStrip`

**Files:**
- Modify: `webview/src/styles.css`

**Step 1: Add the styles**

At the end of `webview/src/styles.css`, append:

```css
/* Session Strip */
.session-strip {
  border-bottom: 1px solid var(--border);
  background: var(--bg-primary);
  min-height: 0;
}

.session-strip-tabs {
  display: flex;
  overflow-x: auto;
  scrollbar-width: none; /* Firefox */
}

.session-strip-tabs::-webkit-scrollbar {
  display: none;
}

.session-tab {
  flex-shrink: 0;
  padding: 6px 12px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--vscode-foreground);
  opacity: 0.6;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: opacity 0.1s;
}

.session-tab:hover {
  opacity: 1;
  background: var(--bg-secondary);
}

.session-tab--active {
  opacity: 1;
  border-bottom-color: var(--accent);
  color: var(--vscode-foreground);
}

.session-strip-select {
  width: 100%;
  padding: 6px 8px;
  background: var(--bg-secondary);
  border: none;
  border-bottom: 1px solid var(--border);
  color: var(--vscode-foreground);
  font-size: 12px;
  cursor: pointer;
}
```

**Step 2: Start the dev server and visually verify at different widths**

```bash
cd webview && npx vite --host
```

Resize the browser window:
- ≥ 400px wide → tab row should appear with truncated titles
- < 400px wide → dropdown `<select>` should appear
- Active tab should have a colored bottom border

**Step 3: Commit**

```bash
git add webview/src/styles.css
git commit -m "feat: add SessionStrip CSS for tabs and dropdown"
```

---

### Task 5: Update `features.md`

**Files:**
- Modify: `docs/features.md`

**Step 1: Mark diff preview as implemented and add session strip**

In `docs/features.md`:

1. Find the `:construction: | Diff preview` row (line ~94) and change `:construction:` to `:white_check_mark:`.

2. In the `### P4 — Future / exploratory` section, find the `:construction: | **Multiple chat sessions**` row and change it to:
   ```
   | :white_check_mark: | ~~Multiple chat sessions~~ | Session strip: tab row (≥400px) or dropdown (<400px) showing last 5 conversations; switches active conversation | XL |
   ```

**Step 2: Commit**

```bash
git add docs/features.md
git commit -m "docs: mark diff preview and session strip as implemented in features.md"
```

---

### Task 6: Regression test

Run the full regression test to verify the new UI at all 3 viewports:

```bash
npx vitest run --reporter=verbose
```

Expected: 261 tests pass (no new extension tests for this feature — it's pure webview).

Then start the Vite dev server and run `/regression-test` to visually verify:
- Desktop (1920×1080): tab row visible with 2+ conversations
- Tablet (768×1024): tab row visible
- Mobile (375×812): dropdown appears (panel too narrow for tabs)
