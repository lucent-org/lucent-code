# Terminal Button — Design

**Date:** 2026-03-17
**Status:** Approved

---

## Overview

Add a `>_` toolbar button that fetches the active terminal output and displays it as a removable chip above the chat textarea — the same one-click pattern Cursor and Copilot use. The `@terminal` mention continues to work unchanged.

---

## Button

- Location: `.chat-input-actions`, between the paperclip (📎) and the Send/Stop button
- Icon: `>_` (text label, consistent with the emoji style of the paperclip)
- Disabled while `props.isStreaming` or `isResolvingMention()` is true
- On click: calls `props.onResolveMention('terminal')` (existing hook, no new protocol)
- If result is null/empty: brief "No active terminal" error label renders in the chip area and clears after 2 s
- If result exists: stores content in `terminalContent` signal; replaces any previous snapshot

---

## State

Single signal in `ChatInput`:

```typescript
const [terminalContent, setTerminalContent] = createSignal<string | null>(null);
```

Clicking the button again replaces the previous snapshot (not appended — one terminal context at a time).

---

## Chip

Rendered in the same `.attachment-chips` row as file attachment chips.

- Prefix: `>_`
- Label: `Terminal (N lines)` where N = `content.split('\n').length`
- × remove button: calls `setTerminalContent(null)`
- Base class: `.attachment-chip`
- Modifier: `.attachment-chip--terminal` — slightly different border colour to distinguish from file chips (uses `var(--vscode-terminal-foreground, #38bdf8)` as border)

---

## On Send

`handleSend` prepends terminal content before file attachment code blocks:

```
<terminal output>
${terminalContent}
</terminal output>

```filename.ts
[file content]
```

[user message]
```

Cleared after send alongside file attachments.

---

## Protocol

No changes — reuses existing:
- Webview → Extension: `{ type: 'getTerminalOutput' }`
- Extension → Webview: `{ type: 'terminalOutput', content: string | null }`
- `onResolveMention('terminal')` in `App.tsx` already handles this

---

## CSS

Two new rules:
- `.attachment-chip--terminal` — `border-color: var(--vscode-terminal-foreground, #38bdf8)`
- `.attachment-chip-empty-terminal` — temporary error state (opacity fade-out via CSS animation)

---

## What Does NOT Change

- `@terminal` mention behaviour (still works, still produces XML inline text)
- Extension host, protocol, or `TerminalBuffer`
- `App.tsx` (no new props needed — `onResolveMention` is already passed)
- File attachment pipeline
