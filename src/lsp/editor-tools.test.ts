import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecuteCommand, mockApplyEdit } = vi.hoisted(() => ({
  mockExecuteCommand: vi.fn(),
  mockApplyEdit: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('vscode', () => ({
  commands: {
    executeCommand: mockExecuteCommand,
  },
  workspace: {
    applyEdit: mockApplyEdit,
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

import { EditorToolExecutor, TOOL_DEFINITIONS } from './editor-tools';

describe('EditorToolExecutor', () => {
  let executor: EditorToolExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
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
});
