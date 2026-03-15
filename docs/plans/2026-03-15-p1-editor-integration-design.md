# P1 Editor Integration — Design

**Date:** 2026-03-15
**Scope:** Three P1 backlog features shipped in complexity order

## Features (in delivery order)

1. **Custom instructions file** — project-level system prompt injection
2. **Context menu actions** — Explain / Fix / Improve on selected code
3. **Apply to file + Diff preview** — apply code blocks to files with visual diff

---

## Feature 1: Custom Instructions File

### Goal
Load a project-level instructions file and prepend it to every system prompt, so teams can guide the assistant without touching settings.

### File resolution
- Scan workspace root on activation and on file-system change
- Check `.openrouter-instructions.md` first; fall back to `.cursorrules`
- Only workspace-level (no user-global or per-folder variants)
- If both exist, `.openrouter-instructions.md` wins

### Architecture
New class `InstructionsLoader` in `src/core/instructions-loader.ts`:
- Constructor takes `vscode.WorkspaceFolder[]`
- `load(): Promise<string | undefined>` — reads the first matching file
- Registers a `vscode.FileSystemWatcher` for both filenames; reloads on create/change/delete
- Caches content in memory; exposes `getInstructions(): string | undefined`

`ContextBuilder` receives `InstructionsLoader` as an optional constructor argument. `formatEnrichedPrompt` prepends a `## Project Instructions:\n{content}` block before the editor context when instructions are non-empty. `MessageHandler` and the system prompt template are unchanged.

### Error handling
- File unreadable → silently skip (no instructions loaded, no error shown)
- File > 50 KB → warn once via `vscode.window.showWarningMessage`, skip

---

## Feature 2: Context Menu Actions

### Goal
Right-click selected code → Explain / Fix / Improve → message sent to chat (append or new chat).

### Commands
Three new commands registered in `package.json`:
- `openRouterChat.explainCode`
- `openRouterChat.fixCode`
- `openRouterChat.improveCode`

Each appears in `menus.editor/context` under an **"OpenRouter Chat"** submenu with two child entries per action: **"Add to Chat"** and **"New Chat"**. Condition: `when: editorHasSelection`.

### Intent messages
| Action | Prefix |
|--------|--------|
| Explain | `Explain this code:\n\`\`\`{lang}\n{selection}\n\`\`\`` |
| Fix | `Fix this code:\n\`\`\`{lang}\n{selection}\n\`\`\`` |
| Improve | `Improve this code:\n\`\`\`{lang}\n{selection}\n\`\`\`` |

Language ID comes from `editor.document.languageId`.

### Flow
1. Command handler in `extension.ts` reads selection + language from active editor
2. Focuses chat panel via `vscode.commands.executeCommand('openRouterChat.chatView.focus')`
3. Posts `{ type: 'triggerSend', content: string, newChat: boolean }` to the webview

### Webview (`triggerSend` handler)
- If `newChat: true`: clear conversation state (same as `newChat` message)
- Append user message to chat UI immediately
- Fire the normal send flow (posts `sendMessage` back to extension)

This keeps the webview as the single source of truth for UI state — no duplicated send logic in the extension host.

### New types
- `ExtensionMessage`: add `{ type: 'triggerSend'; content: string; newChat: boolean }`
- No changes to `MessageHandler` — it receives a normal `sendMessage` from the webview

---

## Feature 3: Apply to File + Diff Preview

### Goal
Each assistant code block gets an "Apply to file" button. Clicking it resolves the target file, diffs the proposed code against the current content, shows an appropriate preview, and applies on user confirmation.

### Filename parsing
The webview parses the filename hint from the opening fence tag: ` ```{lang} {path} ` → extract everything after the first space. Examples:
- ` ```ts src/foo.ts ` → `src/foo.ts`
- ` ```python ` → no hint

Webview posts `{ type: 'applyToFile', code: string, language: string, filename?: string }` to the extension.

### File resolution (extension host)
1. If `filename` present: resolve relative to `vscode.workspace.workspaceFolders[0].uri`
2. If resolved file exists → use it
3. Otherwise (no hint, or file not found) → `vscode.window.showOpenDialog({ canSelectMany: false })`

### Hunk counting
Read current file content with `vscode.workspace.fs.readFile`. Compute a line-level diff (using a minimal Myers diff — or split into lines and count contiguous change regions). Threshold:
- **0 or 1 hunk** (or file is new/empty) → inline webview diff
- **2+ hunks** → VSCode native diff editor

### Inline webview diff (≤1 hunk)
Extension posts `{ type: 'showDiff', original: string, proposed: string, filename: string }` to the webview. Webview renders a two-pane diff (removed lines in red, added in green) inline in the chat panel with **Apply** and **Discard** buttons. On Apply, webview posts `{ type: 'confirmApply', code: string, fileUri: string }` back to the extension.

### VSCode native diff editor (2+ hunks)
Extension creates an in-memory document for the proposed code:
```ts
const proposedDoc = await vscode.workspace.openTextDocument({ content: code, language });
```
Then opens the diff:
```ts
vscode.commands.executeCommand('vscode.diff', originalUri, proposedDoc.uri, `Review: ${filename}`);
```
A notification toast offers **Apply** / **Discard**. On Apply, proceeds to apply step.

### Applying the edit
Both paths converge on replacing the full file content via `WorkspaceEdit`:
```ts
const edit = new vscode.WorkspaceEdit();
edit.replace(fileUri, fullFileRange, code);
await vscode.workspace.applyEdit(edit);
await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(fileUri));
```

### New message types
- `WebviewMessage`: add `{ type: 'applyToFile'; code: string; language: string; filename?: string }` and `{ type: 'confirmApply'; code: string; fileUri: string }`
- `ExtensionMessage`: add `{ type: 'showDiff'; original: string; proposed: string; filename: string }`

---

## Out of Scope
- Multi-file apply (one code block → multiple files)
- Partial hunk selection in the diff UI
- Global (user-level) instructions — workspace only
- Diff for new files (always treated as single hunk, i.e. inline preview)
