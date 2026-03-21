# Design: Toolbar Chat Tabs + Bottom Model Selector with Context Fill

**Date:** 2026-03-21
**Status:** Approved

---

## Overview

Two UI changes to improve the chat panel layout:

1. **Toolbar tabs** — replace the ModelSelector in the toolbar with tabs showing recently opened conversations (the current SessionStrip content), each closeable with an `×` button.
2. **Bottom model selector** — move ModelSelector to the bottom-right of the chat input area, augmented with a context fill percentage that changes color as the context window fills up.

---

## Change 1: Toolbar Chat Tabs

### Before / After

```
BEFORE:  [/ Lucent Code] [Claude Sonnet 4.6 ▾]  [☰] [+] [⊙]
AFTER:   [/ Lucent Code] [Auth refactor ×] [Bug #42 ×]  [☰] [+] [⊙]
```

### Behaviour

- Tabs use the same data source as the current `SessionStrip` component (`recentConversationIds` + `conversations` from the store).
- Each tab shows the conversation title (truncated with ellipsis) and an `×` close button.
- Clicking a tab switches to that conversation.
- Clicking `×` removes the conversation from the recents list (does **not** delete it — it remains accessible via `☰`).
- `+` creates a new chat and immediately adds it as the active tab.
- Tabs scroll horizontally when they overflow the available space.
- On panels narrower than 400 px, tabs collapse to a `<select>` dropdown (same breakpoint as the existing SessionStrip).
- The `SessionStrip` component and its render in `App.tsx` are removed — this tab bar is its replacement.

### Store change

Add a `removeFromRecents(id)` action to the chat store that removes an ID from `recentConversationIds` without deleting the conversation.

---

## Change 2: Bottom Model Selector with Context Fill

### Placement

The `ModelSelector` moves from the toolbar into the `ChatInput` component, rendered to the right of the attach/terminal/skills buttons and to the left of Send.

```
┌──────────────────────────────────────────────────────────────┐
│ Ask about your code...                                       │
│  📎  >_  /…   [ claude-sonnet-4-6 · 23% ▾ ]  [ Send ]      │
└──────────────────────────────────────────────────────────────┘
```

### Context fill indicator

- **Token estimate:** `Math.round(totalChars / 4)` where `totalChars` is the sum of all message content character lengths. Good enough for a visual indicator.
- **Context window:** `model.context_length` from the `OpenRouterModel` object (provided by OpenRouter API, already in the models list).
- **Percentage:** `Math.min(100, Math.round(estimatedTokens / contextLength * 100))`
- Displayed inline in the button: `claude-sonnet-4-6 · 23%`
- The percentage span uses a CSS class driven by the value:
  - `< 60%` → default muted colour
  - `60–80%` → `--vscode-editorWarning-foreground` (yellow)
  - `≥ 80%` → `--vscode-editorError-foreground` (red)
- Recalculates reactively whenever messages change or selected model changes.
- When no messages exist, the percentage is omitted (just shows the model name).
- Dropdown opens **upward** (`bottom: 100%`) so it doesn't clip below the VS Code panel edge.

### Props change to ChatInput

`ChatInput` receives two new props:

```ts
models: OpenRouterModel[];
selectedModel: string;
onSelectModel: (modelId: string) => void;
```

The `ModelSelector` component is rendered inside `ChatInput` rather than in `App.tsx`'s toolbar.

---

## Files to Change

| File | Change |
|------|--------|
| `webview/src/App.tsx` | Remove `<ModelSelector>` from toolbar; remove `<SessionStrip>`; add toolbar tabs inline or as new component; pass model props to `<ChatInput>` |
| `webview/src/components/ChatInput.tsx` | Accept model props; render `<ModelSelector>` in the button row |
| `webview/src/components/ModelSelector.tsx` | Add context fill % display; dropdown opens upward; colour-coded span |
| `webview/src/components/SessionStrip.tsx` | Delete (replaced by toolbar tabs) |
| `webview/src/components/ChatTabs.tsx` | New component — toolbar tabs with close buttons |
| `webview/src/stores/chat.ts` | Add `removeFromRecents(id)` action |
| `webview/src/styles.css` | Style toolbar tabs, update model selector for bottom placement |

---

## Out of Scope

- Actual token counting from the extension host (estimate is sufficient for a visual indicator).
- Pinning tabs or reordering them.
- Showing context fill in the toolbar or anywhere else.
