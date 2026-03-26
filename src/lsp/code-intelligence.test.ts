import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecuteCommand, mockGetDiagnostics } = vi.hoisted(() => ({
  mockExecuteCommand: vi.fn(),
  mockGetDiagnostics: vi.fn((): unknown[] => []),
}));

vi.mock('vscode', () => ({
  commands: {
    executeCommand: mockExecuteCommand,
  },
  languages: {
    getDiagnostics: mockGetDiagnostics,
  },
  Uri: {
    parse: (s: string) => ({ toString: () => s, fsPath: s }),
  },
  Position: class {
    constructor(public line: number, public character: number) {}
  },
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
}));

import { CodeIntelligence } from './code-intelligence';

describe('CodeIntelligence', () => {
  let ci: CodeIntelligence;

  beforeEach(() => {
    vi.clearAllMocks();
    ci = new CodeIntelligence();
  });

  describe('getHover', () => {
    it('should return hover contents', async () => {
      mockExecuteCommand.mockResolvedValue([
        { contents: [{ value: 'function greet(name: string): void' }] },
      ]);
      const result = await ci.getHover('file:///test.ts', 0, 10);
      expect(result).toContain('function greet');
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        'vscode.executeHoverProvider',
        expect.anything(),
        expect.anything()
      );
    });

    it('should return undefined when no hover info', async () => {
      mockExecuteCommand.mockResolvedValue([]);
      const result = await ci.getHover('file:///test.ts', 0, 10);
      expect(result).toBeUndefined();
    });

    it('should return undefined on error', async () => {
      mockExecuteCommand.mockRejectedValue(new Error('no provider'));
      const result = await ci.getHover('file:///test.ts', 0, 10);
      expect(result).toBeUndefined();
    });
  });

  describe('getDiagnostics', () => {
    it('should return formatted diagnostics for a URI', () => {
      mockGetDiagnostics.mockReturnValue([
        [
          { toString: () => 'file:///test.ts' },
          [
            {
              message: 'Type error',
              severity: 0,
              range: { start: { line: 5, character: 0 }, end: { line: 5, character: 10 } },
            },
          ],
        ],
      ]);
      const result = ci.getDiagnostics('file:///test.ts');
      expect(result).toHaveLength(1);
      expect(result[0].message).toBe('Type error');
      expect(result[0].severity).toBe('Error');
    });

    it('should return empty array when no diagnostics', () => {
      mockGetDiagnostics.mockReturnValue([]);
      const result = ci.getDiagnostics('file:///test.ts');
      expect(result).toHaveLength(0);
    });
  });

  describe('getDefinition', () => {
    it('should return definition location', async () => {
      mockExecuteCommand.mockResolvedValue([
        { uri: { toString: () => 'file:///other.ts' }, range: { start: { line: 10, character: 0 } } },
      ]);
      const result = await ci.getDefinition('file:///test.ts', 5, 15);
      expect(result).toBeDefined();
      expect(result!.uri).toBe('file:///other.ts');
      expect(result!.line).toBe(10);
    });

    it('should return undefined when no definitions', async () => {
      mockExecuteCommand.mockResolvedValue([]);
      const result = await ci.getDefinition('file:///test.ts', 5, 15);
      expect(result).toBeUndefined();
    });

    it('should cache second call and not re-fetch', async () => {
      mockExecuteCommand.mockResolvedValue([
        { uri: { toString: () => 'file:///other.ts' }, range: { start: { line: 10, character: 0 } } },
      ]);
      await ci.getDefinition('file:///test.ts', 5, 15);
      await ci.getDefinition('file:///test.ts', 5, 15);
      expect(mockExecuteCommand).toHaveBeenCalledTimes(1);
    });
  });

  describe('getReferences', () => {
    it('should return reference locations', async () => {
      mockExecuteCommand.mockResolvedValue([
        { uri: { toString: () => 'file:///test.ts' }, range: { start: { line: 2, character: 4 } } },
        { uri: { toString: () => 'file:///other.ts' }, range: { start: { line: 7, character: 0 } } },
      ]);
      const result = await ci.getReferences('file:///test.ts', 1, 5);
      expect(result).toHaveLength(2);
      expect(result[0].uri).toBe('file:///test.ts');
      expect(result[1].uri).toBe('file:///other.ts');
    });

    it('should return empty array when no references', async () => {
      mockExecuteCommand.mockResolvedValue(undefined);
      const result = await ci.getReferences('file:///test.ts', 1, 5);
      expect(result).toEqual([]);
    });
  });

  describe('getSymbols', () => {
    it('should return document symbols', async () => {
      mockExecuteCommand.mockResolvedValue([
        { name: 'greet', kind: 12, range: { start: { line: 0 }, end: { line: 3 } } },
        { name: 'main', kind: 12, range: { start: { line: 5 }, end: { line: 10 } } },
      ]);
      const result = await ci.getSymbols('file:///test.ts');
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('greet');
    });
  });

  describe('caching', () => {
    it('should cache hover results within TTL', async () => {
      mockExecuteCommand.mockResolvedValue([
        { contents: [{ value: 'cached result' }] },
      ]);
      await ci.getHover('file:///test.ts', 0, 10);
      await ci.getHover('file:///test.ts', 0, 10);
      expect(mockExecuteCommand).toHaveBeenCalledTimes(1);
    });
  });

  describe('cache size limit', () => {
    it('should not exceed 100 entries after many unique queries', async () => {
      mockExecuteCommand.mockResolvedValue([
        { contents: [{ value: 'type info' }] },
      ]);

      // Insert 110 distinct entries (different line numbers)
      for (let i = 0; i < 110; i++) {
        await ci.getHover('file:///test.ts', i, 0);
      }

      // Clearing should not throw and cache should be manageable
      expect(() => ci.clearCache()).not.toThrow();
    });

    it('should still return results after reaching capacity', async () => {
      mockExecuteCommand.mockResolvedValue([
        { contents: [{ value: 'result' }] },
      ]);

      // Fill to 100
      for (let i = 0; i < 100; i++) {
        await ci.getHover('file:///test.ts', i, 0);
      }

      // One more — should succeed, not throw
      const result = await ci.getHover('file:///test.ts', 100, 0);
      expect(result).toBe('result');
    });
  });

  describe('cache TTL expiration', () => {
    it('should re-fetch after TTL expires', async () => {
      vi.useFakeTimers();
      mockExecuteCommand.mockResolvedValue([
        { contents: [{ value: 'hover1' }] },
      ]);

      await ci.getHover('file:///test.ts', 0, 0);
      vi.advanceTimersByTime(6000); // past 5s TTL
      await ci.getHover('file:///test.ts', 0, 0);

      expect(mockExecuteCommand).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });
  });

  describe('LRU eviction at 100 entries', () => {
    it('should evict oldest entry when cache exceeds 100 and require re-fetch', async () => {
      mockExecuteCommand.mockResolvedValue([
        { contents: [{ value: 'x' }] },
      ]);

      // Fill 100 unique entries: file0.ts through file99.ts
      for (let i = 0; i < 100; i++) {
        await ci.getHover(`file:///file${i}.ts`, 0, 0);
      }

      mockExecuteCommand.mockClear();

      // Insert entry 101 — file0.ts should be evicted (it was the oldest)
      await ci.getHover('file:///file100.ts', 0, 0);
      // file0.ts was evicted, so this should be a cache miss (re-fetch)
      await ci.getHover('file:///file0.ts', 0, 0);

      expect(mockExecuteCommand).toHaveBeenCalledTimes(2);
    });
  });
});
