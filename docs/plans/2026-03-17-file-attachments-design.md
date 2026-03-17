# File Attachments — Design

**Date:** 2026-03-17
**Status:** Approved

---

## Overview

Two backlog features implemented together because they share the same attachment pipeline: **image attachments** (screenshots/diagrams for multi-modal models) and **drag-and-drop files** (code/text files inlined as context). Both entry points — a paperclip button and drag-and-drop — feed into the same `Attachment` state and the same composition logic on send.

---

## Approach

Webview-native file reading via the browser File API and `FileReader`. No extension-host roundtrip needed. All file processing happens in the webview; text files are inlined as fenced code blocks, images are base64-encoded and sent as OpenRouter/OpenAI vision content parts.

---

## Section 1: Attachment Model & Data Flow

### Attachment type

```typescript
interface Attachment {
  id: string;        // random, for Solid keying
  name: string;      // filename
  kind: 'image' | 'text';
  data: string;      // base64 data URL (images) or raw text (code/text files)
  mimeType: string;
}
```

### File processing (webview, FileReader)

| File type | FileReader method | Result |
|-----------|-------------------|--------|
| `image/*` | `readAsDataURL` | base64 data URL |
| everything else | `readAsText` | raw string |

### Message composition (App.tsx, on send)

- **Text attachments** — prepended to the user message as fenced code blocks:
  ````
  ```filename.ts
  [file contents]
  ```
  ````
- **Image attachments** — `ChatMessage.content` becomes a `ContentPart[]` array:
  ```
  [ { type: 'text', text: '...' }, { type: 'image_url', image_url: { url: '<base64>' } }, ... ]
  ```

---

## Section 2: UI Components

### Paperclip button

- Sits next to the Send/Stop button in `.chat-input-actions`
- Triggers a hidden `<input type="file">` with `accept="image/*,text/*,.ts,.tsx,.js,.jsx,.py,.go,.rs,.json,.md,.css,.html"` and `multiple`
- Icon: `📎` or a clip SVG inline

### Drag-and-drop zone

- The existing `.chat-input-wrapper` div receives `onDragOver`, `onDragEnter`, `onDragLeave`, `onDrop` handlers
- Visual feedback: border highlights while dragging (CSS class toggled via Solid signal)
- Files dropped anywhere on the wrapper are processed

### Attachment chips

- Rendered between the textarea and the button row
- **Text file chip**: filename + × remove button
- **Image chip**: small thumbnail (`40×40`, `object-fit: cover`) + filename + × remove button
- Chips use a `.attachment-chip` CSS class

### Chat history (ChatMessage.tsx)

- User message bubbles render image thumbnails above the text content when `content` is a `ContentPart[]`
- Thumbnails use the base64 data URL already stored in the content array

---

## Section 3: API Changes

### types.ts

```typescript
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[];   // was: string
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}
```

### OpenRouterClient

No changes — it already `JSON.stringify`s the request as-is. OpenRouter accepts `content: ContentPart[]` natively.

### Places that read `content` as a string

Any code that reads `message.content` as a string needs a helper:

```typescript
function messageText(content: string | ContentPart[]): string {
  if (typeof content === 'string') return content;
  return content
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}
```

Affected locations: context builder (conversation history), history store serialisation, auto-title prompt, any place that concatenates `message.content`.

---

## Section 4: Error Handling & Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| File > 5 MB | Chip renders in error state with "Too large" label; not included on send |
| Unsupported file type | Show VSCode `showWarningMessage` notification; file not added |
| Vision-incapable model | No UI guard; existing error notification handles API rejection (YAGNI) |
| Multiple images | Each becomes a separate `image_url` content part |
| History serialisation | Base64 stored as-is in conversation JSON; larger history files are acceptable |

---

## What Does NOT Change

- `OpenRouterClient` request logic
- `@mentions` system
- Inline completion pipeline
- Tool-use / HITL approval flow
- Conversation export format (content arrays serialise naturally to JSON)
