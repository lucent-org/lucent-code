# File Attachments Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add image and file attachments to the chat input via drag-and-drop and a paperclip button, with images displayed as thumbnails in chat history and sent as content arrays to vision-capable models.

**Architecture:** Webview-native file reading (FileReader API). Text files are prepended to the message as fenced code blocks. Images are base64-encoded and passed to the extension host as a separate `images` array alongside the text content. The extension host assembles `ContentPart[]` for the OpenRouter API. `ChatMessage.content` becomes `string | ContentPart[]` in the shared types.

**Tech Stack:** Solid.js, TypeScript, Vitest, FileReader API

---

### Task 1: Add ContentPart type and messageText helper

**Files:**
- Modify: `src/shared/types.ts`
- Create: `src/core/message-text.ts`
- Create: `src/core/message-text.test.ts`

**Step 1: Add `ContentPart` to `src/shared/types.ts`**

Add after the `ToolCall` interface (after line 40), before `ChatRequest`:

```typescript
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };
```

**Step 2: Update `ChatMessage.content` in `src/shared/types.ts`**

Change line 19:
```typescript
// was:
content: string;
// becomes:
content: string | ContentPart[];
```

**Step 3: Add `images` to the `sendMessage` WebviewMessage variant**

Change line 103:
```typescript
// was:
| { type: 'sendMessage'; content: string; model: string }
// becomes:
| { type: 'sendMessage'; content: string; images?: string[]; model: string }
```

**Step 4: Write `src/core/message-text.ts`**

```typescript
import type { ContentPart } from '../shared/types';

export function messageText(content: string | ContentPart[]): string {
  if (typeof content === 'string') return content;
  return content
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}
```

**Step 5: Write `src/core/message-text.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { messageText } from './message-text';

describe('messageText', () => {
  it('returns string content as-is', () => {
    expect(messageText('hello world')).toBe('hello world');
  });

  it('extracts text from a single text ContentPart', () => {
    expect(messageText([{ type: 'text', text: 'hello' }])).toBe('hello');
  });

  it('ignores image_url parts', () => {
    expect(messageText([
      { type: 'text', text: 'Fix this' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
    ])).toBe('Fix this');
  });

  it('joins multiple text parts', () => {
    expect(messageText([
      { type: 'text', text: 'Hello' },
      { type: 'text', text: ' world' },
    ])).toBe('Hello world');
  });

  it('returns empty string for array with no text parts', () => {
    expect(messageText([
      { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
    ])).toBe('');
  });
});
```

**Step 6: Run tests**

```bash
npm test
```

Expected: all tests pass (the new 5 tests + existing 185).

**Step 7: Commit**

```bash
git add src/shared/types.ts src/core/message-text.ts src/core/message-text.test.ts
git commit -m "feat: add ContentPart type and messageText helper"
```

---

### Task 2: Update MessageHandler to compose ContentPart[] from images

**Files:**
- Modify: `src/chat/message-handler.ts`
- Modify: `src/chat/message-handler.test.ts`

**Step 1: Import messageText in `src/chat/message-handler.ts`**

Add after the existing imports (after line 13):

```typescript
import { messageText } from '../core/message-text';
```

**Step 2: Update the `sendMessage` dispatch case (line 45)**

```typescript
// was:
case 'sendMessage':
  await this.handleSendMessage(message.content, message.model, postMessage);
  break;
// becomes:
case 'sendMessage':
  await this.handleSendMessage(message.content, message.images ?? [], message.model, postMessage);
  break;
```

**Step 3: Update `handleSendMessage` signature and user message push (lines 107–126)**

```typescript
// was:
private async handleSendMessage(
  content: string,
  model: string,
  postMessage: (msg: ExtensionMessage) => void
): Promise<void> {
  // ...
  this.conversationMessages.push({ role: 'user', content });

// becomes:
private async handleSendMessage(
  content: string,
  images: string[],
  model: string,
  postMessage: (msg: ExtensionMessage) => void
): Promise<void> {
  // ...
  const userContent = images.length > 0
    ? [
        { type: 'text' as const, text: content },
        ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
      ]
    : content;
  this.conversationMessages.push({ role: 'user', content: userContent });
```

**Step 4: Use messageText in autoTitle to avoid sending images to the title model**

In the `autoTitle` method, the first user message in `conversation.messages.slice(0, 2)` might have `ContentPart[]` content. Replace the slice with text-safe copies:

Find the `autoTitle` method (around line 338) and update:

```typescript
// was:
messages: [
  { role: 'system', content: 'Generate a short title (3-6 words) for this conversation. Output only the title, nothing else.' },
  ...conversation.messages.slice(0, 2),
],

// becomes:
messages: [
  { role: 'system', content: 'Generate a short title (3-6 words) for this conversation. Output only the title, nothing else.' },
  ...conversation.messages.slice(0, 2).map((m) => ({ ...m, content: messageText(m.content) })),
],
```

**Step 5: Write tests in `src/chat/message-handler.test.ts`**

Find the existing test file. Add a new `describe` block at the bottom for image handling. Look for the existing `mockClient`, `mockContextBuilder`, `mockSettings`, `mockHistory` test helpers already in the file — reuse them.

Add after the last existing test:

```typescript
describe('handleSendMessage with images', () => {
  let handler: MessageHandler;
  let mockClient: any;
  let mockContextBuilder: any;
  let mockSettings: any;
  let messages: ExtensionMessage[];

  beforeEach(() => {
    messages = [];
    const postMessage = (m: ExtensionMessage) => messages.push(m);

    mockContextBuilder = {
      buildEnrichedContext: vi.fn().mockResolvedValue({}),
      getCapabilities: vi.fn().mockReturnValue({}),
      formatEnrichedPrompt: vi.fn().mockReturnValue(''),
      getCustomInstructions: vi.fn().mockReturnValue(''),
    };
    mockSettings = { temperature: 0.7, maxTokens: 4096, setChatModel: vi.fn() };

    // Make chatStream yield one chunk then end
    mockClient = {
      chatStream: vi.fn().mockImplementation(async function* () {
        yield { choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] };
      }),
      listModels: vi.fn().mockResolvedValue([]),
    };

    handler = new MessageHandler(mockClient, mockContextBuilder, mockSettings);
  });

  it('builds string content when no images', async () => {
    await handler.handleMessage(
      { type: 'sendMessage', content: 'hello', images: [], model: 'gpt-4o' },
      (m) => messages.push(m)
    );
    const call = mockClient.chatStream.mock.calls[0][0];
    const userMsg = call.messages.find((m: any) => m.role === 'user');
    expect(userMsg.content).toBe('hello');
  });

  it('builds ContentPart[] content when images present', async () => {
    const imgUrl = 'data:image/png;base64,abc123';
    await handler.handleMessage(
      { type: 'sendMessage', content: 'what is this?', images: [imgUrl], model: 'gpt-4o' },
      (m) => messages.push(m)
    );
    const call = mockClient.chatStream.mock.calls[0][0];
    const userMsg = call.messages.find((m: any) => m.role === 'user');
    expect(Array.isArray(userMsg.content)).toBe(true);
    expect(userMsg.content[0]).toEqual({ type: 'text', text: 'what is this?' });
    expect(userMsg.content[1]).toEqual({ type: 'image_url', image_url: { url: imgUrl } });
  });
});
```

**Step 6: Run tests**

```bash
npm test
```

Expected: all tests pass.

**Step 7: Commit**

```bash
git add src/chat/message-handler.ts src/chat/message-handler.test.ts
git commit -m "feat: compose ContentPart[] in MessageHandler when images attached"
```

---

### Task 3: Update webview chat store and App.tsx

**Files:**
- Modify: `webview/src/stores/chat.ts`
- Modify: `webview/src/App.tsx`

No webview unit tests — verify by building.

**Step 1: Add `images` to webview `ChatMessage` in `src/stores/chat.ts`**

Change the `ChatMessage` interface (lines 6–16):

```typescript
export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool_approval';
  content: string;
  images?: string[];           // base64 data URLs for thumbnail display
  isStreaming?: boolean;
  toolApproval?: {
    requestId: string;
    toolName: string;
    args: Record<string, unknown>;
    status: 'pending' | 'approved' | 'denied';
  };
}
```

**Step 2: Update `sendMessage` in `chat.ts` to accept and forward images**

Change the `sendMessage` function (lines 36–47):

```typescript
function sendMessage(content: string, images: string[] = []) {
  if (!content.trim() && images.length === 0) return;
  if (isStreaming()) return;

  const model = selectedModel();
  if (!model) return;

  setMessages((prev) => [...prev, { role: 'user', content, images: images.length ? images : undefined }]);
  setMessages((prev) => [...prev, { role: 'assistant', content: '', isStreaming: true }]);
  setIsStreaming(true);

  vscode.postMessage({ type: 'sendMessage', content, images: images.length ? images : undefined, model });
}
```

**Step 3: Update `handleConversationLoaded` to extract images from ContentPart[] content**

The loaded conversation messages have `content: string | ContentPart[]` (from the shared type). The webview display needs `content: string` and `images?: string[]`.

Replace the `.map()` call in `handleConversationLoaded` (lines 143–148):

```typescript
setMessages(conversation.messages
  .filter((m): m is { role: 'user' | 'assistant'; content: string | import('@shared').ContentPart[]; tool_calls?: unknown; tool_call_id?: string } =>
    m.role === 'user' || m.role === 'assistant')
  .map((m) => {
    if (typeof m.content === 'string') {
      return { role: m.role, content: m.content };
    }
    const text = m.content
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('');
    const images = m.content
      .filter((p): p is { type: 'image_url'; image_url: { url: string } } => p.type === 'image_url')
      .map((p) => p.image_url.url);
    return { role: m.role, content: text, images: images.length ? images : undefined };
  }));
```

**Step 4: Update `sendMessage` export in the return object**

The return object at line 177 already exports `sendMessage` by reference — no change needed if the signature was updated in-place.

**Step 5: Update `handleSend` in `webview/src/App.tsx`**

Change `handleSend` (line 84):

```typescript
// was:
const handleSend = (content: string) => {
  chatStore.sendMessage(content);
};

// becomes:
const handleSend = (content: string, images: string[] = []) => {
  chatStore.sendMessage(content, images);
};
```

**Step 6: Update `ChatInput` usage in `App.tsx` JSX** — the `onSend` prop now passes `(content, images)`. No change needed in JSX since the prop type will update in Task 4.

**Step 7: Build**

```bash
npm run build:webview
```

Expected: exits 0, no TypeScript errors.

**Step 8: Commit**

```bash
git add webview/src/stores/chat.ts webview/src/App.tsx
git commit -m "feat: add images to webview chat store and sendMessage protocol"
```

---

### Task 4: Attachment state and file reading in ChatInput

**Files:**
- Modify: `webview/src/components/ChatInput.tsx`

**Step 1: Add `Attachment` interface and signals at the top of the component**

After the existing signals (after line 24, `const [isResolvingMention, setIsResolvingMention] = createSignal(false);`), add:

```typescript
interface Attachment {
  id: string;
  name: string;
  kind: 'image' | 'text';
  data: string;
  mimeType: string;
  error?: string;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const [attachments, setAttachments] = createSignal<Attachment[]>([]);
```

**Step 2: Add `handleFiles` function**

Add after the `handleFiles` signal, before `handleKeyDown`:

```typescript
const handleFiles = (files: FileList | File[]) => {
  const fileArray = Array.from(files);
  for (const file of fileArray) {
    const id = Math.random().toString(36).slice(2);
    const kind: 'image' | 'text' = file.type.startsWith('image/') ? 'image' : 'text';

    if (file.size > MAX_FILE_SIZE) {
      setAttachments((prev) => [
        ...prev,
        { id, name: file.name, kind, data: '', mimeType: file.type, error: 'Too large (max 5 MB)' },
      ]);
      continue;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const data = (e.target?.result as string) ?? '';
      setAttachments((prev) => [...prev, { id, name: file.name, kind, data, mimeType: file.type }]);
    };

    if (kind === 'image') {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
  }
};
```

**Step 3: Update `ChatInputProps.onSend` signature**

Change the interface (around line 13):

```typescript
interface ChatInputProps {
  onSend: (content: string, images: string[]) => void;
  onCancel: () => void;
  isStreaming: boolean;
  onResolveMention: (type: string) => Promise<string | null>;
}
```

**Step 4: Update `handleSend` to compose and forward text + images**

Replace the `handleSend` function:

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

**Step 5: Build**

```bash
npm run build:webview
```

Expected: exits 0.

**Step 6: Commit**

```bash
git add webview/src/components/ChatInput.tsx
git commit -m "feat: add attachment state and FileReader processing in ChatInput"
```

---

### Task 5: Drag-and-drop, file picker button, attachment chips, and CSS

**Files:**
- Modify: `webview/src/components/ChatInput.tsx`
- Modify: `webview/src/styles.css`

**Step 1: Add drag state and file input ref in ChatInput**

After the `attachments` signal, add:

```typescript
const [isDragging, setIsDragging] = createSignal(false);
let fileInputRef: HTMLInputElement | undefined;
```

**Step 2: Add drag event handlers**

After `handleFiles`, add:

```typescript
const handleDragOver = (e: DragEvent) => {
  e.preventDefault();
  setIsDragging(true);
};

const handleDragLeave = (e: DragEvent) => {
  // Only clear if leaving the wrapper entirely (not a child)
  if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
    setIsDragging(false);
  }
};

const handleDrop = (e: DragEvent) => {
  e.preventDefault();
  setIsDragging(false);
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) handleFiles(files);
};

const handleFileInputChange = (e: Event) => {
  const files = (e.target as HTMLInputElement).files;
  if (files && files.length > 0) handleFiles(files);
  (e.target as HTMLInputElement).value = ''; // reset so same file can be re-picked
};
```

**Step 3: Update the JSX — wrapper with drag handlers**

Change the outer `<div class="chat-input-wrapper">` (around line 87):

```tsx
<div
  class={`chat-input-wrapper${isDragging() ? ' drag-over' : ''}`}
  onDragOver={handleDragOver}
  onDragLeave={handleDragLeave}
  onDrop={handleDrop}
>
```

**Step 4: Add attachment chips between the dropdown and the textarea**

Inside `.chat-input-wrapper`, after the `<Show when={showMentions()...}>` dropdown block but before the `<textarea>`, add:

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

**Step 5: Add hidden file input and paperclip button in the actions row**

Replace the existing `.chat-input-actions` div:

```tsx
<div class="chat-input-actions">
  <input
    ref={fileInputRef}
    type="file"
    style="display:none"
    accept="image/*,.ts,.tsx,.js,.jsx,.py,.go,.rs,.java,.c,.cpp,.cs,.rb,.swift,.kt,.php,.html,.css,.json,.md,.yaml,.toml,.txt"
    multiple
    onChange={handleFileInputChange}
  />
  <button
    class="attach-button"
    onClick={() => fileInputRef?.click()}
    title="Attach files"
    disabled={props.isStreaming}
  >📎</button>
  <Show
    when={props.isStreaming}
    fallback={
      <button
        class="send-button"
        onClick={handleSend}
        disabled={!input().trim() && attachments().filter((a) => !a.error).length === 0}
      >
        Send
      </button>
    }
  >
    <button class="cancel-button" onClick={props.onCancel}>Stop</button>
  </Show>
</div>
```

**Step 6: Add CSS to `webview/src/styles.css`**

Add at the end of the file:

```css
/* Drag-and-drop highlight */
.chat-input-wrapper.drag-over .chat-input {
  border-color: var(--accent);
  outline: 2px dashed var(--accent);
}

/* Attachment chips */
.attachment-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 0;
}

.attachment-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 3px 6px;
  font-size: 0.8em;
  max-width: 200px;
}

.attachment-chip-error {
  border-color: var(--vscode-errorForeground, #f44);
}

.attachment-thumb {
  width: 28px;
  height: 28px;
  object-fit: cover;
  border-radius: 2px;
  flex-shrink: 0;
}

.attachment-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.attachment-error {
  color: var(--vscode-errorForeground, #f44);
  flex-shrink: 0;
}

.attachment-remove {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--fg-secondary);
  padding: 0 2px;
  font-size: 1em;
  line-height: 1;
  flex-shrink: 0;
}

.attachment-remove:hover {
  color: var(--fg-primary);
}

/* Paperclip button */
.attach-button {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.1em;
  padding: 4px 6px;
  color: var(--fg-secondary);
  border-radius: 4px;
}

.attach-button:hover:not(:disabled) {
  background: var(--bg-secondary);
  color: var(--fg-primary);
}

.attach-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
```

**Step 7: Build**

```bash
npm run build:webview
```

Expected: exits 0.

**Step 8: Commit**

```bash
git add webview/src/components/ChatInput.tsx webview/src/styles.css
git commit -m "feat: drag-and-drop, file picker, and attachment chips in ChatInput"
```

---

### Task 6: Image thumbnails in chat history and docs update

**Files:**
- Modify: `webview/src/components/ChatMessage.tsx`
- Modify: `webview/src/styles.css`
- Modify: `docs/features.md`

**Step 1: Update ChatMessage.tsx to render image thumbnails for user messages**

`ChatMessage.tsx` uses the webview `ChatMessage` type (from `stores/chat.ts`) which now has `images?: string[]`. The existing `ContentPart` interface in this file (lines 12–17) is for markdown parsing — keep it, it's different from the API type.

Add image thumbnail rendering inside the component. Replace the return statement:

```tsx
return (
  <div class={`chat-message ${props.message.role}`}>
    <div class="message-role">{props.message.role === 'user' ? 'You' : 'Assistant'}</div>
    <div class="message-content">
      <Show when={props.message.role === 'user' && (props.message.images?.length ?? 0) > 0}>
        <div class="message-images">
          <For each={props.message.images ?? []}>
            {(src) => <img class="message-image-thumb" src={src} alt="attachment" />}
          </For>
        </div>
      </Show>
      <For each={parts()}>
        {(part) => (
          <Show
            when={part.type === 'code'}
            fallback={<span innerHTML={formatText(part.content)} />}
          >
            <CodeBlock code={part.content} language={part.language} filename={part.filename} />
          </Show>
        )}
      </For>
      <Show when={props.message.isStreaming}>
        <span class="cursor-blink">|</span>
      </Show>
    </div>
  </div>
);
```

**Step 2: Add thumbnail CSS to `webview/src/styles.css`**

Append:

```css
/* Image thumbnails in chat history */
.message-images {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.message-image-thumb {
  max-width: 200px;
  max-height: 150px;
  object-fit: contain;
  border-radius: 4px;
  border: 1px solid var(--border);
}
```

**Step 3: Update `docs/features.md`**

In the P3 backlog section (around line 201–202), mark both items as implemented:

```markdown
// was:
| :construction: | **Image attachments** | Attach screenshots/diagrams to chat for multi-modal models — increasingly expected | M |
| :construction: | **Drag-and-drop files** | Drag files from Explorer into chat input to attach or inline their contents | M |

// becomes:
| :white_check_mark: | ~~Image attachments~~ | Attach images via drag-and-drop or paperclip button; thumbnails shown in chat history; sent as base64 content parts to vision models | M |
| :white_check_mark: | ~~Drag-and-drop files~~ | Drop files onto chat input; images become thumbnails, text/code files are inlined as fenced code blocks | M |
```

Also add two rows to the Chat Panel table (after the action mentions rows around line 24):

```markdown
| :white_check_mark: | File attachments (paperclip button) | Click 📎 to pick images or text files; up to 5 MB per file | P3 |
| :white_check_mark: | File attachments (drag-and-drop) | Drag files from Explorer or OS onto the chat input area | P3 |
```

**Step 4: Build and run full test suite**

```bash
npm run build:webview && npm test
```

Expected: build exits 0, all tests pass.

**Step 5: Commit**

```bash
git add webview/src/components/ChatMessage.tsx webview/src/styles.css docs/features.md
git commit -m "feat: image thumbnails in chat history and docs update"
```
