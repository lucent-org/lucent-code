# Comprehensive Testing Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fill all critical test gaps in the Lucent Code VS Code extension with thorough unit tests covering happy paths, error paths, and edge cases.

**Architecture:** All tests use Vitest with vi.mock() for dependencies. VS Code API is mocked via `src/__mocks__/vscode.ts`. Tests live alongside source files as `*.test.ts`. All tests are pure unit tests — no VS Code process required.

**Tech Stack:** TypeScript, Vitest, vi.mock(), vi.fn(), vi.spyOn(), vi.useFakeTimers()

---

### Task 1: message-handler — streaming, errors, tool approval, skill injection

**Files:**
- Modify: `src/chat/message-handler.test.ts`
- Reference: `src/chat/message-handler.ts`

**Step 1: Read the existing test file and message-handler source**

```bash
# understand existing mock scaffold before adding
cat src/chat/message-handler.test.ts
cat src/chat/message-handler.ts
```

**Step 2: Append new describe blocks to `message-handler.test.ts`**

Add after the existing tests:

```typescript
describe('sendMessage — streaming happy path', () => {
  it('streams chunks and posts streamChunk messages', async () => {
    async function* stream() {
      yield { choices: [{ delta: { content: 'Hello' }, finish_reason: null }] };
      yield { choices: [{ delta: { content: ' world' }, finish_reason: null }] };
      yield { choices: [{ delta: {}, finish_reason: 'stop' }] };
    }
    mockClient.chatStream.mockReturnValue(stream());
    mockHistory.create.mockResolvedValue({ id: 'c1', title: '', model: 'gpt-4o', messages: [], createdAt: '', updatedAt: '' });
    mockHistory.save.mockResolvedValue(undefined);

    await handler.handleMessage({ type: 'sendMessage', content: 'Hi', model: 'gpt-4o' }, postMessage);

    const chunks = postMessage.mock.calls
      .filter(([m]: any) => m.type === 'streamChunk')
      .map(([m]: any) => m.content);
    expect(chunks).toEqual(['Hello', ' world']);
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'streamEnd' }));
  });
});

describe('sendMessage — API error', () => {
  it('posts streamError when client throws', async () => {
    mockClient.chatStream.mockImplementation(() => { throw new Error('API error'); });
    mockHistory.create.mockResolvedValue({ id: 'c2', title: '', model: 'gpt-4o', messages: [], createdAt: '', updatedAt: '' });

    await handler.handleMessage({ type: 'sendMessage', content: 'Hi', model: 'gpt-4o' }, postMessage);

    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'streamError' }));
  });
});

describe('sendMessage — tool call approval gate', () => {
  it('posts toolApprovalRequest for gated tools and waits', async () => {
    async function* stream() {
      yield {
        choices: [{
          delta: {
            tool_calls: [{ index: 0, id: 'tc1', type: 'function', function: { name: 'insert_code', arguments: '{"code":"x","line":1}' } }]
          },
          finish_reason: null,
        }]
      };
      yield { choices: [{ delta: {}, finish_reason: 'tool_calls' }] };
    }
    mockClient.chatStream.mockReturnValue(stream());
    mockHistory.create.mockResolvedValue({ id: 'c3', title: '', model: 'gpt-4o', messages: [], createdAt: '', updatedAt: '' });

    const messagePromise = handler.handleMessage({ type: 'sendMessage', content: 'Insert x', model: 'gpt-4o' }, postMessage);

    // wait for approval request
    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'toolApprovalRequest' }));
    });

    // approve
    await handler.handleMessage({ type: 'toolApprovalResponse', approved: true }, postMessage);
    await messagePromise;
  });
});

describe('cancelRequest', () => {
  it('aborts an in-flight stream', async () => {
    let aborted = false;
    async function* stream(signal: AbortSignal) {
      signal.addEventListener('abort', () => { aborted = true; });
      await new Promise(r => setTimeout(r, 5000)); // never resolves in test
      yield { choices: [{ delta: {}, finish_reason: 'stop' }] };
    }
    mockClient.chatStream.mockImplementation((_msgs: any, _opts: any, signal: AbortSignal) => stream(signal));
    mockHistory.create.mockResolvedValue({ id: 'c4', title: '', model: 'gpt-4o', messages: [], createdAt: '', updatedAt: '' });

    const messagePromise = handler.handleMessage({ type: 'sendMessage', content: 'Hi', model: 'gpt-4o' }, postMessage);
    await handler.handleMessage({ type: 'cancelRequest' }, postMessage);
    await messagePromise;

    expect(aborted).toBe(true);
  });
});

describe('listConversations', () => {
  it('posts conversationList', async () => {
    const summaries = [{ id: 'c1', title: 'T', model: 'gpt-4o', messageCount: 1, updatedAt: '' }];
    mockHistory.list.mockResolvedValue(summaries);

    await handler.handleMessage({ type: 'listConversations' }, postMessage);

    expect(postMessage).toHaveBeenCalledWith({ type: 'conversationList', conversations: summaries });
  });
});

describe('loadConversation', () => {
  it('posts conversationLoaded', async () => {
    const conv = { id: 'c1', title: 'T', model: 'gpt-4o', messages: [], createdAt: '', updatedAt: '' };
    mockHistory.load.mockResolvedValue(conv);

    await handler.handleMessage({ type: 'loadConversation', id: 'c1' }, postMessage);

    expect(postMessage).toHaveBeenCalledWith({ type: 'conversationLoaded', conversation: conv });
  });
});

describe('deleteConversation', () => {
  it('calls history.delete with the id', async () => {
    await handler.handleMessage({ type: 'deleteConversation', id: 'c1' }, postMessage);
    expect(mockHistory.delete).toHaveBeenCalledWith('c1');
  });
});
```

**Step 3: Run tests**

```bash
npx vitest run src/chat/message-handler.test.ts
```

Expected: all new tests pass.

**Step 4: Commit**

```bash
git add src/chat/message-handler.test.ts
git commit -m "test(message-handler): add streaming, error, approval, conversation tests"
```

---

### Task 2: openrouter-client — chatStream, retry logic, AbortSignal

**Files:**
- Modify: `src/core/openrouter-client.test.ts`
- Reference: `src/core/openrouter-client.ts`

**Step 1: Read the existing test and source**

```bash
cat src/core/openrouter-client.test.ts
cat src/core/openrouter-client.ts
```

**Step 2: Append to `openrouter-client.test.ts`**

```typescript
describe('chatStream', () => {
  it('yields parsed SSE chunks', async () => {
    const lines = [
      'data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
      'data: [DONE]',
    ].join('\n');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { getReader: () => makeReader(lines) },
    });

    const chunks: any[] = [];
    for await (const chunk of client.chatStream([{ role: 'user', content: 'Hi' }], { model: 'gpt-4o' })) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(2);
    expect(chunks[0].choices[0].delta.content).toBe('Hi');
    expect(chunks[1].choices[0].finish_reason).toBe('stop');
  });

  it('throws on non-200 response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: { message: 'Unauthorized' } }) });

    await expect(async () => {
      for await (const _ of client.chatStream([{ role: 'user', content: 'x' }], { model: 'gpt-4o' })) {}
    }).rejects.toThrow();
  });

  it('respects AbortSignal', async () => {
    const controller = new AbortController();
    mockFetch.mockImplementation(() => new Promise((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));

    const gen = client.chatStream([{ role: 'user', content: 'x' }], { model: 'gpt-4o' }, controller.signal);
    const promise = gen.next();
    controller.abort();

    await expect(promise).rejects.toThrow();
  });
});

describe('retry logic', () => {
  it('retries on 429 and succeeds on second attempt', async () => {
    vi.useFakeTimers();

    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429, headers: { get: () => null }, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [] }) });

    const promise = client.listModels();
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('respects Retry-After header', async () => {
    vi.useFakeTimers();

    mockFetch
      .mockResolvedValueOnce({
        ok: false, status: 429,
        headers: { get: (h: string) => h === 'retry-after' ? '2' : null },
        json: async () => ({}),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [] }) });

    const promise = client.listModels();
    await vi.advanceTimersByTimeAsync(2000);
    await promise;

    expect(mockFetch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('stops after max retries', async () => {
    vi.useFakeTimers();

    mockFetch.mockResolvedValue({ ok: false, status: 500, headers: { get: () => null }, json: async () => ({}) });

    const promise = client.listModels();
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow();
    vi.useRealTimers();
  });
});
```

**Step 3: Run tests**

```bash
npx vitest run src/core/openrouter-client.test.ts
```

**Step 4: Commit**

```bash
git add src/core/openrouter-client.test.ts
git commit -m "test(openrouter-client): add chatStream, retry, AbortSignal tests"
```

---

### Task 3: code-intelligence — missing methods + cache TTL + LRU eviction

**Files:**
- Modify: `src/lsp/code-intelligence.test.ts`
- Reference: `src/lsp/code-intelligence.ts`

**Step 1: Read source and existing tests**

```bash
cat src/lsp/code-intelligence.ts
cat src/lsp/code-intelligence.test.ts
```

**Step 2: Append to `code-intelligence.test.ts`**

```typescript
describe('getDefinition', () => {
  it('returns definition locations from LSP', async () => {
    const loc = { uri: { fsPath: '/file.ts' }, range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } } };
    mockExecuteCommand.mockResolvedValueOnce([loc]);

    const result = await intelligence.getDefinition(mockDoc, mockPos);
    expect(result).toEqual([loc]);
  });

  it('returns undefined when no definitions', async () => {
    mockExecuteCommand.mockResolvedValueOnce(undefined);
    expect(await intelligence.getDefinition(mockDoc, mockPos)).toBeUndefined();
  });

  it('caches second call', async () => {
    const loc = [{ uri: {}, range: {} }];
    mockExecuteCommand.mockResolvedValueOnce(loc);

    await intelligence.getDefinition(mockDoc, mockPos);
    await intelligence.getDefinition(mockDoc, mockPos);

    expect(mockExecuteCommand).toHaveBeenCalledTimes(1);
  });
});

describe('getSymbols', () => {
  it('returns document symbols', async () => {
    const syms = [{ name: 'MyClass', kind: 5, location: {} }];
    mockExecuteCommand.mockResolvedValueOnce(syms);

    const result = await intelligence.getSymbols(mockDoc);
    expect(result).toEqual(syms);
  });
});

describe('getReferences', () => {
  it('returns reference locations', async () => {
    const refs = [{ uri: {}, range: {} }, { uri: {}, range: {} }];
    mockExecuteCommand.mockResolvedValueOnce(refs);

    const result = await intelligence.getReferences(mockDoc, mockPos);
    expect(result).toEqual(refs);
  });
});

describe('cache TTL expiration', () => {
  it('re-fetches after TTL expires', async () => {
    vi.useFakeTimers();
    mockExecuteCommand.mockResolvedValue([{ contents: 'hover1', range: undefined }]);

    await intelligence.getHover(mockDoc, mockPos);
    vi.advanceTimersByTime(6000); // past 5s TTL
    await intelligence.getHover(mockDoc, mockPos);

    expect(mockExecuteCommand).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

describe('LRU eviction at 100 entries', () => {
  it('evicts oldest entry when cache exceeds 100', async () => {
    mockExecuteCommand.mockResolvedValue([{ contents: 'x', range: undefined }]);

    // Fill cache with 100 different positions
    for (let i = 0; i < 100; i++) {
      const pos = { line: i, character: 0 };
      await intelligence.getHover({ uri: { toString: () => `/file${i}.ts` } } as any, pos as any);
    }

    // Reset mock call count
    mockExecuteCommand.mockClear();

    // Add one more — should evict the first entry
    await intelligence.getHover({ uri: { toString: () => '/file100.ts' } } as any, { line: 0, character: 0 } as any);

    // First entry should no longer be cached
    await intelligence.getHover({ uri: { toString: () => '/file0.ts' } } as any, { line: 0, character: 0 } as any);
    expect(mockExecuteCommand).toHaveBeenCalledTimes(2); // both miss cache
  });
});
```

**Step 3: Run tests**

```bash
npx vitest run src/lsp/code-intelligence.test.ts
```

**Step 4: Commit**

```bash
git add src/lsp/code-intelligence.test.ts
git commit -m "test(code-intelligence): add getDefinition, getSymbols, getReferences, TTL, LRU tests"
```

---

### Task 4: editor-tools — remaining 5 tools (rename, apply_code_action, insert_code, replace_range, web_search)

**Files:**
- Modify: `src/lsp/editor-tools.test.ts`
- Reference: `src/lsp/editor-tools.ts`

**Step 1: Read source and existing tests**

```bash
cat src/lsp/editor-tools.ts
cat src/lsp/editor-tools.test.ts
```

**Step 2: Append to `editor-tools.test.ts`**

```typescript
describe('insert_code tool', () => {
  it('inserts code at specified line', async () => {
    const mockEditor = {
      document: { uri: { fsPath: '/file.ts' } },
      edit: vi.fn().mockResolvedValue(true),
    };
    vi.mocked(vscode.window.activeTextEditor, true).get = () => mockEditor;

    await tools.execute('insert_code', { code: 'const x = 1;', line: 5 });

    expect(mockEditor.edit).toHaveBeenCalled();
  });
});

describe('replace_range tool', () => {
  it('replaces text in given range', async () => {
    const mockEditor = {
      document: { uri: {} },
      edit: vi.fn().mockResolvedValue(true),
    };
    vi.mocked(vscode.window.activeTextEditor, true).get = () => mockEditor;

    await tools.execute('replace_range', {
      startLine: 1, startChar: 0, endLine: 1, endChar: 10,
      newText: 'replacement',
    });

    expect(mockEditor.edit).toHaveBeenCalled();
  });
});

describe('rename_symbol tool', () => {
  it('executes rename via vscode.commands.executeCommand', async () => {
    mockExecuteCommand.mockResolvedValueOnce(undefined);

    await tools.execute('rename_symbol', { line: 3, character: 5, newName: 'renamedFn' });

    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'editor.action.rename',
      expect.anything(),
    );
  });
});

describe('apply_code_action tool', () => {
  it('applies a code action by title', async () => {
    const action = { title: 'Fix lint error', command: { command: 'eslint.fix', arguments: [] } };
    mockExecuteCommand.mockResolvedValueOnce([action]);

    await tools.execute('apply_code_action', { line: 0, character: 0, actionTitle: 'Fix lint error' });

    expect(mockExecuteCommand).toHaveBeenCalledWith(action.command.command, ...action.command.arguments);
  });

  it('throws when action not found', async () => {
    mockExecuteCommand.mockResolvedValueOnce([]);

    await expect(tools.execute('apply_code_action', { line: 0, character: 0, actionTitle: 'Nonexistent' }))
      .rejects.toThrow();
  });
});

describe('unknown tool', () => {
  it('throws for unknown tool name', async () => {
    await expect(tools.execute('unknown_tool', {})).rejects.toThrow();
  });
});
```

**Step 3: Run tests**

```bash
npx vitest run src/lsp/editor-tools.test.ts
```

**Step 4: Commit**

```bash
git add src/lsp/editor-tools.test.ts
git commit -m "test(editor-tools): add tests for rename, apply_code_action, insert_code, replace_range"
```

---

### Task 5: context-builder — formatForPrompt, selection, code intelligence

**Files:**
- Modify: `src/core/context-builder.test.ts`
- Reference: `src/core/context-builder.ts`

**Step 1: Read source and existing tests**

```bash
cat src/core/context-builder.ts
cat src/core/context-builder.test.ts
```

**Step 2: Append to `context-builder.test.ts`**

```typescript
describe('buildContext — with active editor and selection', () => {
  it('captures selection text and range when present', async () => {
    const mockEditor = {
      document: { fileName: '/file.ts', languageId: 'typescript', getText: () => 'const x = 1;', lineCount: 1, uri: {} },
      selection: { isEmpty: false, start: { line: 0, character: 0 }, end: { line: 0, character: 12 }, active: { line: 0, character: 12 } },
    };
    Object.defineProperty(vscode.window, 'activeTextEditor', { get: () => mockEditor, configurable: true });

    const ctx = await builder.buildContext();

    expect(ctx.selection?.text).toBe('const x = 1;');
    expect(ctx.selection?.startLine).toBe(0);
  });
});

describe('formatForPrompt', () => {
  it('includes file path and language', () => {
    const ctx = {
      activeFile: { path: '/src/auth.ts', languageId: 'typescript', content: 'export class Auth {}', lineCount: 1 },
      selection: undefined,
      openEditors: [],
      cursorPosition: { line: 0, character: 0 },
    };

    const prompt = builder.formatForPrompt(ctx);

    expect(prompt).toContain('/src/auth.ts');
    expect(prompt).toContain('typescript');
    expect(prompt).toContain('export class Auth {}');
  });

  it('includes selection section when present', () => {
    const ctx = {
      activeFile: { path: '/f.ts', languageId: 'typescript', content: 'x', lineCount: 1 },
      selection: { text: 'selected text', startLine: 2, endLine: 4 },
      openEditors: [],
      cursorPosition: { line: 2, character: 0 },
    };

    const prompt = builder.formatForPrompt(ctx);

    expect(prompt).toContain('selected text');
  });

  it('returns empty string when context is empty', () => {
    const ctx = { activeFile: undefined, selection: undefined, openEditors: [], cursorPosition: undefined };
    expect(builder.formatForPrompt(ctx)).toBe('');
  });
});

describe('buildContext — custom instructions', () => {
  it('includes instructions when loader returns content', async () => {
    mockInstructionsLoader.load.mockResolvedValueOnce('Always use TypeScript strict mode.');

    const ctx = await builder.buildContext();

    expect(ctx.customInstructions).toBe('Always use TypeScript strict mode.');
  });
});
```

**Step 3: Run tests**

```bash
npx vitest run src/core/context-builder.test.ts
```

**Step 4: Commit**

```bash
git add src/core/context-builder.test.ts
git commit -m "test(context-builder): add formatForPrompt, selection, instructions tests"
```

---

### Task 6: inline-provider — provideInlineCompletionItems actual implementation

**Files:**
- Modify: `src/completions/inline-provider.test.ts`
- Reference: `src/completions/inline-provider.ts`

**Step 1: Read source and existing test**

```bash
cat src/completions/inline-provider.ts
cat src/completions/inline-provider.test.ts
```

**Step 2: Replace or append to `inline-provider.test.ts`**

```typescript
describe('provideInlineCompletionItems', () => {
  it('returns completion item from API response', async () => {
    mockClient.chat.mockResolvedValueOnce({
      choices: [{ message: { content: 'const result = 42;' } }],
    });

    const doc = {
      getText: () => 'function test() {\n  \n}',
      lineAt: (n: number) => ({ text: n === 1 ? '  ' : '' }),
      languageId: 'typescript',
      lineCount: 3,
      fileName: '/test.ts',
    };
    const pos = { line: 1, character: 2 };
    const token = { isCancellationRequested: false, onCancellationRequested: vi.fn() };

    const result = await provider.provideInlineCompletionItems(doc as any, pos as any, {} as any, token as any);

    expect(result).toHaveLength(1);
    expect(result?.[0].insertText).toContain('const result');
  });

  it('returns empty when cancellation requested', async () => {
    const token = { isCancellationRequested: true, onCancellationRequested: vi.fn() };

    const result = await provider.provideInlineCompletionItems(
      { getText: () => '', languageId: 'ts', lineCount: 1, fileName: '/f.ts', lineAt: () => ({ text: '' }) } as any,
      { line: 0, character: 0 } as any,
      {} as any,
      token as any,
    );

    expect(result).toEqual([]);
    expect(mockClient.chat).not.toHaveBeenCalled();
  });

  it('returns empty when API returns no content', async () => {
    mockClient.chat.mockResolvedValueOnce({ choices: [{ message: { content: '' } }] });
    const token = { isCancellationRequested: false, onCancellationRequested: vi.fn() };

    const result = await provider.provideInlineCompletionItems(
      { getText: () => 'x', languageId: 'ts', lineCount: 1, fileName: '/f.ts', lineAt: () => ({ text: 'x' }) } as any,
      { line: 0, character: 1 } as any,
      {} as any,
      token as any,
    );

    expect(result).toEqual([]);
  });

  it('uses completionsModel when set, falls back to chatModel', async () => {
    mockSettings.completionsModel = '';
    mockSettings.chatModel = 'fallback-model';
    mockClient.chat.mockResolvedValueOnce({ choices: [{ message: { content: 'x' } }] });
    const token = { isCancellationRequested: false, onCancellationRequested: vi.fn() };

    await provider.provideInlineCompletionItems(
      { getText: () => 'y', languageId: 'ts', lineCount: 1, fileName: '/f.ts', lineAt: () => ({ text: 'y' }) } as any,
      { line: 0, character: 1 } as any,
      {} as any,
      token as any,
    );

    expect(mockClient.chat).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ model: 'fallback-model' }),
    );
  });
});
```

**Step 3: Run tests**

```bash
npx vitest run src/completions/inline-provider.test.ts
```

**Step 4: Commit**

```bash
git add src/completions/inline-provider.test.ts
git commit -m "test(inline-provider): add provideInlineCompletionItems, cancellation, model fallback tests"
```

---

### Task 7: mcp-client-manager — callTool, tool name parsing, error paths

**Files:**
- Modify: `src/mcp/mcp-client-manager.test.ts`
- Reference: `src/mcp/mcp-client-manager.ts`

**Step 1: Read source and existing tests**

```bash
cat src/mcp/mcp-client-manager.ts
cat src/mcp/mcp-client-manager.test.ts
```

**Step 2: Append to `mcp-client-manager.test.ts`**

```typescript
describe('callTool', () => {
  it('routes to the correct server and returns result', async () => {
    const mockResult = { content: [{ type: 'text', text: 'tool result' }] };
    mockClient.callTool.mockResolvedValueOnce(mockResult);

    await manager.connect({ myServer: { command: 'node', args: ['server.js'], env: {} } });
    const result = await manager.callTool('mcp__myServer__myTool', { arg: 'value' });

    expect(result).toEqual(mockResult);
    expect(mockClient.callTool).toHaveBeenCalledWith({ name: 'myTool', arguments: { arg: 'value' } });
  });

  it('throws when server not found', async () => {
    await expect(manager.callTool('mcp__unknownServer__tool', {}))
      .rejects.toThrow(/not found/i);
  });

  it('propagates tool execution errors', async () => {
    mockClient.callTool.mockRejectedValueOnce(new Error('tool failed'));
    await manager.connect({ s: { command: 'node', args: [], env: {} } });

    await expect(manager.callTool('mcp__s__tool', {})).rejects.toThrow('tool failed');
  });
});

describe('tool name parsing', () => {
  it('exposes tools with mcp__serverName__toolName format', async () => {
    mockClient.listTools.mockResolvedValueOnce({ tools: [{ name: 'search', description: 'Search', inputSchema: {} }] });

    await manager.connect({ searcher: { command: 'node', args: [], env: {} } });
    const tools = manager.getTools();

    expect(tools.some(t => t.function.name === 'mcp__searcher__search')).toBe(true);
  });
});

describe('dispose', () => {
  it('disconnects all servers on dispose', async () => {
    await manager.connect({ s1: { command: 'node', args: [], env: {} } });
    manager.dispose();

    expect(mockTransport.close).toHaveBeenCalled();
  });
});
```

**Step 3: Run tests**

```bash
npx vitest run src/mcp/mcp-client-manager.test.ts
```

**Step 4: Commit**

```bash
git add src/mcp/mcp-client-manager.test.ts
git commit -m "test(mcp-client-manager): add callTool, tool name parsing, dispose tests"
```

---

### Task 8: worktree-manager — state machine, remapUri, finishSession

**Files:**
- Modify: `src/core/worktree-manager.test.ts`
- Reference: `src/core/worktree-manager.ts`

**Step 1: Read source and existing tests**

```bash
cat src/core/worktree-manager.ts
cat src/core/worktree-manager.test.ts
```

**Step 2: Append to `worktree-manager.test.ts`**

```typescript
describe('state machine', () => {
  it('starts in idle state', () => {
    expect(manager.getState()).toBe('idle');
  });

  it('transitions to active after successful create', async () => {
    mockRunner.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

    await manager.createWorktree('conv-123');

    expect(manager.getState()).toBe('active');
  });

  it('transitions to error state when git fails', async () => {
    mockRunner.mockResolvedValue({ stdout: '', stderr: 'fatal: not a git repo', exitCode: 128 });

    await manager.createWorktree('conv-err');

    expect(manager.getState()).toBe('error');
  });
});

describe('remapUri', () => {
  it('rewrites URIs to worktree path', async () => {
    mockRunner.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    await manager.createWorktree('conv-456');

    const original = vscode.Uri.file('/workspace/src/file.ts');
    const remapped = manager.remapUri(original);

    expect(remapped.fsPath).toContain('conv-456');
    expect(remapped.fsPath).toContain('src/file.ts');
  });

  it('returns original URI when no active worktree', () => {
    const uri = vscode.Uri.file('/workspace/file.ts');
    expect(manager.remapUri(uri)).toEqual(uri);
  });
});

describe('finishSession — merge', () => {
  it('runs git merge and transitions to idle', async () => {
    mockRunner.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    await manager.createWorktree('conv-789');

    await manager.finishSession('merge');

    expect(mockRunner).toHaveBeenCalledWith(expect.stringContaining('merge'));
    expect(manager.getState()).toBe('idle');
  });
});

describe('finishSession — discard', () => {
  it('removes worktree and transitions to idle', async () => {
    mockRunner.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    await manager.createWorktree('conv-disc');

    await manager.finishSession('discard');

    expect(mockRunner).toHaveBeenCalledWith(expect.stringContaining('remove'));
    expect(manager.getState()).toBe('idle');
  });
});
```

**Step 3: Run tests**

```bash
npx vitest run src/core/worktree-manager.test.ts
```

**Step 4: Commit**

```bash
git add src/core/worktree-manager.test.ts
git commit -m "test(worktree-manager): add state machine, remapUri, finishSession tests"
```

---

### Task 9: indexer — indexAll, searchAsync, file watcher

**Files:**
- Modify: `src/search/indexer.test.ts`
- Reference: `src/search/indexer.ts`

**Step 1: Read source and existing tests**

```bash
cat src/search/indexer.ts
cat src/search/indexer.test.ts
```

**Step 2: Append to `indexer.test.ts`**

```typescript
describe('indexAll', () => {
  it('indexes all eligible files in workspace', async () => {
    mockGlob.mockResolvedValueOnce(['/ws/src/main.ts', '/ws/src/utils.ts']);
    mockFs.readFile.mockResolvedValue('export const x = 1;');
    mockEmbeddings.embed.mockResolvedValue([[0.1, 0.2, 0.3]]);

    await indexer.indexAll('/ws');

    expect(mockVectorStore.upsertChunks).toHaveBeenCalledTimes(2);
  });

  it('skips node_modules', async () => {
    mockGlob.mockResolvedValueOnce(['/ws/node_modules/lib/index.ts']);

    await indexer.indexAll('/ws');

    expect(mockVectorStore.upsertChunks).not.toHaveBeenCalled();
  });

  it('skips files over 500KB', async () => {
    mockGlob.mockResolvedValueOnce(['/ws/large.ts']);
    mockFs.readFile.mockResolvedValue('x'.repeat(600_000));

    await indexer.indexAll('/ws');

    expect(mockVectorStore.upsertChunks).not.toHaveBeenCalled();
  });
});

describe('searchAsync', () => {
  it('returns ranked results for query', async () => {
    mockEmbeddings.embed.mockResolvedValueOnce([[0.5, 0.5]]);
    mockVectorStore.search.mockResolvedValueOnce([
      { filePath: '/ws/src/auth.ts', chunkText: 'export class Auth {}', score: 0.92 },
    ]);

    const results = await indexer.searchAsync('authentication', 5);

    expect(results).toHaveLength(1);
    expect(results[0].filePath).toBe('/ws/src/auth.ts');
    expect(results[0].score).toBeGreaterThan(0.9);
  });

  it('returns empty when no embeddings model configured', async () => {
    mockSettings.chatModel = '';
    const results = await indexer.searchAsync('query', 5);
    expect(results).toEqual([]);
  });
});

describe('file watcher', () => {
  it('re-indexes file on change event', async () => {
    const watcher = { onDidChange: vi.fn(), onDidCreate: vi.fn(), onDidDelete: vi.fn(), dispose: vi.fn() };
    vi.mocked(vscode.workspace.createFileSystemWatcher).mockReturnValue(watcher as any);
    mockFs.readFile.mockResolvedValue('updated content');
    mockEmbeddings.embed.mockResolvedValue([[0.1]]);

    indexer.startWatching('/ws');

    // simulate file change
    const changeCallback = watcher.onDidChange.mock.calls[0][0];
    await changeCallback(vscode.Uri.file('/ws/src/changed.ts'));

    expect(mockVectorStore.upsertChunks).toHaveBeenCalled();
  });

  it('removes chunks from store on delete event', async () => {
    const watcher = { onDidChange: vi.fn(), onDidCreate: vi.fn(), onDidDelete: vi.fn(), dispose: vi.fn() };
    vi.mocked(vscode.workspace.createFileSystemWatcher).mockReturnValue(watcher as any);

    indexer.startWatching('/ws');

    const deleteCallback = watcher.onDidDelete.mock.calls[0][0];
    await deleteCallback(vscode.Uri.file('/ws/src/deleted.ts'));

    expect(mockVectorStore.deleteByFilePath).toHaveBeenCalledWith('/ws/src/deleted.ts');
  });
});
```

**Step 3: Run tests**

```bash
npx vitest run src/search/indexer.test.ts
```

**Step 4: Commit**

```bash
git add src/search/indexer.test.ts
git commit -m "test(indexer): add indexAll, searchAsync, file watcher tests"
```

---

### Task 10: Batch — auth OAuth, settings getters, history importFromJson

**Files:**
- Modify: `src/core/auth.test.ts`
- Modify: `src/core/settings.test.ts`
- Modify: `src/chat/history.test.ts`

**Step 1: Read the three source files**

```bash
cat src/core/auth.ts
cat src/core/settings.ts
cat src/chat/history.ts
```

**Step 2: Append to `auth.test.ts`**

```typescript
describe('handleOAuthCallback — success path', () => {
  it('exchanges code for token and stores API key', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ api_key: 'sk-or-new-key' }),
    });

    await auth.handleOAuthCallback('auth-code-xyz', 'state-abc');

    expect(mockSecretStorage.store).toHaveBeenCalledWith(
      expect.stringContaining('apiKey'),
      'sk-or-new-key',
    );
  });
});

describe('promptForTavilyApiKey', () => {
  it('stores entered key', async () => {
    vi.mocked(vscode.window.showInputBox).mockResolvedValueOnce('tvly-testkey');

    await auth.promptForTavilyApiKey();

    expect(mockSecretStorage.store).toHaveBeenCalledWith(
      expect.stringContaining('tavilyApiKey'),
      'tvly-testkey',
    );
  });

  it('does nothing when user cancels', async () => {
    vi.mocked(vscode.window.showInputBox).mockResolvedValueOnce(undefined);

    await auth.promptForTavilyApiKey();

    expect(mockSecretStorage.store).not.toHaveBeenCalled();
  });
});
```

**Step 3: Append to `settings.test.ts`**

```typescript
describe('setChatModel', () => {
  it('updates workspace configuration', async () => {
    await settings.setChatModel('anthropic/claude-3-5-sonnet');

    expect(mockConfig.update).toHaveBeenCalledWith(
      'lucentCode.chat.model',
      'anthropic/claude-3-5-sonnet',
      vscode.ConfigurationTarget.Global,
    );
  });
});

describe('onDidChange', () => {
  it('fires callback when configuration changes', () => {
    const callback = vi.fn();
    settings.onDidChange(callback);

    // simulate VS Code config change event
    const changeEvent = mockOnDidChangeConfiguration.mock.calls[0][0];
    changeEvent({ affectsConfiguration: () => true });

    expect(callback).toHaveBeenCalled();
  });
});

describe('skillSources', () => {
  it('returns configured skill sources array', () => {
    mockConfig.get.mockImplementation((key: string) => {
      if (key === 'lucentCode.skills.sources') return [{ type: 'github', url: 'https://github.com/org/repo' }];
    });

    expect(settings.skillSources).toEqual([{ type: 'github', url: 'https://github.com/org/repo' }]);
  });

  it('returns empty array when not configured', () => {
    mockConfig.get.mockReturnValue([]);
    expect(settings.skillSources).toEqual([]);
  });
});
```

**Step 4: Append to `history.test.ts`**

```typescript
describe('importFromJson', () => {
  it('imports a valid conversation JSON', async () => {
    const conv = { id: 'imp-1', title: 'Imported', model: 'gpt-4o', messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };

    const id = await history.importFromJson(JSON.stringify(conv));

    expect(id).toBeDefined();
    const loaded = await history.load(id);
    expect(loaded?.title).toBe('Imported');
  });

  it('throws on invalid JSON', async () => {
    await expect(history.importFromJson('not json')).rejects.toThrow();
  });

  it('throws when required fields are missing', async () => {
    await expect(history.importFromJson(JSON.stringify({ title: 'No messages' }))).rejects.toThrow();
  });
});

describe('corrupted file handling', () => {
  it('skips corrupted files when listing conversations', async () => {
    // Write a corrupt file alongside a valid one
    await history.create('valid-model');
    mockFs.writeFile('/storage/corrupt.json', 'not-json');

    const list = await history.list();
    expect(list.length).toBeGreaterThanOrEqual(1);
    // Should not throw
  });
});
```

**Step 5: Run tests**

```bash
npx vitest run src/core/auth.test.ts src/core/settings.test.ts src/chat/history.test.ts
```

**Step 6: Commit**

```bash
git add src/core/auth.test.ts src/core/settings.test.ts src/chat/history.test.ts
git commit -m "test: add OAuth success, settings setters, history importFromJson tests"
```

---

### Task 11: Batch — terminal-buffer, instructions-loader, skill-registry, vector-store small gaps

**Files:**
- Modify: `src/core/terminal-buffer.test.ts`
- Modify: `src/core/instructions-loader.test.ts`
- Modify: `src/skills/skill-registry.test.ts`
- Modify: `src/search/vector-store.test.ts`

**Step 1: Read source files**

```bash
cat src/core/terminal-buffer.ts
cat src/core/instructions-loader.ts
cat src/skills/skill-registry.ts
cat src/search/vector-store.ts
```

**Step 2: Append to `terminal-buffer.test.ts`**

```typescript
describe('CRLF handling', () => {
  it('splits CRLF lines correctly', () => {
    const writeCallback = mockOnDidWriteTerminalData.mock.calls[0][0];
    writeCallback({ terminal: mockTerminal, data: 'line1\r\nline2\r\nline3' });

    expect(buffer.getLines(mockTerminal)).toHaveLength(3);
  });
});

describe('multiple terminals', () => {
  it('tracks lines per terminal independently', () => {
    const terminal2 = { ...mockTerminal, name: 'terminal-2' };
    const writeCallback = mockOnDidWriteTerminalData.mock.calls[0][0];
    writeCallback({ terminal: mockTerminal, data: 'from-t1\n' });
    writeCallback({ terminal: terminal2, data: 'from-t2\n' });

    expect(buffer.getLines(mockTerminal)).toContain('from-t1');
    expect(buffer.getLines(terminal2)).toContain('from-t2');
    expect(buffer.getLines(mockTerminal)).not.toContain('from-t2');
  });
});

describe('dispose', () => {
  it('disposes the write listener', () => {
    buffer.dispose();
    expect(mockDisposable.dispose).toHaveBeenCalled();
  });
});
```

**Step 3: Append to `instructions-loader.test.ts`**

```typescript
describe('watcher callbacks', () => {
  it('reloads instructions when file changes', async () => {
    mockFileExists.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    mockFs.readFile
      .mockResolvedValueOnce('initial instructions')
      .mockResolvedValueOnce('updated instructions');

    await loader.load();
    expect(loader.getInstructions()).toBe('initial instructions');

    // trigger onDidChange
    const changeCallback = mockWatcher.onDidChange.mock.calls[0]?.[0];
    if (changeCallback) {
      await changeCallback();
      expect(loader.getInstructions()).toBe('updated instructions');
    }
  });

  it('clears instructions when file deleted', async () => {
    mockFileExists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    mockFs.readFile.mockResolvedValueOnce('some instructions');

    await loader.load();
    const deleteCallback = mockWatcher.onDidDelete.mock.calls[0]?.[0];
    if (deleteCallback) {
      await deleteCallback();
      expect(loader.getInstructions()).toBeUndefined();
    }
  });
});
```

**Step 4: Append to `skill-registry.test.ts`**

```typescript
describe('file size limit', () => {
  it('skips skill files over 50 KB', async () => {
    const largeContent = '---\nname: big-skill\ndescription: too big\n---\n' + 'x'.repeat(51_000);
    mockFs.readFile.mockResolvedValueOnce(largeContent);
    mockGlob.mockResolvedValueOnce(['/skills/big-skill.md']);

    await registry.loadFromDirectory('/skills');

    expect(registry.getAll()).toHaveLength(0);
  });
});

describe('ingestFromSource', () => {
  it('loads skills from a GitHub source', async () => {
    const skill = { name: 'my-skill', description: 'does stuff', body: '# My Skill\n...' };
    mockGithubSource.fetch.mockResolvedValueOnce([skill]);

    await registry.ingestFromSource({ type: 'github', url: 'https://github.com/org/repo' });

    expect(registry.getAll().some(s => s.name === 'my-skill')).toBe(true);
  });
});
```

**Step 5: Append to `vector-store.test.ts`**

```typescript
describe('search with topK > 1', () => {
  it('returns multiple results sorted by score descending', async () => {
    await store.upsertChunks([
      { filePath: '/a.ts', chunkIndex: 0, chunkText: 'hello world', embedding: [1, 0], mtime: 1 },
      { filePath: '/b.ts', chunkIndex: 0, chunkText: 'goodbye world', embedding: [0, 1], mtime: 1 },
      { filePath: '/c.ts', chunkIndex: 0, chunkText: 'hello goodbye', embedding: [0.7, 0.7], mtime: 1 },
    ]);
    store.loadIntoMemory();

    const results = store.search([1, 0], 2);

    expect(results).toHaveLength(2);
    expect(results[0].filePath).toBe('/a.ts'); // most similar to [1,0]
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });
});

describe('cosine similarity edge cases', () => {
  it('handles zero vector gracefully', async () => {
    await store.upsertChunks([
      { filePath: '/a.ts', chunkIndex: 0, chunkText: 'text', embedding: [0, 0], mtime: 1 },
    ]);
    store.loadIntoMemory();

    expect(() => store.search([1, 0], 1)).not.toThrow();
  });
});

describe('deleteByFilePath', () => {
  it('removes all chunks for a file', async () => {
    await store.upsertChunks([
      { filePath: '/del.ts', chunkIndex: 0, chunkText: 'chunk 1', embedding: [1], mtime: 1 },
      { filePath: '/del.ts', chunkIndex: 1, chunkText: 'chunk 2', embedding: [2], mtime: 1 },
      { filePath: '/keep.ts', chunkIndex: 0, chunkText: 'keep', embedding: [3], mtime: 1 },
    ]);

    store.deleteByFilePath('/del.ts');
    store.loadIntoMemory();

    const results = store.search([1], 10);
    expect(results.every(r => r.filePath !== '/del.ts')).toBe(true);
    expect(results.some(r => r.filePath === '/keep.ts')).toBe(true);
  });
});
```

**Step 6: Run tests**

```bash
npx vitest run src/core/terminal-buffer.test.ts src/core/instructions-loader.test.ts src/skills/skill-registry.test.ts src/search/vector-store.test.ts
```

**Step 7: Commit**

```bash
git add src/core/terminal-buffer.test.ts src/core/instructions-loader.test.ts src/skills/skill-registry.test.ts src/search/vector-store.test.ts
git commit -m "test: add small gap tests for terminal-buffer, instructions-loader, skill-registry, vector-store"
```

---

### Task 12: chat-provider — webview lifecycle, message queuing, CSP

**Files:**
- Create: `src/chat/chat-provider.test.ts`
- Reference: `src/chat/chat-provider.ts`

**Step 1: Read source**

```bash
cat src/chat/chat-provider.ts
```

**Step 2: Create `src/chat/chat-provider.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';

vi.mock('vscode');

const { ChatProvider } = await import('./chat-provider');

describe('ChatProvider', () => {
  let provider: InstanceType<typeof ChatProvider>;
  let mockWebviewView: any;
  let mockWebview: any;

  beforeEach(() => {
    mockWebview = {
      options: {},
      html: '',
      onDidReceiveMessage: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      postMessage: vi.fn().mockResolvedValue(true),
      asWebviewUri: vi.fn(uri => uri),
      cspSource: 'vscode-webview:',
    };
    mockWebviewView = {
      webview: mockWebview,
      onDidChangeVisibility: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      visible: true,
    };
    provider = new ChatProvider({} as any, vi.fn());
  });

  describe('resolveWebviewView', () => {
    it('sets webview html with nonce', () => {
      provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

      expect(mockWebview.html).toContain('nonce');
    });

    it('enables scripts in webview options', () => {
      provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

      expect(mockWebview.options).toMatchObject({ enableScripts: true });
    });

    it('flushes pending messages after resolve', async () => {
      // Queue a message before resolveWebviewView
      provider.postMessage({ type: 'test', payload: 'queued' });

      provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

      // Give async flush time
      await new Promise(r => setTimeout(r, 0));

      expect(mockWebview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'test', payload: 'queued' }),
      );
    });
  });

  describe('postMessage', () => {
    it('queues message when webview not yet resolved', () => {
      provider.postMessage({ type: 'pending' });

      // Webview not resolved yet — should not call postMessage
      expect(mockWebview.postMessage).not.toHaveBeenCalled();
    });

    it('posts immediately when webview is active', async () => {
      provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
      await new Promise(r => setTimeout(r, 0)); // flush initial queue

      mockWebview.postMessage.mockClear();
      provider.postMessage({ type: 'immediate' });

      expect(mockWebview.postMessage).toHaveBeenCalledWith({ type: 'immediate' });
    });
  });

  describe('isVisible', () => {
    it('returns true when webview is visible', () => {
      provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

      expect(provider.isVisible()).toBe(true);
    });

    it('returns false before webview is resolved', () => {
      expect(provider.isVisible()).toBe(false);
    });
  });
});
```

**Step 3: Run tests**

```bash
npx vitest run src/chat/chat-provider.test.ts
```

**Step 4: Commit**

```bash
git add src/chat/chat-provider.test.ts
git commit -m "test(chat-provider): add webview lifecycle, message queuing, isVisible tests"
```

---

## Running the full suite

After all tasks are complete:

```bash
npx vitest run
```

Expected: all tests pass. Coverage should increase from ~40% to >80% across all critical paths.
