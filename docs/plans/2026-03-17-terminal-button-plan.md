# Terminal Button Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `>_` toolbar button that fetches the active terminal output and stores it as a removable chip above the chat textarea — mirroring the file attachment UX.

**Architecture:** All changes are confined to `webview/src/components/ChatInput.tsx` (logic + JSX) and `webview/src/styles.css` (two new CSS rules). No new protocol, no new props — `onResolveMention('terminal')` already exists and returns terminal content. One new signal, one new handler, and one new chip rendering block.

**Tech Stack:** Solid.js signals, JSX, CSS custom properties

---

### Task 1: Add `terminalContent` signal, `handleTerminalButton`, and update `handleSend`

**Files:**
- Modify: `webview/src/components/ChatInput.tsx`

No automated tests for this component. Verify manually by running the extension.

**Step 1: Add the `terminalContent` signal after the `isDragging` signal (line 54)**

Current lines 53-55:
```typescript
  const [attachments, setAttachments] = createSignal<Attachment[]>([]);
  const [isDragging, setIsDragging] = createSignal(false);
  let fileInputRef: HTMLInputElement | undefined;
```

Replace with:
```typescript
  const [attachments, setAttachments] = createSignal<Attachment[]>([]);
  const [isDragging, setIsDragging] = createSignal(false);
  const [terminalContent, setTerminalContent] = createSignal<string | null>(null);
  const [terminalError, setTerminalError] = createSignal(false);
  let fileInputRef: HTMLInputElement | undefined;
```

**Step 2: Add the `handleTerminalButton` handler after the `handleFileInputChange` function (after line 117)**

Current line 117-118:
```typescript
    (e.target as HTMLInputElement).value = ''; // reset so same file can be re-picked
  };

  const handleKeyDown
```

Insert after the closing `};` of `handleFileInputChange`, before `handleKeyDown`:
```typescript
  const handleTerminalButton = async () => {
    const content = await props.onResolveMention('terminal');
    if (content) {
      setTerminalContent(content);
      setTerminalError(false);
    } else {
      setTerminalError(true);
      setTimeout(() => setTerminalError(false), 2000);
    }
  };
```

**Step 3: Update `handleSend` (lines 177-192) to prepend terminal content before file blocks**

Current `handleSend`:
```typescript
  const handleSend = () => {
    if (props.isStreaming) return;

    const validAttachments = attachments().filter((a) => !a.error);
    const textFiles = validAttachments.filter((a) => a.kind === 'text');
    const images = validAttachments.filter((a) => a.kind === 'image').map((a) => a.data);

    const textParts = textFiles.map((a) => `\`\`\`${a.name}\n${a.data}\n\`\`\``);
    const fullContent = [...textParts, input().trim()].filter(Boolean).join('\n\n');

    if (!fullContent && images.length === 0) return;

    props.onSend(fullContent, images);
    setInput('');
    setAttachments([]);
  };
```

Replace with:
```typescript
  const handleSend = () => {
    if (props.isStreaming) return;

    const validAttachments = attachments().filter((a) => !a.error);
    const textFiles = validAttachments.filter((a) => a.kind === 'text');
    const images = validAttachments.filter((a) => a.kind === 'image').map((a) => a.data);

    const terminal = terminalContent();
    const terminalPart = terminal ? `<terminal output>\n${terminal}\n</terminal output>` : null;
    const textParts = textFiles.map((a) => `\`\`\`${a.name}\n${a.data}\n\`\`\``);
    const fullContent = [terminalPart, ...textParts, input().trim()].filter(Boolean).join('\n\n');

    if (!fullContent && images.length === 0) return;

    props.onSend(fullContent, images);
    setInput('');
    setAttachments([]);
    setTerminalContent(null);
  };
```

**Step 4: Commit**

```bash
git add webview/src/components/ChatInput.tsx
git commit -m "feat: add terminalContent signal and handleTerminalButton logic"
```

---

### Task 2: Add `>_` button JSX and terminal chip JSX

**Files:**
- Modify: `webview/src/components/ChatInput.tsx`

**Step 1: Add the terminal chip to the `.attachment-chips` block**

The chip row is currently gated on `attachments().length > 0` (lines 231-252). We need it visible when either attachments or terminal content exists.

Current lines 231-252:
```tsx
        <Show when={attachments().length > 0}>
          <div class="attachment-chips">
            <For each={attachments()}>
              {(att) => (
                <div class={`attachment-chip${att.error ? ' attachment-chip-error' : ''}`}>
                  <Show when={att.kind === 'image' && !att.error}>
                    <img class="attachment-thumb" src={att.data} alt={att.name} />
                  </Show>
                  <span class="attachment-name" title={att.name}>{att.name}</span>
                  <Show when={!!att.error}>
                    <span class="attachment-error">{att.error}</span>
                  </Show>
                  <button
                    class="attachment-remove"
                    onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                    title="Remove"
                  >×</button>
                </div>
              )}
            </For>
          </div>
        </Show>
```

Replace with:
```tsx
        <Show when={attachments().length > 0 || terminalContent() !== null || terminalError()}>
          <div class="attachment-chips">
            <Show when={terminalError()}>
              <div class="attachment-chip attachment-chip-empty-terminal">
                <span class="attachment-name">No active terminal</span>
              </div>
            </Show>
            <Show when={terminalContent() !== null}>
              <div class="attachment-chip attachment-chip--terminal">
                <span class="attachment-name">&gt;_ Terminal ({terminalContent()!.split('\n').length} lines)</span>
                <button
                  class="attachment-remove"
                  onClick={() => setTerminalContent(null)}
                  title="Remove"
                >×</button>
              </div>
            </Show>
            <For each={attachments()}>
              {(att) => (
                <div class={`attachment-chip${att.error ? ' attachment-chip-error' : ''}`}>
                  <Show when={att.kind === 'image' && !att.error}>
                    <img class="attachment-thumb" src={att.data} alt={att.name} />
                  </Show>
                  <span class="attachment-name" title={att.name}>{att.name}</span>
                  <Show when={!!att.error}>
                    <span class="attachment-error">{att.error}</span>
                  </Show>
                  <button
                    class="attachment-remove"
                    onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                    title="Remove"
                  >×</button>
                </div>
              )}
            </For>
          </div>
        </Show>
```

**Step 2: Add the `>_` button between the paperclip and the Send/Stop button**

Current lines 272-278 (paperclip button):
```tsx
        <button
          class="attach-button"
          aria-label="Attach files"
          onClick={() => fileInputRef?.click()}
          title="Attach files"
          disabled={props.isStreaming}
        >📎</button>
```

Replace with:
```tsx
        <button
          class="attach-button"
          aria-label="Attach files"
          onClick={() => fileInputRef?.click()}
          title="Attach files"
          disabled={props.isStreaming}
        >📎</button>
        <button
          class="attach-button"
          aria-label="Add terminal output"
          onClick={() => void handleTerminalButton()}
          title="Add terminal output"
          disabled={props.isStreaming || isResolvingMention()}
        >&gt;_</button>
```

**Step 3: Commit**

```bash
git add webview/src/components/ChatInput.tsx
git commit -m "feat: add >_ terminal button and terminal chip JSX"
```

---

### Task 3: Add CSS rules and update features.md

**Files:**
- Modify: `webview/src/styles.css`
- Modify: `docs/features.md`

**Step 1: Add two new CSS rules after `.attachment-chip-error` (line 740)**

Current lines 738-740:
```css
.attachment-chip-error {
  border-color: var(--vscode-errorForeground, #f44);
}
```

Insert after the closing `}`:
```css
.attachment-chip--terminal {
  border-color: var(--vscode-terminal-foreground, #38bdf8);
}

.attachment-chip-empty-terminal {
  border-color: var(--vscode-errorForeground, #f44);
  animation: fade-out 2s forwards;
}

@keyframes fade-out {
  0%   { opacity: 1; }
  70%  { opacity: 1; }
  100% { opacity: 0; }
}
```

**Step 2: Update `docs/features.md`**

Find the P2 backlog row for terminal output:
```
| :construction: | **Add terminal output to context** | Button to include current terminal output in the next message — essential for debugging loops | S |
```

Replace with:
```
| :white_check_mark: | **Add terminal output to context** | `>_` button adds terminal output as a removable chip; prepended as `<terminal output>` XML on send | S |
```

Also update the Chat Panel table row for `@terminal` to mention the button (line 22):
```
| :white_check_mark: | `@terminal` context mention | Type `@terminal` in chat input to inject the last 200 lines of the active terminal | 2 |
```

No change needed there — `@terminal` is a separate feature and remains unchanged.

**Step 3: Commit**

```bash
git add webview/src/styles.css docs/features.md
git commit -m "feat: terminal chip CSS + mark terminal button feature complete in features.md"
```
