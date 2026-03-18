# Session Strip — Design

**Date:** 2026-03-18
**Status:** Approved

---

## Goal

Add a session strip to the chat panel that lets users quickly switch between recent conversations without opening the ☰ history panel. When the panel is wide enough (≥ 400px) it renders as a tab row; when narrow it collapses to a compact dropdown.

---

## Architecture

A `recentConversationIds` array (max 5, ordered most-recent-first) lives in the chat store. When a conversation is loaded or a new chat is created, the id moves to the front of the array and the list is trimmed to 5. The chat area gains a **session strip** component mounted between the toolbar and the message list. A `ResizeObserver` watches the panel width — above 400px the strip renders as a tab row, below 400px as a `<select>` dropdown. Either way, selecting a session dispatches `loadConversation`. The ☰ history panel remains unchanged except for an active indicator on the current conversation row. No extension-host changes are needed.

---

## Components

### `webview/src/stores/chat.ts`
- Add `recentConversationIds: string[]` signal (max 5, most-recent-first)
- `loadConversation` pushes id to front, trims to 5
- `newChat` pushes new id to front, trims to 5
- Persist `recentConversationIds` via `vscode.setState` so it survives panel reloads

### `webview/src/components/SessionStrip.tsx` (new)
- `ResizeObserver` on a wrapper div exposes a `width` signal
- Width ≥ 400px → row of tab buttons (title truncated, active highlight)
- Width < 400px → `<select>` dropdown
- Both dispatch `loadConversation(id)` on selection
- Filters out any id not present in the current `conversations` list (handles deleted conversations)

### `webview/src/App.tsx`
- Mount `<SessionStrip>` between the toolbar and the message list
- Only render when `recentConversationIds().length > 1`

### `webview/src/components/ConversationList.tsx`
- Add active CSS class / dot indicator to the row matching `currentConversationId`

---

## Data Flow

```
User clicks tab/dropdown
  → loadConversation(id) postMessage
  → extension loads conversation from disk
  → webview receives conversationLoaded
  → currentConversationId updates → messages update
  → id moves to front of recentConversationIds (trimmed to 5)
  → SessionStrip re-renders active tab/option
  → ConversationList highlights active row

New chat (+)
  → newChat postMessage
  → new id pushed to front of recentConversationIds
  → SessionStrip shows new entry as active

Panel resizes
  → ResizeObserver fires → width signal updates
  → SessionStrip switches between tab row and dropdown
```

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Conversation in recents was deleted | Filtered out at render time — not shown in strip |
| Panel too narrow for tabs | Dropdown renders automatically via ResizeObserver |
| No recents (first launch) | Strip hidden (`recentConversationIds.length <= 1`) |

---

## Testing

**`webview/src/stores/chat.ts`** (unit tests):
- `loadConversation` pushes id to front of recents and trims to max 5
- `newChat` pushes new id to front of recents

**`SessionStrip.tsx`**: no unit tests — covered by visual regression at desktop (tab row) and mobile (dropdown).

---

## Out of Scope

- Tabs with ✕ close buttons (switcher model only — no explicit open/close state)
- More than 5 recents in the strip
- Drag-to-reorder tabs
