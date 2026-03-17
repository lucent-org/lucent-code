# Action Mentions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `@fix`, `@explain`, and `@test` action shortcuts to the existing `@mentions` dropdown in the chat input.

**Architecture:** All changes are webview-only. Action mentions resolve synchronously (no extension-host roundtrip) by returning a prompt-prefix string. The existing context-enrichment pipeline injects the current file/selection automatically, so the action mention just sets the intent. The `MentionSource` interface gets a `kind` field to distinguish action vs context mentions, and the dropdown renders a group separator between the two categories.

**Tech Stack:** Solid.js, TypeScript, Vite

---

### Task 1: Add `kind` to `MentionSource` and action entries in ChatInput.tsx

**Files:**
- Modify: `webview/src/components/ChatInput.tsx`
- Modify: `webview/src/styles.css`

No unit tests exist for webview components. Verify manually by building (`npm run build:webview`) and checking for TypeScript errors.

**Step 1: Update the `MentionSource` interface and `MENTION_SOURCES` array**

Replace the interface and array at the top of `webview/src/components/ChatInput.tsx` (lines 3–11):

```typescript
interface MentionSource {
  id: string;
  label: string;
  description: string;
  kind: 'context' | 'action';
}

const MENTION_SOURCES: MentionSource[] = [
  { id: 'fix',     label: '@fix',     description: 'Fix code at cursor',              kind: 'action'  },
  { id: 'explain', label: '@explain', description: 'Explain code at cursor',           kind: 'action'  },
  { id: 'test',    label: '@test',    description: 'Write tests for code at cursor',   kind: 'action'  },
  { id: 'terminal', label: '@terminal', description: 'Last 200 lines of active terminal', kind: 'context' },
];
```

**Step 2: Update `selectMention` to differentiate insertion by kind**

Replace the `selectMention` function body (currently lines 58–75). Action mentions insert the content directly; context mentions keep the XML wrapper:

```typescript
const selectMention = async (source: MentionSource) => {
  setShowMentions(false);
  setIsResolvingMention(true);
  const value = input();
  const lastAt = value.lastIndexOf('@');
  const beforeAt = lastAt !== -1 ? value.slice(0, lastAt) : value;

  try {
    const content = await props.onResolveMention(source.id);
    if (content) {
      if (source.kind === 'action') {
        setInput(`${beforeAt}${content} `);
      } else {
        setInput(`${beforeAt}<${source.id} output>\n${content}\n</${source.id} output> `);
      }
    } else {
      setInput(`${beforeAt}[${source.label}: not available] `);
    }
  } finally {
    setIsResolvingMention(false);
  }
};
```

**Step 3: Update the dropdown JSX to render group separators**

Replace the `<Show>` block that renders the dropdown (currently lines 88–102). The dropdown now groups action and context sources with a label:

```tsx
<Show when={showMentions() && filteredSources().length > 0}>
  <div class="mention-dropdown">
    {(() => {
      const sources = filteredSources();
      const actions = sources.filter((s) => s.kind === 'action');
      const contexts = sources.filter((s) => s.kind === 'context');
      return (
        <>
          <For each={actions}>
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
          <Show when={actions.length > 0 && contexts.length > 0}>
            <div class="mention-group-separator" />
          </Show>
          <For each={contexts}>
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
        </>
      );
    })()}
  </div>
</Show>
```

**Step 4: Add `.mention-group-separator` to styles.css**

Insert after the `.mention-dropdown` block (after line 435):

```css
.mention-group-separator {
  height: 1px;
  background: var(--border);
  margin: 2px 0;
}
```

**Step 5: Build and check for TypeScript errors**

```bash
npm run build:webview
```

Expected: exits 0, no TypeScript errors.

**Step 6: Commit**

```bash
git add webview/src/components/ChatInput.tsx webview/src/styles.css
git commit -m "feat: add @fix, @explain, @test action mentions with group separator"
```

---

### Task 2: Update `handleResolveMention` in App.tsx for sync action resolution

**Files:**
- Modify: `webview/src/App.tsx` (line 88–106)

**Step 1: Update `handleResolveMention` to handle action types synchronously**

Replace the `handleResolveMention` function (lines 88–106):

```typescript
const handleResolveMention = (type: string): Promise<string | null> => {
  switch (type) {
    case 'fix':     return Promise.resolve('Fix the following code:');
    case 'explain': return Promise.resolve('Explain the following code:');
    case 'test':    return Promise.resolve('Write tests for the following code:');
  }
  // Context mentions require extension-host roundtrip
  const requestType = `get${type.charAt(0).toUpperCase() + type.slice(1)}Output` as 'getTerminalOutput';
  const responseType = `${type}Output` as 'terminalOutput';
  return new Promise((resolve) => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as { type: string; content?: string | null };
      if (msg.type === responseType) {
        window.removeEventListener('message', handler);
        resolve(msg.content ?? null);
      }
    };
    window.addEventListener('message', handler);
    vscode.postMessage({ type: requestType });
    setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve(null);
    }, 3000);
  });
};
```

**Step 2: Build and check for TypeScript errors**

```bash
npm run build:webview
```

Expected: exits 0.

**Step 3: Run full test suite to confirm no regressions**

```bash
npm test
```

Expected: all tests pass (no extension-host changes).

**Step 4: Commit**

```bash
git add webview/src/App.tsx
git commit -m "feat: resolve action mentions synchronously in handleResolveMention"
```

---

### Task 3: Update docs/features.md with @mentions documentation

**Files:**
- Modify: `docs/features.md`

**Step 1: Add an @mentions section to the Chat Panel table**

In the Chat Panel table (after the "Multi-line input" row, around line 23), add two rows:

```markdown
| :white_check_mark: | `@terminal` context mention | Type `@terminal` in chat input to inject the last 200 lines of the active terminal | P2 |
| :white_check_mark: | `@fix` / `@explain` / `@test` action mentions | Type `@fix`, `@explain`, or `@test` to insert a focused prompt prefix; works with the existing editor context | P2 |
```

**Step 2: Update the P2 backlog rows to mark action mentions as implemented**

In the P3 Backlog section (around line 201), the existing "Slash commands" row:

```markdown
| :construction: | **Slash commands** | `/fix`, `/explain`, `/test` in chat input — good UX, not a blocker | M |
```

Change to:

```markdown
| :white_check_mark: | ~~Slash commands~~ | Implemented as `@fix`, `@explain`, `@test` action mentions in the `@mentions` dropdown | M |
```

**Step 3: Commit**

```bash
git add docs/features.md
git commit -m "docs: document @mentions system and action mentions in features.md"
```
