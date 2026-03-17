# S-Effort Tools Design: New LLM Tools + HITL Approval + Large Output Offloading

**Date:** 2026-03-17
**Status:** Approved

---

## 1. New LLM Tools

### Five new tools added to `TOOL_DEFINITIONS` and `EditorToolExecutor`

**`search_web(query: string)`**
- Calls DuckDuckGo Instant Answers API: `https://api.duckduckgo.com/?q={query}&format=json&no_html=1`
- Returns abstract + top related topics
- No API key required, no configuration

**`fetch_url(url: string)`**
- Calls Jina AI Reader: `https://r.jina.ai/{url}`
- Returns the page as clean Markdown
- No API key required
- Ideal for fetching docs, READMEs, package pages

**`http_request(method: string, url: string, headers?: Record<string, string>, body?: string)`**
- Plain `fetch()` wrapper supporting GET/POST/PUT/DELETE
- Returns `{ status, body }` as JSON string
- Useful for querying local dev servers or REST APIs during debugging

**`search_files(pattern: string)`**
- Calls `vscode.workspace.findFiles(pattern)`
- Returns matching file paths relative to workspace root
- LSP fallback: file discovery for languages without a language server

**`grep_files(pattern: string, include?: string)`**
- Searches workspace files via `vscode.workspace.findFiles(include ?? '**/*')` + reads content + regex match
- Returns matches as `{ file, line, content }` array
- LSP fallback: text search when reference lookup returns nothing or file type has no language server
- Results subject to large output offloading (see Section 3)

### Backlog: richer search APIs
If users want better web search quality, these can be added as optional settings keys:
- Tavily (1,000 free searches/month)
- Brave Search (2,000 free/month)
- Serper (2,500 one-time free)
When a key is present, `search_web` uses that provider instead of DuckDuckGo.

---

## 2. HITL Tool Approval (Inline Webview)

### Which tools require approval
| Tool | Requires approval |
|---|---|
| `rename_symbol` | Yes |
| `insert_code` | Yes |
| `replace_range` | Yes |
| `apply_code_action` | Yes |
| `format_document` | No |
| `search_web` | No |
| `fetch_url` | No |
| `http_request` | No |
| `search_files` | No |
| `grep_files` | No |

### Architecture

**`MessageHandler`** — new private `Map<string, (approved: boolean) => void>` field `pendingApprovals`. Before executing any gated tool, posts a `toolApprovalRequest` message to the webview and awaits a Promise. Stream is paused until user responds.

```ts
private pendingApprovals = new Map<string, (approved: boolean) => void>();

private async requestToolApproval(
  toolName: string,
  args: Record<string, unknown>,
  postMessage: (msg: ExtensionMessage) => void
): Promise<boolean> {
  const requestId = crypto.randomUUID();
  return new Promise((resolve) => {
    this.pendingApprovals.set(requestId, resolve);
    postMessage({ type: 'toolApprovalRequest', requestId, toolName, args });
  });
}
```

In `handleMessage`, new case:
```ts
case 'toolApprovalResponse': {
  const resolve = this.pendingApprovals.get(message.requestId);
  if (resolve) {
    this.pendingApprovals.delete(message.requestId);
    resolve(message.approved);
  }
  break;
}
```

**New message types in `shared/types.ts`:**
```ts
// ExtensionMessage union — add:
| { type: 'toolApprovalRequest'; requestId: string; toolName: string; args: Record<string, unknown> }

// WebviewMessage union — add:
| { type: 'toolApprovalResponse'; requestId: string; approved: boolean }
```

**Webview — inline approval card** rendered in the message list at the point of the tool call:

```
┌─────────────────────────────────────────┐
│ 🔧 rename_symbol                        │
│  file: src/foo.ts  line: 12             │
│  newName: "doThing"                     │
│                        [Allow] [Deny]   │
└─────────────────────────────────────────┘
```

- Clicking Allow/Deny sends `toolApprovalResponse` with the `requestId`
- After response, card becomes read-only showing the decision
- Deny → tool result is `"User denied this action"` — LLM sees it and responds gracefully

**Read-only tool call blocks** — non-gated tools (`search_web`, `fetch_url`, `grep_files`, etc.) also render as collapsed inline blocks so the user sees what context the LLM pulled in. This matches the pattern used by Cursor, Continue.dev, and Claude.ai.

---

## 3. Large Output Offloading

**Threshold:** 8,000 characters (constant, not a setting)

**Location:** `MessageHandler` — applied as a post-process step to all tool results before pushing to `conversationMessages`.

**Behaviour:** If `result.length > 8000`:
1. Write full content to `path.join(os.tmpdir(), 'openrouter-tool-{id}.txt')`
2. Return truncated result + note:
```
[Output truncated: {N} chars. Showing first 8,000.
Full result saved to: {tmpPath}]
```

**No cleanup needed** — OS clears tmpdir files.

---

## Files Touched

| File | Change |
|---|---|
| `src/lsp/editor-tools.ts` | Add 5 new tool definitions + executor methods |
| `src/chat/message-handler.ts` | Add `pendingApprovals` map, `requestToolApproval()`, gated tool intercept, large output offloading, handle `toolApprovalResponse` |
| `src/shared/types.ts` | Add `toolApprovalRequest` to `ExtensionMessage`, `toolApprovalResponse` to `WebviewMessage` |
| `src/lsp/editor-tools.test.ts` | Tests for 5 new tools |
| `src/chat/message-handler.test.ts` | Tests for approval flow and output offloading |
| `webview/src/App.tsx` | Handle `toolApprovalRequest`, render approval cards + read-only tool blocks |
| `webview/src/components/ToolCallCard.tsx` | New component — approval card + read-only tool result block |
| `docs/features.md` | Mark new features as implemented, add backlog entries for premium search APIs |
