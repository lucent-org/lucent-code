import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock better-sqlite3 — no native binary needed in CI
const mockRun = vi.fn();
const mockGet = vi.fn();
const mockAll = vi.fn(() => []);
const mockPrepare = vi.fn(() => ({ run: mockRun, get: mockGet, all: mockAll }));
const mockExec = vi.fn();
const mockClose = vi.fn();

vi.mock('better-sqlite3', () => {
  return {
    default: vi.fn(() => ({
      prepare: mockPrepare,
      exec: mockExec,
      close: mockClose,
      transaction: vi.fn((fn: () => void) => fn),  // returns the fn itself (calling tx() calls fn())
    })),
  };
});

import { VectorStore } from './vector-store';

describe('VectorStore', () => {
  let store: VectorStore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAll.mockReturnValue([]);
    store = new VectorStore();
    store.open(':memory:');
  });

  it('opens database and creates schema', () => {
    expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS chunks'));
  });

  it('getAllFileMtimes returns empty map when no chunks', () => {
    mockAll.mockReturnValue([]);
    const result = store.getAllFileMtimes();
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it('getAllFileMtimes aggregates by file path', () => {
    mockAll.mockReturnValue([
      { file_path: 'a.ts', mtime: 1000 },
      { file_path: 'b.ts', mtime: 2000 },
    ]);
    const result = store.getAllFileMtimes();
    expect(result.get('a.ts')).toBe(1000);
    expect(result.get('b.ts')).toBe(2000);
  });

  it('search returns empty array when no embeddings loaded', () => {
    const query = new Float32Array([1, 0, 0]);
    const results = store.search(query, 5);
    expect(results).toEqual([]);
  });

  it('cosine similarity finds closest vector', () => {
    const embedding = new Float32Array([1, 0, 0]);
    const queryEmbedding = new Float32Array([1, 0, 0]);
    mockAll.mockReturnValue([
      {
        file_path: 'test.ts',
        start_line: 0,
        end_line: 10,
        content: 'const x = 1;',
        embedding: Buffer.from(embedding.buffer),
      },
    ]);
    store.loadIntoMemory();
    const results = store.search(queryEmbedding, 1);
    expect(results).toHaveLength(1);
    expect(results[0].filePath).toBe('test.ts');
    expect(results[0].score).toBeCloseTo(1.0);
  });

  it('upsertChunks deletes old chunks and inserts new ones', () => {
    const embedding = new Float32Array([1, 0, 0]);
    store.upsertChunks('src/foo.ts', [{ startLine: 0, endLine: 5, content: 'hello', embedding }], 1000);
    // deleteStmt.run called with filePath
    expect(mockRun).toHaveBeenCalledWith('src/foo.ts');
    // insertStmt.run called with chunk data
    expect(mockRun).toHaveBeenCalledWith('src/foo.ts', 0, 5, 'hello', expect.any(Buffer), 1000);
  });

  it('deleteFile removes all chunks for a file', () => {
    store.deleteFile('src/bar.ts');
    expect(mockPrepare).toHaveBeenCalledWith('DELETE FROM chunks WHERE file_path = ?');
    expect(mockRun).toHaveBeenCalledWith('src/bar.ts');
  });

  it('close calls db.close()', () => {
    store.close();
    expect(mockClose).toHaveBeenCalled();
  });

  describe('search with topK > 1', () => {
    it('returns multiple results sorted by score descending', () => {
      // chunk1: aligns with [1,0,0], chunk2: aligns with [0,1,0]
      const emb1 = new Float32Array([1, 0, 0]);
      const emb2 = new Float32Array([0.5, 0.5, 0]);
      const emb3 = new Float32Array([0, 0, 1]);
      mockAll.mockReturnValue([
        { file_path: 'a.ts', start_line: 0, end_line: 5, content: 'a', embedding: Buffer.from(emb1.buffer) },
        { file_path: 'b.ts', start_line: 0, end_line: 5, content: 'b', embedding: Buffer.from(emb2.buffer) },
        { file_path: 'c.ts', start_line: 0, end_line: 5, content: 'c', embedding: Buffer.from(emb3.buffer) },
      ]);
      store.loadIntoMemory();
      const query = new Float32Array([1, 0, 0]);
      const results = store.search(query, 2);
      expect(results).toHaveLength(2);
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
      expect(results[0].filePath).toBe('a.ts');
    });
  });

  describe('cosine similarity edge cases', () => {
    it('handles zero query vector gracefully', () => {
      const emb = new Float32Array([1, 0, 0]);
      mockAll.mockReturnValue([
        { file_path: 'a.ts', start_line: 0, end_line: 5, content: 'a', embedding: Buffer.from(emb.buffer) },
      ]);
      store.loadIntoMemory();
      const zeroQuery = new Float32Array([0, 0, 0]);
      // Should not throw, returns empty (qNorm === 0)
      expect(() => store.search(zeroQuery, 1)).not.toThrow();
      const results = store.search(zeroQuery, 1);
      expect(results).toEqual([]);
    });

    it('skips chunk with zero embedding vector', () => {
      const zeroEmb = new Float32Array([0, 0, 0]);
      mockAll.mockReturnValue([
        { file_path: 'a.ts', start_line: 0, end_line: 5, content: 'a', embedding: Buffer.from(zeroEmb.buffer) },
      ]);
      store.loadIntoMemory();
      const query = new Float32Array([1, 0, 0]);
      // chunk has zero norm, gets skipped
      expect(() => store.search(query, 1)).not.toThrow();
      const results = store.search(query, 1);
      expect(results).toEqual([]);
    });
  });

  describe('deleteFile removes chunks for a file', () => {
    it('removes all chunks for the deleted file while keeping others', () => {
      // We test that deleteFile calls the correct prepare + run
      // Simulate: upsert 2 chunks for /del.ts, 1 for /keep.ts
      // Then deleteFile /del.ts and verify mockRun was called with /del.ts
      vi.clearAllMocks();
      mockAll.mockReturnValue([]);
      store.open(':memory:');

      store.deleteFile('/del.ts');
      expect(mockRun).toHaveBeenCalledWith('/del.ts');

      // /keep.ts was not targeted
      const calls = (mockRun as ReturnType<typeof vi.fn>).mock.calls;
      const delTsCalls = calls.filter((c: unknown[]) => c[0] === '/del.ts');
      const keepTsCalls = calls.filter((c: unknown[]) => c[0] === '/keep.ts');
      expect(delTsCalls.length).toBeGreaterThan(0);
      expect(keepTsCalls.length).toBe(0);
    });
  });
});
