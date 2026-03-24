# Slash Commands & @file Mention Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 4 quick-action built-in skills (`/doc`, `/tests`, `/commit`, `/onboard`), a `/compact` system command that summarizes and truncates conversation history, drop the `@test` action mention, and add an `@file` typed mention for keyboard-driven file context injection.

**Architecture:** The four new skills follow the exact same pattern as existing built-ins — inlined strings in `src/skills/builtin/index.ts`, appearing in the `/` dropdown. `/compact` is a special skill that ChatInput detects before sending and routes to a new `compactConversation` message type, handled by `MessageHandler` via a non-streaming `client.chat()` summarization call that replaces `conversationMessages`. `@file` adds a new branch to ChatInput's `@` detection, posting a `listFiles` message to the extension and rendering a fuzzy-search dropdown over the results.

**Tech Stack:** TypeScript, VS Code extension API (`vscode.workspace.findFiles`), SolidJS webview, Vitest, existing `SkillRegistry` / `ChatInput` mention system.

---

### Task 1: Add 4 new built-in skills

**Files:**
- Modify: `src/skills/builtin/index.ts`

**Background:** `BUILTIN_SKILLS` is a `readonly string[]` of inlined markdown strings. Each starts with YAML frontmatter (`name`, `description`) followed by the skill body. The array is exported and loaded at startup. Add 4 new entries following the exact same pattern as the existing ones.

**Step 1: Add skill strings to `BUILTIN_SKILLS` in `src/skills/builtin/index.ts`**

Append these four template literals to the array (after the last existing entry):

```ts
  `---
name: doc
description: Generate documentation for selected code or the active file
---

Generate documentation for the selected code or the active function/class in the editor.

Rules:
- Match the language's doc format exactly: JSDoc for JavaScript/TypeScript, docstrings for Python, doc comments for Rust/Go
- Document parameters (name, type, purpose), return value, and side effects
- Do not restate the function name — describe what it does, not what it is called
- If no code is selected, document the primary exported symbol in the active file
- Keep documentation concise — no padding, no filler phrases
`,
  `---
name: tests
description: Generate tests for selected code using the project's existing test framework
---

Generate tests for the selected code or the active function/class.

Rules:
1. Identify the project's test framework from existing test files (Jest, Vitest, pytest, etc.)
2. Write tests that cover: happy path, edge cases (empty input, null, boundary values), and error cases
3. Each test has one assertion focus — do not bundle multiple behaviours in one test
4. Name tests descriptively: "returns empty array when input is null", not "test1"
5. Follow the TDD skill's pattern if active: write the test, then the implementation
6. Do not mock what you can test directly
`,
  `---
name: commit
description: Generate a conventional commit message from the current git diff
---

Generate a commit message for the current staged or unstaged changes.

Steps:
1. Call \`run_terminal_command\` with: \`git diff --staged || git diff HEAD\`
2. Read the diff output carefully
3. Write a commit message in conventional format: \`type(scope): short description\`
   - type: feat / fix / refactor / test / docs / chore / style
   - scope: the module or area affected (optional but helpful)
   - description: imperative mood, under 72 characters, no trailing period
4. If the diff contains multiple logical changes, note them as bullet points in the commit body
5. Do not include "Co-authored-by" or tool attribution lines

Output only the commit message — no explanation, no surrounding text.
`,
  `---
name: onboard
description: Analyze project structure and orient a developer new to this codebase
---

Produce a developer orientation for this codebase.

Steps:
1. Read \`package.json\` (or equivalent manifest) for name, description, scripts, and key dependencies
2. Read \`README.md\` if present
3. List top-level directories and explain the purpose of each in one sentence
4. Identify the main entry point(s)
5. Call out the 3–5 most important files a new developer should read first
6. Summarize the architecture in 3–5 sentences: what it does, how it's structured, key patterns used
7. Note any non-obvious conventions (naming, file layout, config files)

Keep the total response under 400 words. Use headings. Do not repeat what is already in the README verbatim.
`,
```

**Step 2: Run tests**

```bash
cd c:/Projects/Prive/OpenRouterChat && npm test
```

Expected: all 435 tests PASS (no logic changed, just data).

**Step 3: Commit**

```bash
git add src/skills/builtin/index.ts
git commit -m "feat(skills): add doc, tests, commit, onboard built-in skills"
```

---

### Task 2: Drop `@test` action mention

**Files:**
- Modify: `webview/src/components/ChatInput.tsx`

**Background:** `MENTION_SOURCES` is defined at line 12 of `ChatInput.tsx`. The `@test` entry has `id: 'test'`. Remove it — the `/tests` skill replaces it. `@fix` and `@explain` stay.

**Step 1: Write failing test**

In `webview/src/components/ChatInput.tsx` there are no unit tests for `MENTION_SOURCES` — the test suite lives in the extension. Check `message-handler.test.ts` for any test that references `@test` action mention and update it if present:

```bash
grep -rn "@test\|id.*test.*action\|mention.*test" src/ webview/src/ --include="*.test.*"
```

Expected: no test references `@test` action mention.

**Step 2: Remove `@test` from `MENTION_SOURCES`**

In `webview/src/components/ChatInput.tsx`, line ~15, delete the `@test` entry:

```ts
// DELETE this line:
{ id: 'test',    label: '@test',    description: 'Write tests for code at cursor',   kind: 'action'  },
```

The array should now have 5 entries: `@fix`, `@explain`, `@terminal`, `@codebase`, `@model`.

**Step 3: Run tests**

```bash
npm test
```

Expected: 435 tests PASS.

**Step 4: Commit**

```bash
git add webview/src/components/ChatInput.tsx
git commit -m "feat(chat): drop @test action mention — replaced by /tests skill"
```

---

### Task 3: Add `/compact` system command

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `webview/src/components/ChatInput.tsx`
- Modify: `src/chat/message-handler.ts`
- Modify: `src/chat/message-handler.test.ts`
- Modify: `webview/src/stores/chat.ts`
- Modify: `webview/src/App.tsx`

**Background:** `/compact` is a skill (appears in `/` dropdown, chip works normally) but ChatInput intercepts it at send time and posts `{ type: 'compactConversation' }` instead of a regular `sendMessage`. `MessageHandler` handles this by calling `client.chat()` (non-streaming) with a summarization prompt, replacing `conversationMessages`, then posting `{ type: 'conversationCompacted', summary }` back.

**Step 1: Add types**

In `src/shared/types.ts`:

Add to `WebviewMessage`:
```ts
| { type: 'compactConversation'; model: string }
```

Add to `ExtensionMessage`:
```ts
| { type: 'conversationCompacted'; summary: string }
```

**Step 2: Write failing tests in `message-handler.test.ts`**

Add a new `describe('compactConversation')` block:

```ts
describe('compactConversation', () => {
  it('calls client.chat with a summarization prompt and replaces conversationMessages', async () => {
    // First send a normal message to populate conversationMessages
    mockClient.chatStream.mockReturnValue(
      (async function* () { yield { choices: [{ delta: { content: 'Hello' } }] }; })()
    );
    await handler.handleMessage(
      { type: 'sendMessage', content: 'What is 2+2?', model: 'test-model' },
      postMessage
    );

    // Now compact
    mockClient.chat = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'We discussed basic arithmetic.' } }]
    });

    await handler.handleMessage(
      { type: 'compactConversation', model: 'test-model' },
      postMessage
    );

    expect(mockClient.chat).toHaveBeenCalledOnce();
    const chatArg = mockClient.chat.mock.calls[0][0];
    // Should include the conversation history in the summarization request
    expect(chatArg.messages.some((m: any) => m.content?.includes('Summarize'))).toBe(true);

    // Should post conversationCompacted
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'conversationCompacted',
      summary: 'We discussed basic arithmetic.',
    }));
  });

  it('posts conversationCompacted with error message if chat call fails', async () => {
    mockClient.chat = vi.fn().mockRejectedValue(new Error('API error'));

    await handler.handleMessage(
      { type: 'compactConversation', model: 'test-model' },
      postMessage
    );

    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'conversationCompacted',
      summary: expect.stringContaining('[Compaction failed'),
    }));
  });
});
```

**Step 3: Run tests to verify they fail**

```bash
npx vitest run src/chat/message-handler.test.ts 2>&1 | tail -20
```

Expected: FAIL — `compactConversation` not handled.

**Step 4: Implement `compactConversation` in `message-handler.ts`**

Add a new `case 'compactConversation':` in the `handleMessage` switch (alongside existing cases):

```ts
case 'compactConversation': {
  const model = message.model;
  let summary: string;
  try {
    const response = await this.client.chat({
      model,
      messages: [
        {
          role: 'user',
          content: `Summarize this conversation in 3–5 sentences. Capture key decisions, code changes discussed, and open questions. Be concise.\n\n${
            this.conversationMessages
              .map((m) => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
              .join('\n')
          }`,
        },
      ],
      max_tokens: 300,
    });
    summary = response.choices?.[0]?.message?.content ?? '[No summary generated]';
  } catch (e: unknown) {
    summary = `[Compaction failed: ${e instanceof Error ? e.message : String(e)}]`;
  }

  const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  this.conversationMessages = [
    {
      role: 'user',
      content: `[Conversation compacted — ${timestamp}]\n\n${summary}`,
    },
  ];
  postMessage({ type: 'conversationCompacted', summary });
  break;
}
```

**Step 5: Run tests to verify they pass**

```bash
npx vitest run src/chat/message-handler.test.ts 2>&1 | tail -10
```

Expected: PASS.

**Step 6: Intercept compact chip in `ChatInput.tsx`**

In the `handleSend` function (the function called when the user presses Enter or the Send button), check for a compact chip before building the message. Find where `skillBlocks` is assembled and the `sendMessage` post happens, and add this check before it:

```ts
// Intercept /compact — send a compactConversation message instead of a regular send
if (skillChips().some((c) => c.name === 'compact')) {
  setSkillChips([]);
  setInput('');
  props.onSend('', [], []); // reset UI state (clear chips, input)
  vscode.postMessage({ type: 'compactConversation', model: props.selectedModel ?? '' });
  return;
}
```

Place this at the top of the send handler, before any other logic. Read `ChatInput.tsx` carefully to find the exact send handler name and location.

**Step 7: Handle `conversationCompacted` in `webview/src/stores/chat.ts`**

Add a new `handleConversationCompacted(summary: string)` function:

```ts
function handleConversationCompacted(summary: string): void {
  setMessages((prev) => [
    ...prev,
    {
      id: crypto.randomUUID(),
      role: 'system' as const,
      content: `[Conversation compacted]\n\n${summary}`,
      timestamp: Date.now(),
      isCompactionDivider: true,
    },
  ]);
}
```

Export it from the store return object.

**Step 8: Wire `conversationCompacted` in `App.tsx`**

In the `window.addEventListener('message', ...)` handler, add:

```ts
case 'conversationCompacted':
  chatStore.handleConversationCompacted(message.summary);
  break;
```

**Step 9: Render compaction divider in the message list**

Find the component that renders messages (check `webview/src/components/` for `MessageList`, `Message`, or similar). Add a visual divider for messages with `isCompactionDivider: true`:

```tsx
<Show when={msg.isCompactionDivider}>
  <div class="compaction-divider">
    <span class="compaction-divider__label">Conversation compacted</span>
    <span class="compaction-divider__summary">{msg.content.replace('[Conversation compacted]\n\n', '')}</span>
  </div>
</Show>
```

**Step 10: Run full test suite**

```bash
npm test
```

Expected: 436+ tests PASS.

**Step 11: Commit**

```bash
git add src/shared/types.ts src/chat/message-handler.ts src/chat/message-handler.test.ts webview/src/components/ChatInput.tsx webview/src/stores/chat.ts webview/src/App.tsx
git commit -m "feat(chat): add /compact system command — summarize and truncate conversation history"
```

---

### Task 4: Add `@file` typed mention

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/chat/message-handler.ts`
- Modify: `src/chat/message-handler.test.ts`
- Modify: `webview/src/components/ChatInput.tsx`

**Background:** When the user types `@` followed by letters that don't match a known mention source or model, treat the input as a file search query. Post `{ type: 'listFiles', query }` to the extension; receive `{ type: 'fileList', files: { name, path, relativePath }[] }` back; show a dropdown; on selection, add a file attachment chip (same as paperclip — reuse existing `Attachment` type and `attachments` signal).

**Step 1: Add types to `src/shared/types.ts`**

Add to `WebviewMessage`:
```ts
| { type: 'listFiles'; query: string }
```

Add to `ExtensionMessage`:
```ts
| { type: 'fileList'; files: { name: string; relativePath: string }[] }
```

**Step 2: Write failing test in `message-handler.test.ts`**

```ts
describe('listFiles', () => {
  it('returns matching workspace files', async () => {
    // Mock vscode.workspace.findFiles
    const mockUri = { fsPath: '/workspace/src/foo.ts', toString: () => 'file:///workspace/src/foo.ts' };
    vi.mocked(vscode.workspace.findFiles).mockResolvedValueOnce([mockUri as any]);
    vi.mocked(vscode.workspace.workspaceFolders).mockReturnValue([
      { uri: { fsPath: '/workspace' } } as any,
    ]);

    await handler.handleMessage({ type: 'listFiles', query: 'foo' }, postMessage);

    expect(postMessage).toHaveBeenCalledWith({
      type: 'fileList',
      files: [{ name: 'foo.ts', relativePath: 'src/foo.ts' }],
    });
  });

  it('returns empty array when no workspace folder', async () => {
    vi.mocked(vscode.workspace.workspaceFolders).mockReturnValue(undefined);

    await handler.handleMessage({ type: 'listFiles', query: 'anything' }, postMessage);

    expect(postMessage).toHaveBeenCalledWith({ type: 'fileList', files: [] });
  });
});
```

**Step 3: Run to verify tests fail**

```bash
npx vitest run src/chat/message-handler.test.ts -t "listFiles" 2>&1 | tail -10
```

Expected: FAIL — `listFiles` not handled.

**Step 4: Implement `listFiles` handler in `message-handler.ts`**

Add case in `handleMessage` switch:

```ts
case 'listFiles': {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    postMessage({ type: 'fileList', files: [] });
    break;
  }
  const root = folders[0].uri.fsPath;
  const query = message.query.trim();
  const pattern = query ? `**/*${query}*` : '**/*';
  const uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 30);
  const files = uris.map((uri) => {
    const relativePath = uri.fsPath.replace(root + '/', '').replace(root + '\\', '');
    const name = relativePath.split(/[\\/]/).pop() ?? relativePath;
    return { name, relativePath };
  });
  postMessage({ type: 'fileList', files });
  break;
}
```

**Step 5: Run tests to verify they pass**

```bash
npx vitest run src/chat/message-handler.test.ts -t "listFiles" 2>&1 | tail -10
```

Expected: PASS.

**Step 6: Add `@file` detection and dropdown to `ChatInput.tsx`**

Read `ChatInput.tsx` carefully to understand the existing `@mention` detection flow (`handleInput`, `showMentions`, `mentionFilter`, `selectMention`). The `@model` mention was added recently and is the best reference — replicate its pattern.

Add these signals near the existing mention signals:

```ts
const [showFilePicker, setShowFilePicker] = createSignal(false);
const [filePickerFilter, setFilePickerFilter] = createSignal('');
const [filePickerBeforeAt, setFilePickerBeforeAt] = createSignal('');
const [filePickerResults, setFilePickerResults] = createSignal<{ name: string; relativePath: string }[]>([]);
```

**In `handleInput`:** when `showFilePicker()` is true, update `filePickerFilter` and post `listFiles`:
```ts
if (showFilePicker()) {
  const query = value.slice(filePickerBeforeAt().length + 1); // after '@'
  setFilePickerFilter(query);
  vscode.postMessage({ type: 'listFiles', query });
  return;
}
```

**In `selectMention`:** there is no explicit `@file` mention source — file search triggers when the `@` input does not match any known mention source and is not a model search. After the existing mention filtering logic, add a fallback: if the filter text doesn't match any `MENTION_SOURCES` entry and isn't empty, open the file picker:

```ts
// After existing mention matching — if nothing matched and user typed @<text>
if (filteredMentions().length === 0 && mentionFilter().length > 0) {
  setShowMentions(false);
  setShowFilePicker(true);
  setFilePickerBeforeAt(beforeAt);
  setFilePickerFilter(mentionFilter());
  vscode.postMessage({ type: 'listFiles', query: mentionFilter() });
}
```

Actually, a cleaner approach: add `@file` explicitly to `MENTION_SOURCES` with `kind: 'file'`, then handle it in `selectMention` the same way `@model` opens the model picker:

```ts
{ id: 'file', label: '@file', description: 'Attach a workspace file as context', kind: 'file' },
```

In `selectMention`, add:
```ts
if (source.kind === 'file') {
  setInput(beforeAt);
  setFilePickerBeforeAt(beforeAt);
  setFilePickerFilter('');
  setShowFilePicker(true);
  vscode.postMessage({ type: 'listFiles', query: '' });
  return;
}
```

**In `handleKeyDown`:** add Escape handler for file picker (same as model picker):
```ts
if (showFilePicker()) {
  setShowFilePicker(false);
  setFilePickerFilter('');
  setFilePickerBeforeAt('');
  return;
}
```

**Add `selectFileFromPicker` function:**
```ts
function selectFileFromPicker(file: { name: string; relativePath: string }) {
  setShowFilePicker(false);
  setFilePickerFilter('');
  setInput(filePickerBeforeAt());
  // Fetch file content and add as attachment chip
  vscode.postMessage({ type: 'getFileContent', relativePath: file.relativePath });
}
```

Wait — adding file content requires reading the file. Look at how the paperclip attachment works (it reads files via `FileReader` or file input). For `@file`, the simplest approach matching the existing pattern is to use the `read_file` tool or post a `readAttachment` message.

**Simpler approach:** reuse the existing `applyToFile` / file reading path. Post `{ type: 'readFileForAttachment', relativePath }` to the extension, receive back `{ type: 'fileAttachment', name, relativePath, content }`, then call the existing `addAttachment` logic.

Add to `WebviewMessage`:
```ts
| { type: 'readFileForAttachment'; relativePath: string }
```

Add to `ExtensionMessage`:
```ts
| { type: 'fileAttachment'; name: string; relativePath: string; content: string; error?: string }
```

Handle in `message-handler.ts`:
```ts
case 'readFileForAttachment': {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders) { postMessage({ type: 'fileAttachment', name: '', relativePath: message.relativePath, content: '', error: 'No workspace' }); break; }
  const uri = vscode.Uri.joinPath(folders[0].uri, message.relativePath);
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    if (bytes.byteLength > 5 * 1024 * 1024) {
      postMessage({ type: 'fileAttachment', name: '', relativePath: message.relativePath, content: '', error: 'File exceeds 5 MB limit' });
      break;
    }
    const content = new TextDecoder().decode(bytes);
    const name = message.relativePath.split(/[\\/]/).pop() ?? message.relativePath;
    postMessage({ type: 'fileAttachment', name, relativePath: message.relativePath, content });
  } catch {
    postMessage({ type: 'fileAttachment', name: '', relativePath: message.relativePath, content: '', error: 'Could not read file' });
  }
  break;
}
```

Handle `fileAttachment` in `App.tsx` by calling `chatStore.addFileAttachment(msg)` (or equivalent).

In `ChatInput.tsx`, when `fileAttachment` is received (via a callback prop or store event), add it to `attachments` exactly like a paperclip-added file.

**Step 7: Add file picker dropdown JSX**

After the model picker `<Show>` block, add:

```tsx
<Show when={showFilePicker()}>
  <div class="mention-dropdown">
    <Show when={filePickerResults().length > 0} fallback={
      <div class="mention-item mention-item--disabled">
        {filePickerFilter().length > 0 ? 'No files found' : 'Type to search files…'}
      </div>
    }>
      <For each={filePickerResults()}>
        {(file) => (
          <button
            class="mention-item"
            onMouseDown={(e) => { e.preventDefault(); selectFileFromPicker(file); }}
          >
            <span class="mention-item-label">{file.name}</span>
            <span class="mention-item-desc">{file.relativePath}</span>
          </button>
        )}
      </For>
    </Show>
  </div>
</Show>
```

Handle `fileList` message in `App.tsx` to update the `filePickerResults` signal (pass down via a store function or a callback prop on ChatInput).

**Step 8: Run full test suite**

```bash
npm test
```

Expected: 438+ tests PASS.

**Step 9: Commit**

```bash
git add src/shared/types.ts src/chat/message-handler.ts src/chat/message-handler.test.ts webview/src/components/ChatInput.tsx webview/src/App.tsx webview/src/stores/chat.ts
git commit -m "feat(chat): add @file typed mention for keyboard-driven file context injection"
```

---

### Task 5: CSS styles for new UI elements

**Files:**
- Modify: `webview/src/styles.css`

**Step 1: Add styles**

Append to `webview/src/styles.css`:

```css
/* Conversation compaction divider */
.compaction-divider {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px;
  margin: 8px 0;
  border-left: 3px solid var(--accent, var(--vscode-focusBorder, #007acc));
  background: var(--bg-secondary, var(--vscode-sideBar-background, #252526));
  border-radius: 0 4px 4px 0;
  font-size: 12px;
}

.compaction-divider__label {
  color: var(--accent, var(--vscode-focusBorder, #007acc));
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
}

.compaction-divider__summary {
  color: var(--fg-secondary, var(--vscode-descriptionForeground, #9d9d9d));
  font-style: italic;
  line-height: 1.4;
}
```

**Step 2: Run tests**

```bash
npm test
```

Expected: 438+ tests PASS.

**Step 3: Commit**

```bash
git add webview/src/styles.css
git commit -m "feat(chat): style compaction divider"
```

---

### Task 6: Update docs and feature inventory

**Files:**
- Modify: `docs/features.md`

**Step 1: Update Skill Sets section**

In the Skill Sets table, update the `Semantic pre-injection` row (already marked as replaced by pull-only) and add new rows:

```markdown
| :white_check_mark: | `/doc` built-in skill | Generate JSDoc/docstring for selected code | - |
| :white_check_mark: | `/tests` built-in skill | Generate tests for selected code — replaces `@test` | - |
| :white_check_mark: | `/commit` built-in skill | Generate conventional commit message from git diff | - |
| :white_check_mark: | `/onboard` built-in skill | Orient a new developer to the codebase | - |
| :white_check_mark: | `/compact` command | Summarize and truncate conversation history to free context | - |
```

In the Chat Panel table, remove or mark `@fix`/`@explain`/`@test` mentions and add `@file`:
```markdown
| :white_check_mark: | `@file` mention | Type `@file` to fuzzy-search and attach any workspace file as context | - |
```

**Step 2: Commit**

```bash
git add docs/features.md
git commit -m "docs: document new slash commands and @file mention in feature inventory"
```
