# S-Tools Implementation Plan: New LLM Tools + HITL Approval + Large Output Offloading

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 5 new LLM-callable tools (search_files, grep_files, search_web, fetch_url, http_request), inline webview approval cards for destructive tools, and automatic truncation of oversized tool outputs.

**Architecture:** New tool definitions + executor methods in `editor-tools.ts`; approval flow via Promise-based pending map in `MessageHandler`; output offloading as a post-process in `MessageHandler`; webview renders approval cards inline in the message list as a special `tool_approval` message role.

**Tech Stack:** TypeScript, VSCode Extension API, Solid.js, Vitest, Node.js `os`/`fs` modules

---

### Task 1: Add new message types to `shared/types.ts`

**Files:**
- Modify: `src/shared/types.ts`

**Step 1: Add the types**

Open `src/shared/types.ts`. In the `ExtensionMessage` union (currently ends at line 98), add two new variants:

```ts
export type ExtensionMessage =
  | { type: 'streamChunk'; content: string }
  | { type: 'streamEnd'; usage?: ChatResponse['usage'] }
  | { type: 'streamError'; error: string }
  | { type: 'modelsLoaded'; models: OpenRouterModel[] }
  | { type: 'modelChanged'; modelId: string }
  | { type: 'contextUpdate'; context: CodeContext }
  | { type: 'conversationList'; conversations: ConversationSummary[] }
  | { type: 'conversationLoaded'; conversation: Conversation }
  | { type: 'conversationSaved'; id: string; title: string }
  | { type: 'conversationTitled'; id: string; title: string }
  | { type: 'triggerSend'; content: string; newChat: boolean }
  | { type: 'showDiff'; lines: DiffLine[]; filename: string; fileUri: string }
  | { type: 'toolApprovalRequest'; requestId: string; toolName: string; args: Record<string, unknown> };
```

In the `WebviewMessage` union (currently ends at line 112), add:

```ts
export type WebviewMessage =
  | { type: 'sendMessage'; content: string; model: string }
  | { type: 'cancelRequest' }
  | { type: 'getModels' }
  | { type: 'setModel'; modelId: string }
  | { type: 'newChat' }
  | { type: 'ready' }
  | { type: 'listConversations' }
  | { type: 'loadConversation'; id: string }
  | { type: 'deleteConversation'; id: string }
  | { type: 'exportConversation'; id: string; format: 'json' | 'markdown' }
  | { type: 'applyToFile'; code: string; language: string; filename?: string }
  | { type: 'confirmApply'; fileUri: string }
  | { type: 'toolApprovalResponse'; requestId: string; approved: boolean };
```

**Step 2: Run existing tests to confirm no breakage**

```
npx vitest run
```

Expected: all existing tests pass (types-only change).

**Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add toolApprovalRequest/Response message types"
```

---

### Task 2: Add workspace tools to `editor-tools.ts` (search_files, grep_files)

**Files:**
- Modify: `src/lsp/editor-tools.ts`
- Modify: `src/lsp/editor-tools.test.ts`

**Step 1: Extend the vscode mock in the test file**

The current mock at the top of `editor-tools.test.ts` only has `commands`, `workspace.applyEdit`, `Uri`, `Position`, `Range`, `WorkspaceEdit`. Add `findFiles` and `workspace.fs.readFile`:

Replace the `vi.hoisted` block and `vi.mock('vscode', ...)` with:

```ts
const { mockExecuteCommand, mockApplyEdit, mockFindFiles, mockReadFile } = vi.hoisted(() => ({
  mockExecuteCommand: vi.fn(),
  mockApplyEdit: vi.fn(() => Promise.resolve(true)),
  mockFindFiles: vi.fn(() => Promise.resolve([])),
  mockReadFile: vi.fn(() => Promise.resolve(new Uint8Array())),
}));

vi.mock('vscode', () => ({
  commands: {
    executeCommand: mockExecuteCommand,
  },
  workspace: {
    applyEdit: mockApplyEdit,
    findFiles: mockFindFiles,
    fs: { readFile: mockReadFile },
  },
  Uri: {
    parse: (s: string) => ({ toString: () => s, fsPath: s }),
  },
  Position: class {
    constructor(public line: number, public character: number) {}
  },
  Range: class {
    constructor(public start: any, public end: any) {}
  },
  WorkspaceEdit: class {
    private edits: any[] = [];
    replace(uri: any, range: any, text: string) { this.edits.push({ uri, range, text }); }
    insert(uri: any, position: any, text: string) { this.edits.push({ uri, position, text }); }
  },
}));
```

**Step 2: Write failing tests for `search_files` and `grep_files`**

Add a new `describe('workspace search tools', ...)` block at the end of the test file:

```ts
describe('search_files', () => {
  it('returns matching file paths', async () => {
    mockFindFiles.mockResolvedValue([
      { fsPath: '/workspace/src/foo.ts' },
      { fsPath: '/workspace/src/bar.ts' },
    ]);
    const result = await executor.execute('search_files', { pattern: 'src/**/*.ts' });
    expect(result.success).toBe(true);
    expect(result.message).toContain('foo.ts');
    expect(result.message).toContain('bar.ts');
  });

  it('returns "No files found" when nothing matches', async () => {
    mockFindFiles.mockResolvedValue([]);
    const result = await executor.execute('search_files', { pattern: '**/*.xyz' });
    expect(result.success).toBe(true);
    expect(result.message).toBe('No files found');
  });
});

describe('grep_files', () => {
  it('returns matching lines with file and line number', async () => {
    const content = 'line one\nhello world\nline three\n';
    mockFindFiles.mockResolvedValue([{ fsPath: '/workspace/src/foo.ts' }]);
    mockReadFile.mockResolvedValue(new TextEncoder().encode(content));

    const result = await executor.execute('grep_files', { pattern: 'hello', include: '**/*.ts' });
    expect(result.success).toBe(true);
    expect(result.message).toContain('foo.ts');
    expect(result.message).toContain('hello world');
  });

  it('returns "No matches found" when pattern does not match', async () => {
    const content = 'nothing here\n';
    mockFindFiles.mockResolvedValue([{ fsPath: '/workspace/src/foo.ts' }]);
    mockReadFile.mockResolvedValue(new TextEncoder().encode(content));

    const result = await executor.execute('grep_files', { pattern: 'xyz123' });
    expect(result.success).toBe(true);
    expect(result.message).toBe('No matches found');
  });

  it('skips unreadable files without throwing', async () => {
    mockFindFiles.mockResolvedValue([
      { fsPath: '/workspace/src/foo.ts' },
      { fsPath: '/workspace/src/bad.ts' },
    ]);
    mockReadFile
      .mockResolvedValueOnce(new TextEncoder().encode('hello world\n'))
      .mockRejectedValueOnce(new Error('Permission denied'));

    const result = await executor.execute('grep_files', { pattern: 'hello' });
    expect(result.success).toBe(true);
    expect(result.message).toContain('hello');
  });
});
```

**Step 3: Run tests to verify they fail**

```
npx vitest run src/lsp/editor-tools.test.ts
```

Expected: new tests fail with "Unknown tool".

**Step 4: Add tool definitions to `TOOL_DEFINITIONS`**

In `editor-tools.ts`, append to `TOOL_DEFINITIONS` after the `replace_range` definition:

```ts
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Find files in the workspace matching a glob pattern. Use as fallback when LSP cannot enumerate files.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern e.g. "src/**/*.ts"' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep_files',
      description: 'Search file contents with a regex pattern. Use as fallback when LSP reference lookup returns no results or the language has no server.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regex pattern to search for' },
          include: { type: 'string', description: 'Glob pattern to filter files (default: "**/*")' },
        },
        required: ['pattern'],
      },
    },
  },
```

**Step 5: Add executor methods and wire them up**

Add two new cases to the `switch` in `execute()`:

```ts
case 'search_files':
  return await this.searchFiles(args);
case 'grep_files':
  return await this.grepFiles(args);
```

Add the private methods at the bottom of `EditorToolExecutor`:

```ts
private async searchFiles(args: Record<string, unknown>): Promise<ToolResult> {
  const pattern = args.pattern as string;
  const uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 500);
  if (uris.length === 0) return { success: true, message: 'No files found' };
  return { success: true, message: uris.map((u) => u.fsPath).join('\n') };
}

private async grepFiles(args: Record<string, unknown>): Promise<ToolResult> {
  const pattern = args.pattern as string;
  const include = (args.include as string | undefined) ?? '**/*';
  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch {
    return { success: false, error: `Invalid regex: ${pattern}` };
  }

  const uris = await vscode.workspace.findFiles(include, '**/node_modules/**', 100);
  const matches: string[] = [];

  for (const uri of uris) {
    if (matches.length >= 50) break;
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const content = new TextDecoder().decode(bytes);
      const lines = content.split('\n');
      for (let i = 0; i < lines.length && matches.length < 50; i++) {
        if (regex.test(lines[i])) {
          matches.push(`${uri.fsPath}:${i + 1}: ${lines[i].trim()}`);
        }
      }
    } catch { /* skip unreadable files */ }
  }

  return { success: true, message: matches.length > 0 ? matches.join('\n') : 'No matches found' };
}
```

**Step 6: Run tests**

```
npx vitest run src/lsp/editor-tools.test.ts
```

Expected: all tests pass including the 5 new ones.

**Step 7: Commit**

```bash
git add src/lsp/editor-tools.ts src/lsp/editor-tools.test.ts
git commit -m "feat: add search_files and grep_files as LSP fallback tools"
```

---

### Task 3: Add network tools to `editor-tools.ts` (search_web, fetch_url, http_request)

**Files:**
- Modify: `src/lsp/editor-tools.ts`
- Modify: `src/lsp/editor-tools.test.ts`

**Step 1: Write failing tests**

Add to the vscode mock hoisted block a `mockFetch` (global fetch mock):

After the `vi.mock('vscode', ...)` block, add:

```ts
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
```

And inside `beforeEach`:

```ts
mockFetch.mockReset();
```

Add a new `describe('network tools', ...)` block:

```ts
describe('search_web', () => {
  it('returns abstract and related topics from DuckDuckGo', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        Abstract: 'TypeScript is a typed superset of JavaScript.',
        RelatedTopics: [
          { Text: 'TypeScript compiler', FirstURL: 'https://example.com' },
        ],
      }),
    });

    const result = await executor.execute('search_web', { query: 'TypeScript' });
    expect(result.success).toBe(true);
    expect(result.message).toContain('TypeScript is a typed superset');
    expect(result.message).toContain('TypeScript compiler');
  });

  it('returns error on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 429 });
    const result = await executor.execute('search_web', { query: 'test' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('429');
  });
});

describe('fetch_url', () => {
  it('returns page content via Jina reader', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => '# My Docs\n\nSome content here.',
    });

    const result = await executor.execute('fetch_url', { url: 'https://example.com/docs' });
    expect(result.success).toBe(true);
    expect(result.message).toContain('My Docs');
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('r.jina.ai'));
  });

  it('returns error on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    const result = await executor.execute('fetch_url', { url: 'https://example.com/missing' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('404');
  });
});

describe('http_request', () => {
  it('returns status and body as JSON', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"id":1}',
    });

    const result = await executor.execute('http_request', {
      method: 'GET',
      url: 'http://localhost:3000/api/items',
    });
    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.message!);
    expect(parsed.status).toBe(200);
    expect(parsed.body).toContain('"id":1');
  });

  it('handles POST with body and headers', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 201, text: async () => 'created' });

    await executor.execute('http_request', {
      method: 'POST',
      url: 'http://localhost:3000/api/items',
      headers: { 'Content-Type': 'application/json' },
      body: '{"name":"test"}',
    });

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"name":"test"}',
    });
  });
});
```

**Step 2: Run tests to verify they fail**

```
npx vitest run src/lsp/editor-tools.test.ts
```

Expected: 6 new tests fail with "Unknown tool".

**Step 3: Add tool definitions**

Append to `TOOL_DEFINITIONS` after `grep_files`:

```ts
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: 'Search the web using DuckDuckGo. Returns an abstract and top results. Use to look up documentation, error messages, or concepts.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description: 'Fetch a URL and return its content as clean Markdown. Use to read documentation pages, READMEs, or package pages.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fetch' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'http_request',
      description: 'Make an HTTP request to a URL. Use to query a local dev server, REST API, or any HTTP endpoint.',
      parameters: {
        type: 'object',
        properties: {
          method: { type: 'string', description: 'HTTP method: GET, POST, PUT, DELETE' },
          url: { type: 'string', description: 'Request URL' },
          headers: { type: 'object', description: 'Optional request headers as key-value pairs' },
          body: { type: 'string', description: 'Optional request body' },
        },
        required: ['method', 'url'],
      },
    },
  },
```

**Step 4: Add cases to `execute()` switch**

```ts
case 'search_web':
  return await this.searchWeb(args);
case 'fetch_url':
  return await this.fetchUrl(args);
case 'http_request':
  return await this.httpRequest(args);
```

**Step 5: Add private methods**

```ts
private async searchWeb(args: Record<string, unknown>): Promise<ToolResult> {
  const query = args.query as string;
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const response = await fetch(url);
  if (!response.ok) return { success: false, error: `Search failed: ${response.status}` };

  const data = await response.json() as {
    Abstract?: string;
    RelatedTopics?: Array<{ Text?: string }>;
  };

  const parts: string[] = [];
  if (data.Abstract) parts.push(data.Abstract);
  if (data.RelatedTopics) {
    for (const topic of data.RelatedTopics.slice(0, 5)) {
      if (topic.Text) parts.push(`- ${topic.Text}`);
    }
  }
  return { success: true, message: parts.join('\n') || 'No results found' };
}

private async fetchUrl(args: Record<string, unknown>): Promise<ToolResult> {
  const url = args.url as string;
  const response = await fetch(`https://r.jina.ai/${url}`);
  if (!response.ok) return { success: false, error: `Fetch failed: ${response.status}` };
  const text = await response.text();
  return { success: true, message: text };
}

private async httpRequest(args: Record<string, unknown>): Promise<ToolResult> {
  const method = (args.method as string).toUpperCase();
  const url = args.url as string;
  const headers = args.headers as Record<string, string> | undefined;
  const body = args.body as string | undefined;

  const response = await fetch(url, { method, headers, body });
  const text = await response.text();
  return { success: true, message: JSON.stringify({ status: response.status, body: text }) };
}
```

**Step 6: Run all tests**

```
npx vitest run
```

Expected: all tests pass.

**Step 7: Commit**

```bash
git add src/lsp/editor-tools.ts src/lsp/editor-tools.test.ts
git commit -m "feat: add search_web, fetch_url, http_request LLM tools"
```

---

### Task 4: Add large output offloading to `MessageHandler`

**Files:**
- Modify: `src/chat/message-handler.ts`
- Modify: `src/chat/message-handler.test.ts`

**Step 1: Write failing tests**

In `message-handler.test.ts`, find the describe block for tool execution (around line 200+) and add a new `describe('large output offloading', ...)`:

```ts
describe('large output offloading', () => {
  it('truncates tool output longer than 8000 chars and saves to tmp file', async () => {
    const longOutput = 'x'.repeat(9000);
    const toolStream = createToolCallStream([
      { id: 'call_1', name: 'search_files', arguments: '{"pattern":"**/*.ts"}' },
    ]);
    const stopStream = createMockStream([
      { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] },
    ]);
    mockClient.chatStream
      .mockReturnValueOnce(toolStream)
      .mockReturnValueOnce(stopStream);
    mockToolExecutor.execute.mockResolvedValue({ success: true, message: longOutput });

    const postMessages: ExtensionMessage[] = [];
    await handler.handleMessage(
      { type: 'sendMessage', content: 'find ts files', model: 'gpt-4' },
      (msg) => postMessages.push(msg)
    );

    // The message pushed to conversationMessages (which gets sent back to LLM) should be truncated
    // We can verify by checking the second chatStream call's messages argument
    const secondCallMessages = mockClient.chatStream.mock.calls[1][0].messages;
    const toolResultMsg = secondCallMessages.find((m: any) => m.role === 'tool');
    expect(toolResultMsg.content).toContain('[Output truncated');
    expect(toolResultMsg.content).toContain('8,000');
    expect(toolResultMsg.content.length).toBeLessThan(longOutput.length);
  });

  it('does not truncate output under 8000 chars', async () => {
    const shortOutput = 'x'.repeat(100);
    const toolStream = createToolCallStream([
      { id: 'call_1', name: 'search_files', arguments: '{"pattern":"**/*.ts"}' },
    ]);
    const stopStream = createMockStream([
      { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] },
    ]);
    mockClient.chatStream
      .mockReturnValueOnce(toolStream)
      .mockReturnValueOnce(stopStream);
    mockToolExecutor.execute.mockResolvedValue({ success: true, message: shortOutput });

    const postMessages: ExtensionMessage[] = [];
    await handler.handleMessage(
      { type: 'sendMessage', content: 'find ts files', model: 'gpt-4' },
      (msg) => postMessages.push(msg)
    );

    const secondCallMessages = mockClient.chatStream.mock.calls[1][0].messages;
    const toolResultMsg = secondCallMessages.find((m: any) => m.role === 'tool');
    expect(toolResultMsg.content).toBe(shortOutput);
  });
});
```

**Step 2: Run tests to verify they fail**

```
npx vitest run src/chat/message-handler.test.ts
```

Expected: 2 new tests fail.

**Step 3: Add `import * as os from 'os'` and `import * as fs from 'fs'` to message-handler.ts**

At the top of `src/chat/message-handler.ts`, after the existing imports, add:

```ts
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
```

**Step 4: Add `truncateToolOutput()` helper**

Add this private method to `MessageHandler`, just before `handleApplyToFile`:

```ts
private truncateToolOutput(content: string): string {
  const LIMIT = 8000;
  if (content.length <= LIMIT) return content;

  const tmpFile = path.join(os.tmpdir(), `openrouter-tool-${Date.now()}.txt`);
  try {
    fs.writeFileSync(tmpFile, content, 'utf8');
  } catch { /* best effort */ }

  return `${content.slice(0, LIMIT)}\n\n[Output truncated: ${content.length.toLocaleString()} chars. Showing first 8,000.\nFull result saved to: ${tmpFile}]`;
}
```

**Step 5: Apply truncation in the tool result push**

In `handleSendMessage`, find the line where tool results are pushed to `conversationMessages` (around line 170):

```ts
content: result.success ? (result.message ?? 'Done') : `Error: ${result.error}`,
```

Replace with:

```ts
content: this.truncateToolOutput(
  result.success ? (result.message ?? 'Done') : `Error: ${result.error}`
),
```

**Step 6: Add `fs` to the vscode mock's test setup**

In `message-handler.test.ts`, add a mock for `fs` at the top level (after the vscode mock) to prevent actual file writes during tests:

```ts
vi.mock('fs', () => ({
  writeFileSync: vi.fn(),
}));
```

**Step 7: Run all tests**

```
npx vitest run
```

Expected: all tests pass.

**Step 8: Commit**

```bash
git add src/chat/message-handler.ts src/chat/message-handler.test.ts
git commit -m "feat: truncate tool outputs over 8000 chars and save full result to tmpfile"
```

---

### Task 5: Add HITL approval to `MessageHandler`

**Files:**
- Modify: `src/chat/message-handler.ts`
- Modify: `src/chat/message-handler.test.ts`

**Step 1: Write failing tests**

Add a new `describe('HITL tool approval', ...)` block in `message-handler.test.ts`:

```ts
describe('HITL tool approval', () => {
  it('posts toolApprovalRequest for gated tools and executes on approval', async () => {
    const toolStream = createToolCallStream([
      { id: 'call_1', name: 'rename_symbol', arguments: '{"uri":"file:///test.ts","line":0,"character":0,"newName":"foo"}' },
    ]);
    const stopStream = createMockStream([
      { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] },
    ]);
    mockClient.chatStream
      .mockReturnValueOnce(toolStream)
      .mockReturnValueOnce(stopStream);
    mockToolExecutor.execute.mockResolvedValue({ success: true, message: 'Renamed' });

    const postMessages: ExtensionMessage[] = [];

    // Start without awaiting — we need to interject with the approval
    const sendPromise = handler.handleMessage(
      { type: 'sendMessage', content: 'rename foo', model: 'gpt-4' },
      (msg) => postMessages.push(msg)
    );

    // Poll until approval request is posted
    await vi.waitFor(() => {
      expect(postMessages.some((m) => m.type === 'toolApprovalRequest')).toBe(true);
    }, { timeout: 1000 });

    const req = postMessages.find((m) => m.type === 'toolApprovalRequest') as Extract<ExtensionMessage, { type: 'toolApprovalRequest' }>;

    // Respond with approval
    await handler.handleMessage(
      { type: 'toolApprovalResponse', requestId: req.requestId, approved: true },
      () => {}
    );

    await sendPromise;

    expect(mockToolExecutor.execute).toHaveBeenCalledWith('rename_symbol', expect.any(Object));
  });

  it('skips execution and returns "User denied" when denied', async () => {
    const toolStream = createToolCallStream([
      { id: 'call_1', name: 'insert_code', arguments: '{"uri":"file:///test.ts","line":0,"character":0,"code":"// hello"}' },
    ]);
    const stopStream = createMockStream([
      { choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] },
    ]);
    mockClient.chatStream
      .mockReturnValueOnce(toolStream)
      .mockReturnValueOnce(stopStream);

    const postMessages: ExtensionMessage[] = [];

    const sendPromise = handler.handleMessage(
      { type: 'sendMessage', content: 'insert comment', model: 'gpt-4' },
      (msg) => postMessages.push(msg)
    );

    await vi.waitFor(() => {
      expect(postMessages.some((m) => m.type === 'toolApprovalRequest')).toBe(true);
    }, { timeout: 1000 });

    const req = postMessages.find((m) => m.type === 'toolApprovalRequest') as Extract<ExtensionMessage, { type: 'toolApprovalRequest' }>;

    await handler.handleMessage(
      { type: 'toolApprovalResponse', requestId: req.requestId, approved: false },
      () => {}
    );

    await sendPromise;

    expect(mockToolExecutor.execute).not.toHaveBeenCalled();
    // Verify the tool result sent to LLM says denied
    const secondCallMessages = mockClient.chatStream.mock.calls[1][0].messages;
    const toolResultMsg = secondCallMessages.find((m: any) => m.role === 'tool');
    expect(toolResultMsg.content).toContain('denied');
  });

  it('does not require approval for non-gated tools like format_document', async () => {
    const toolStream = createToolCallStream([
      { id: 'call_1', name: 'format_document', arguments: '{"uri":"file:///test.ts"}' },
    ]);
    const stopStream = createMockStream([
      { choices: [{ delta: { content: 'formatted' }, finish_reason: 'stop' }] },
    ]);
    mockClient.chatStream
      .mockReturnValueOnce(toolStream)
      .mockReturnValueOnce(stopStream);
    mockToolExecutor.execute.mockResolvedValue({ success: true, message: 'Formatted' });

    const postMessages: ExtensionMessage[] = [];
    await handler.handleMessage(
      { type: 'sendMessage', content: 'format file', model: 'gpt-4' },
      (msg) => postMessages.push(msg)
    );

    expect(postMessages.some((m) => m.type === 'toolApprovalRequest')).toBe(false);
    expect(mockToolExecutor.execute).toHaveBeenCalledWith('format_document', expect.any(Object));
  });

  it('clears pending approvals when abort() is called', async () => {
    const resolved: boolean[] = [];
    // Manually add a pending approval
    const requestId = 'test-id';
    (handler as any).pendingApprovals.set(requestId, (v: boolean) => resolved.push(v));

    handler.abort();

    expect(resolved).toEqual([false]);
    expect((handler as any).pendingApprovals.size).toBe(0);
  });
});
```

**Step 2: Run tests to verify they fail**

```
npx vitest run src/chat/message-handler.test.ts
```

Expected: 4 new tests fail.

**Step 3: Add `pendingApprovals` field and constant**

In `message-handler.ts`, after the `onStreamEnd?: () => void;` field, add:

```ts
private readonly pendingApprovals = new Map<string, (approved: boolean) => void>();

private static readonly GATED_TOOLS = new Set([
  'rename_symbol',
  'insert_code',
  'replace_range',
  'apply_code_action',
]);
```

**Step 4: Add `requestToolApproval()` private method**

Add this method just before `truncateToolOutput`:

```ts
private requestToolApproval(
  toolName: string,
  args: Record<string, unknown>,
  postMessage: (msg: ExtensionMessage) => void
): Promise<boolean> {
  const requestId = `approval-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve) => {
    this.pendingApprovals.set(requestId, resolve);
    postMessage({ type: 'toolApprovalRequest', requestId, toolName, args });
  });
}
```

**Step 5: Add `toolApprovalResponse` case to `handleMessage`**

In the `switch (message.type)` block in `handleMessage`, add after the `'confirmApply'` case:

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

**Step 6: Add approval intercept in the tool execution loop**

In `handleSendMessage`, find the `for (const tc of toolCalls)` loop. After the `if (parseError)` block and before `const result = await this.toolExecutor.execute(...)`, add:

```ts
if (MessageHandler.GATED_TOOLS.has(tc.function.name)) {
  const approved = await this.requestToolApproval(tc.function.name, args, postMessage);
  if (!approved) {
    this.conversationMessages.push({
      role: 'tool',
      tool_call_id: tc.id,
      content: 'User denied this action.',
    });
    continue;
  }
}
```

**Step 7: Clear pending approvals in `abort()`**

Update the `abort()` method:

```ts
abort(): void {
  this.abortController?.abort();
  for (const resolve of this.pendingApprovals.values()) {
    resolve(false);
  }
  this.pendingApprovals.clear();
}
```

**Step 8: Run all tests**

```
npx vitest run
```

Expected: all tests pass.

**Step 9: Commit**

```bash
git add src/chat/message-handler.ts src/chat/message-handler.test.ts
git commit -m "feat: add HITL inline approval for destructive LLM tool calls"
```

---

### Task 6: Create `ToolCallCard` webview component

**Files:**
- Create: `webview/src/components/ToolCallCard.tsx`

**Step 1: Create the component**

```tsx
import { Component, Show } from 'solid-js';
import { getVsCodeApi } from '../utils/vscode-api';

export interface ToolApprovalData {
  requestId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: 'pending' | 'approved' | 'denied';
}

interface ToolCallCardProps {
  approval: ToolApprovalData;
  onRespond: (requestId: string, approved: boolean) => void;
}

const ToolCallCard: Component<ToolCallCardProps> = (props) => {
  const argsPreview = () => {
    const entries = Object.entries(props.approval.args);
    return entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
  };

  return (
    <div class={`tool-call-card tool-call-card--${props.approval.status}`}>
      <div class="tool-call-header">
        <span class="tool-call-icon">🔧</span>
        <span class="tool-call-name">{props.approval.toolName}</span>
        <Show when={props.approval.status !== 'pending'}>
          <span class={`tool-call-badge tool-call-badge--${props.approval.status}`}>
            {props.approval.status === 'approved' ? 'Allowed' : 'Denied'}
          </span>
        </Show>
      </div>
      <pre class="tool-call-args">{argsPreview()}</pre>
      <Show when={props.approval.status === 'pending'}>
        <div class="tool-call-actions">
          <button
            class="tool-call-btn tool-call-btn--allow"
            onClick={() => props.onRespond(props.approval.requestId, true)}
          >
            Allow
          </button>
          <button
            class="tool-call-btn tool-call-btn--deny"
            onClick={() => props.onRespond(props.approval.requestId, false)}
          >
            Deny
          </button>
        </div>
      </Show>
    </div>
  );
};

export default ToolCallCard;
```

**Step 2: Build to verify no TypeScript errors**

```
npm run build --prefix webview
```

Expected: builds successfully.

**Step 3: Commit**

```bash
git add webview/src/components/ToolCallCard.tsx
git commit -m "feat: add ToolCallCard component for inline tool approval"
```

---

### Task 7: Wire tool approval into webview store and App.tsx

**Files:**
- Modify: `webview/src/stores/chat.ts`
- Modify: `webview/src/App.tsx`
- Modify: `webview/src/components/ChatMessage.tsx`

**Step 1: Update `ChatMessage` interface in `chat.ts`**

In `webview/src/stores/chat.ts`, update the `ChatMessage` interface:

```ts
export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool_approval';
  content: string;
  isStreaming?: boolean;
  toolApproval?: {
    requestId: string;
    toolName: string;
    args: Record<string, unknown>;
    status: 'pending' | 'approved' | 'denied';
  };
}
```

**Step 2: Add `handleToolApprovalRequest` and `resolveToolApproval` to `createChatStore`**

In `chat.ts`, add these two functions inside `createChatStore`, after `handleStreamEnd`:

```ts
function handleToolApprovalRequest(
  requestId: string,
  toolName: string,
  args: Record<string, unknown>
) {
  setMessages((prev) => [
    ...prev,
    {
      role: 'tool_approval' as const,
      content: '',
      toolApproval: { requestId, toolName, args, status: 'pending' },
    },
  ]);
}

function resolveToolApproval(requestId: string, approved: boolean) {
  setMessages((prev) =>
    prev.map((m) =>
      m.toolApproval?.requestId === requestId
        ? { ...m, toolApproval: { ...m.toolApproval!, status: approved ? 'approved' : 'denied' } }
        : m
    )
  );
  vscode.postMessage({ type: 'toolApprovalResponse', requestId, approved });
}
```

Also add both to the returned object at the bottom of `createChatStore`.

**Step 3: Handle `toolApprovalRequest` in `App.tsx`**

In `App.tsx`, inside the `window.addEventListener('message', ...)` switch statement, add after the `'showDiff'` case:

```ts
case 'toolApprovalRequest':
  chatStore.handleToolApprovalRequest(message.requestId, message.toolName, message.args);
  break;
```

**Step 4: Update `ChatMessage.tsx` to render tool approval cards**

In `webview/src/components/ChatMessage.tsx`, add the import and render branch:

At the top, add:
```ts
import ToolCallCard from './ToolCallCard';
import type { ToolApprovalData } from './ToolCallCard';
```

Update the component to handle the `tool_approval` role. Replace the outer `div` return with:

```tsx
const ChatMessage: Component<ChatMessageProps> = (props) => {
  const parts = createMemo(() => parseContent(props.message.content));

  // Render tool approval card inline
  if (props.message.role === 'tool_approval' && props.message.toolApproval) {
    return (
      <ToolCallCard
        approval={props.message.toolApproval as ToolApprovalData}
        onRespond={(requestId, approved) => {
          // Forward to store via custom event (avoids prop drilling)
          window.dispatchEvent(new CustomEvent('tool-approval', { detail: { requestId, approved } }));
        }}
      />
    );
  }

  return (
    <div class={`chat-message ${props.message.role}`}>
      <div class="message-role">{props.message.role === 'user' ? 'You' : 'Assistant'}</div>
      <div class="message-content">
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
};
```

**Step 5: Wire the custom event in `App.tsx`**

Inside `onMount` in `App.tsx`, after `vscode.postMessage({ type: 'ready' })`, add:

```ts
window.addEventListener('tool-approval', (e: Event) => {
  const { requestId, approved } = (e as CustomEvent).detail;
  chatStore.resolveToolApproval(requestId, approved);
});
```

**Step 6: Build the webview**

```
npm run build --prefix webview
```

Expected: builds successfully with no TypeScript errors.

**Step 7: Commit**

```bash
git add webview/src/stores/chat.ts webview/src/App.tsx webview/src/components/ChatMessage.tsx
git commit -m "feat: wire inline tool approval cards into webview chat flow"
```

---

### Task 8: Update `docs/features.md`

**Files:**
- Modify: `docs/features.md`

**Step 1: Update test count and mark features as implemented**

1. In the `## Testing` section, update the test count from 156 to ~170 (156 + 13 new tests from Tasks 2-5).

2. In `## Code Intelligence (LSP Integration)`, add two new rows:

```
| :white_check_mark: | Grep fallback | Search file contents via regex when LSP returns no results | 3 |
| :white_check_mark: | Glob fallback | Find files by pattern when LSP cannot enumerate files | 3 |
```

3. In `## Editor Capability Hints`, update the `Tool-use` rows and add web tools:

```
| :white_check_mark: | Tool-use: web search | LLM can search the web via DuckDuckGo (no API key required) | - |
| :white_check_mark: | Tool-use: fetch URL | LLM can fetch any URL as Markdown via Jina AI reader | - |
| :white_check_mark: | Tool-use: HTTP request | LLM can make GET/POST/PUT/DELETE requests to local or remote APIs | - |
| :white_check_mark: | HITL tool approval | Destructive tool calls show inline approval card; user allows or denies | - |
| :white_check_mark: | Large output offloading | Tool results over 8,000 chars are truncated; full result saved to tmpfile | - |
```

4. In `### P2 — Soon`, add backlog entry for premium search:

```
| :construction: | **Premium web search** | Optional Tavily/Brave/Serper API key in settings for higher-quality search results | XS |
```

**Step 2: Run all tests one final time**

```
npx vitest run
```

Expected: all tests pass.

**Step 3: Commit**

```bash
git add docs/features.md
git commit -m "docs: mark S-tools features as implemented in features.md"
```
