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

  it('close calls db.close()', () => {
    store.close();
    expect(mockClose).toHaveBeenCalled();
  });
});
