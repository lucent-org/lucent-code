import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  mockExecuteCommand,
  mockApplyEdit,
  mockFindFiles,
  mockReadFile,
  mockWriteFile,
  mockDeleteFile,
  mockReadDirectory,
  mockCreateDirectory,
  mockCreateTerminal,
  mockSendText,
} = vi.hoisted(() => {
  const mockSendText = vi.fn();
  const mockCreateTerminal = vi.fn(() => ({ show: vi.fn(), sendText: mockSendText, dispose: vi.fn() }));
  return {
    mockExecuteCommand: vi.fn(),
    mockApplyEdit: vi.fn(() => Promise.resolve(true)),
    mockFindFiles: vi.fn(() => Promise.resolve([])),
    mockReadFile: vi.fn(() => Promise.resolve(new Uint8Array())),
    mockWriteFile: vi.fn(() => Promise.resolve(undefined)),
    mockDeleteFile: vi.fn(() => Promise.resolve(undefined)),
    mockReadDirectory: vi.fn(() => Promise.resolve([])),
    mockCreateDirectory: vi.fn(() => Promise.resolve(undefined)),
    mockCreateTerminal,
    mockSendText,
  };
});

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('vscode', () => ({
  commands: {
    executeCommand: mockExecuteCommand,
  },
  workspace: {
    applyEdit: mockApplyEdit,
    findFiles: mockFindFiles,
    fs: {
      readFile: mockReadFile,
      writeFile: mockWriteFile,
      delete: mockDeleteFile,
      readDirectory: mockReadDirectory,
      createDirectory: mockCreateDirectory,
    },
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
  },
  window: {
    createTerminal: mockCreateTerminal,
  },
  Uri: {
    parse: (s: string) => ({ toString: () => s, fsPath: s }),
    file: (s: string) => ({ toString: () => s, fsPath: s }),
    joinPath: (base: any, ...parts: string[]) => ({
      toString: () => [base.fsPath, ...parts].join('/'),
      fsPath: [base.fsPath, ...parts].join('/'),
    }),
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
  FileType: {
    Unknown: 0,
    File: 1,
    Directory: 2,
    SymbolicLink: 64,
  },
}));

import { EditorToolExecutor, TOOL_DEFINITIONS } from './editor-tools';

describe('EditorToolExecutor', () => {
  let executor: EditorToolExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFindFiles.mockReset();
    mockReadFile.mockReset();
    mockFetch.mockReset();
    executor = new EditorToolExecutor();
  });

  it('should define tool schemas for OpenAI-compatible tool-use', () => {
    expect(TOOL_DEFINITIONS).toBeInstanceOf(Array);
    expect(TOOL_DEFINITIONS.length).toBeGreaterThan(0);
    const names = TOOL_DEFINITIONS.map((t) => t.function.name);
    expect(names).toContain('rename_symbol');
    expect(names).toContain('format_document');
    expect(names).toContain('apply_code_action');
    expect(names).toContain('insert_code');
    expect(names).toContain('replace_range');
  });

  it('TOOL_DEFINITIONS includes semantic_search', () => {
    const tool = TOOL_DEFINITIONS.find((t) => t.function.name === 'semantic_search');
    expect(tool).toBeDefined();
    expect(tool!.function.parameters.required).toContain('query');
  });

  it('TOOL_DEFINITIONS includes use_model', () => {
    const tool = TOOL_DEFINITIONS.find((t) => t.function.name === 'use_model');
    expect(tool).toBeDefined();
    expect(tool!.function.parameters.required).toContain('model_id');
  });

  it('should execute use_model and return success', async () => {
    const result = await executor.execute('use_model', { model_id: 'anthropic/claude-opus-4-6' });
    expect(result.success).toBe(true);
    expect(result.message).toContain('anthropic/claude-opus-4-6');
  });

  it('should return error for empty model_id', async () => {
    const result = await executor.execute('use_model', { model_id: '' });
    expect(result.success).toBe(false);
  });

  it('should execute format_document', async () => {
    mockExecuteCommand.mockResolvedValue(undefined);
    const result = await executor.execute('format_document', { uri: 'file:///test.ts' });
    expect(result.success).toBe(true);
    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'vscode.executeFormatDocumentProvider',
      expect.anything(),
      expect.anything()
    );
  });

  it('should execute insert_code', async () => {
    const result = await executor.execute('insert_code', {
      uri: 'file:///test.ts', line: 5, character: 0, code: 'const x = 1;'
    });
    expect(result.success).toBe(true);
    expect(mockApplyEdit).toHaveBeenCalled();
  });

  it('should execute replace_range', async () => {
    const result = await executor.execute('replace_range', {
      uri: 'file:///test.ts', startLine: 0, startCharacter: 0, endLine: 0, endCharacter: 10, code: 'replaced'
    });
    expect(result.success).toBe(true);
    expect(mockApplyEdit).toHaveBeenCalled();
  });

  it('should return error for unknown tool', async () => {
    const result = await executor.execute('unknown_tool', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown tool');
  });

  it('should handle execution errors gracefully', async () => {
    mockExecuteCommand.mockRejectedValue(new Error('format failed'));
    const result = await executor.execute('format_document', { uri: 'file:///test.ts' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('format failed');
  });

  describe('apply_code_action', () => {
    it('executes action command when action has a command', async () => {
      const action = {
        title: 'Fix lint error',
        command: { command: 'eslint.fix', arguments: ['arg1'] },
      };
      mockExecuteCommand
        .mockResolvedValueOnce([action])   // executeCodeActionProvider
        .mockResolvedValueOnce(undefined); // eslint.fix

      const result = await executor.execute('apply_code_action', {
        uri: 'file:///test.ts',
        line: 0,
        character: 0,
        actionTitle: 'Fix lint error',
      });

      expect(result.success).toBe(true);
      expect(mockExecuteCommand).toHaveBeenCalledWith('eslint.fix', 'arg1');
    });

    it('returns error when action title not found', async () => {
      mockExecuteCommand.mockResolvedValueOnce([
        { title: 'Some other action' },
      ]);

      const result = await executor.execute('apply_code_action', {
        uri: 'file:///test.ts',
        line: 0,
        character: 0,
        actionTitle: 'Nonexistent',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Nonexistent');
    });
  });

  describe('rename_symbol', () => {
    it('should apply a WorkspaceEdit returned by executeDocumentRenameProvider', async () => {
      const mockEdit = { size: 1 };
      mockExecuteCommand.mockResolvedValue(mockEdit);
      mockApplyEdit.mockResolvedValue(true);

      const result = await executor.execute('rename_symbol', {
        uri: 'file:///test.ts',
        line: 5,
        character: 10,
        newName: 'renamedFoo',
      });

      expect(result.success).toBe(true);
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        'vscode.executeDocumentRenameProvider',
        expect.anything(),
        expect.anything(),
        'renamedFoo'
      );
      expect(mockApplyEdit).toHaveBeenCalledWith(mockEdit);
    });

    it('should return error if no edit returned', async () => {
      mockExecuteCommand.mockResolvedValue(undefined);
      const result = await executor.execute('rename_symbol', {
        uri: 'file:///test.ts',
        line: 5,
        character: 10,
        newName: 'renamedFoo',
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/no rename/i);
    });
  });

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

    it('returns error for invalid regex pattern', async () => {
      const result = await executor.execute('grep_files', { pattern: '[invalid' });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/invalid regex/i);
    });
  });

  describe('search_web', () => {
    it('returns abstract and related topics from DuckDuckGo', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          Abstract: 'TypeScript is a typed superset of JavaScript.',
          RelatedTopics: [
            { Text: 'TypeScript compiler' },
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

    it('uses Tavily when a key is provided', async () => {
      const tavilyResponse = {
        results: [
          { title: 'Result 1', url: 'https://example.com', content: 'Some content' },
        ],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => tavilyResponse,
      } as Response);

      const executor = new EditorToolExecutor(async () => 'tvly-test-key');
      const result = await executor.execute('search_web', { query: 'typescript generics' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Result 1');
      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('https://api.tavily.com/search');
    });

    it('falls back to DuckDuckGo when no Tavily key', async () => {
      const ddgResponse = { Abstract: 'TypeScript is a language', RelatedTopics: [] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ddgResponse,
      } as Response);

      const executor = new EditorToolExecutor(async () => undefined);
      const result = await executor.execute('search_web', { query: 'typescript' });

      expect(result.success).toBe(true);
      const call = mockFetch.mock.calls[0];
      expect((call[0] as string)).toContain('duckduckgo.com');
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

    it('returns error on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      const result = await executor.execute('http_request', {
        method: 'GET',
        url: 'http://localhost:3000/api/fail',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('500');
    });
  });

  describe('write_file', () => {
    it('writes content to a workspace-relative path', async () => {
      mockCreateDirectory.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);
      const result = await executor.execute('write_file', { path: 'src/foo.ts', content: 'export {}' });
      expect(result.success).toBe(true);
      expect(mockWriteFile).toHaveBeenCalled();
    });
  });

  describe('delete_file', () => {
    it('deletes a file and returns success', async () => {
      mockDeleteFile.mockResolvedValue(undefined);
      const result = await executor.execute('delete_file', { path: 'src/foo.ts' });
      expect(result.success).toBe(true);
    });

    it('returns error if file not found', async () => {
      mockDeleteFile.mockRejectedValue(new Error('FileNotFound'));
      const result = await executor.execute('delete_file', { path: 'src/missing.ts' });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not found/i);
    });
  });

  describe('list_directory', () => {
    it('returns sorted [file]/[dir] list', async () => {
      mockReadDirectory.mockResolvedValue([
        ['src', 2],
        ['README.md', 1],
      ]);
      const result = await executor.execute('list_directory', { path: '.' });
      expect(result.success).toBe(true);
      expect(result.message).toContain('[dir]  src');
      expect(result.message).toContain('[file] README.md');
    });

    it('returns empty directory message when no entries', async () => {
      mockReadDirectory.mockResolvedValue([]);
      const result = await executor.execute('list_directory', { path: '.' });
      expect(result.success).toBe(true);
      expect(result.message).toContain('empty');
    });
  });

  describe('create_directory', () => {
    it('creates a directory and returns success', async () => {
      mockCreateDirectory.mockResolvedValue(undefined);
      const result = await executor.execute('create_directory', { path: 'src/utils' });
      expect(result.success).toBe(true);
      expect(mockCreateDirectory).toHaveBeenCalled();
    });
  });

  describe('read_file', () => {
    it('reads file content with default 2000-line limit', async () => {
      const content = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n');
      mockReadFile.mockResolvedValue(new TextEncoder().encode(content));
      const result = await executor.execute('read_file', { path: 'src/foo.ts' });
      expect(result.success).toBe(true);
      expect(result.message).toContain('line 1');
      expect(result.message).toContain('line 10');
    });

    it('paginates with start_line and end_line', async () => {
      const content = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n');
      mockReadFile.mockResolvedValue(new TextEncoder().encode(content));
      const result = await executor.execute('read_file', { path: 'src/foo.ts', start_line: 5, end_line: 8 });
      expect(result.success).toBe(true);
      expect(result.message).toContain('line 5');
      expect(result.message).toContain('line 8');
      expect(result.message).not.toContain('line 4');
      expect(result.message).not.toContain('line 9');
    });

    it('includes continuation hint when there are more lines beyond end_line', async () => {
      const content = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n');
      mockReadFile.mockResolvedValue(new TextEncoder().encode(content));
      const result = await executor.execute('read_file', { path: 'src/foo.ts', start_line: 1, end_line: 5 });
      expect(result.success).toBe(true);
      expect(result.message).toContain('more lines');
      expect(result.message).toContain('start_line=6');
    });

    it('returns error when file does not exist', async () => {
      mockReadFile.mockRejectedValue(new Error('FileNotFound: src/missing.ts'));
      const result = await executor.execute('read_file', { path: 'src/missing.ts' });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/could not read file/i);
    });
  });

  describe('run_terminal_command', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('calls sendText with the provided command', async () => {
      const promise = executor.execute('run_terminal_command', { command: 'npm test' });
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(mockSendText).toHaveBeenCalledWith('npm test');
      expect(result.success).toBe(true);
    });

    it('returns fallback message when terminalBuffer is absent', async () => {
      const executorNoBuffer = new EditorToolExecutor();
      const promise = executorNoBuffer.execute('run_terminal_command', { command: 'git status' });
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.message).toContain('git status');
      expect(result.message).toContain('Output capture unavailable');
    });

    it('returns captured output when the buffer has data', async () => {
      const mockBuffer = { getActiveTerminalOutput: vi.fn(() => 'build succeeded\n') };
      const executorWithBuffer = new EditorToolExecutor(undefined, mockBuffer as any);
      const promise = executorWithBuffer.execute('run_terminal_command', { command: 'npm run build' });
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.message).toContain('npm run build');
      expect(result.message).toContain('build succeeded');
    });
  });
});
