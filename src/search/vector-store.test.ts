import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VectorStore } from './vector-store';

// Build a mock fs that the VectorStore can use instead of the real fs
function makeMockFs() {
  const files: Map<string, Buffer | string> = new Map();
  return {
    files,
    existsSync: vi.fn((p: string) => files.has(p)),
    readFileSync: vi.fn((p: string, encoding?: string) => {
      const data = files.get(p);
      if (data === undefined) throw new Error(`ENOENT: ${p}`);
      if (encoding === 'utf8') return data.toString();
      return data as Buffer;
    }),
    writeFileSync: vi.fn((p: string, data: string | Buffer) => {
      files.set(p, typeof data === 'string' ? Buffer.from(data) : data);
    }),
    mkdirSync: vi.fn(),
  };
}

describe('VectorStore', () => {
  let store: VectorStore;
  let mockFs: ReturnType<typeof makeMockFs>;

  beforeEach(() => {
    mockFs = makeMockFs();
    store = new VectorStore(mockFs as any);
    store.open('/test-db');
  });

  it('isOpen returns true after open()', () => {
    expect(store.isOpen()).toBe(true);
  });

  it('isOpen returns false before open()', () => {
    const s = new VectorStore(mockFs as any);
    expect(s.isOpen()).toBe(false);
  });

  it('getAllFileMtimes returns empty map when no chunks', () => {
    const result = store.getAllFileMtimes();
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it('getAllFileMtimes aggregates by file path after upsert', () => {
    const emb = new Float32Array([1, 0, 0]);
    store.upsertChunks('a.ts', [{ startLine: 0, endLine: 5, content: 'x', embedding: emb }], 1000);
    store.upsertChunks('b.ts', [{ startLine: 0, endLine: 5, content: 'y', embedding: emb }], 2000);
    const result = store.getAllFileMtimes();
    expect(result.get('a.ts')).toBe(1000);
    expect(result.get('b.ts')).toBe(2000);
  });

  it('search returns empty array when no embeddings loaded', () => {
    const query = new Float32Array([1, 0, 0]);
    const results = store.search(query, 5);
    expect(results).toEqual([]);
  });

  it('cosine similarity finds closest vector after upsert', () => {
    const embedding = new Float32Array([1, 0, 0]);
    store.upsertChunks('test.ts', [{ startLine: 0, endLine: 10, content: 'const x = 1;', embedding }], 0);
    const queryEmbedding = new Float32Array([1, 0, 0]);
    const results = store.search(queryEmbedding, 1);
    expect(results).toHaveLength(1);
    expect(results[0].filePath).toBe('test.ts');
    expect(results[0].score).toBeCloseTo(1.0);
  });

  it('upsertChunks removes old chunks for file and inserts new ones', () => {
    const emb1 = new Float32Array([1, 0, 0]);
    const emb2 = new Float32Array([0, 1, 0]);
    store.upsertChunks('src/foo.ts', [{ startLine: 0, endLine: 5, content: 'old', embedding: emb1 }], 1000);
    store.upsertChunks('src/foo.ts', [{ startLine: 0, endLine: 5, content: 'new', embedding: emb2 }], 2000);
    const results = store.search(new Float32Array([0, 1, 0]), 5);
    const contents = results.map(r => r.content);
    expect(contents).toContain('new');
    expect(contents).not.toContain('old');
  });

  it('deleteFile removes all chunks for that file', () => {
    const emb = new Float32Array([1, 0, 0]);
    store.upsertChunks('src/bar.ts', [{ startLine: 0, endLine: 5, content: 'bar', embedding: emb }], 1000);
    store.upsertChunks('src/keep.ts', [{ startLine: 0, endLine: 5, content: 'keep', embedding: emb }], 1000);
    store.deleteFile('src/bar.ts');
    const mtimes = store.getAllFileMtimes();
    expect(mtimes.has('src/bar.ts')).toBe(false);
    expect(mtimes.has('src/keep.ts')).toBe(true);
  });

  it('close flushes data to disk', () => {
    const emb = new Float32Array([1, 0, 0]);
    store.upsertChunks('close-test.ts', [{ startLine: 0, endLine: 5, content: 'data', embedding: emb }], 500);
    // writeFileSync is called on upsert (flush)
    expect(mockFs.writeFileSync).toHaveBeenCalled();
  });

  it('upsertChunks does nothing if store is not open', () => {
    const s = new VectorStore(mockFs as any);
    const emb = new Float32Array([1, 0, 0]);
    s.upsertChunks('a.ts', [{ startLine: 0, endLine: 5, content: 'x', embedding: emb }], 0);
    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
  });

  it('deleteFile does nothing if store is not open', () => {
    const s = new VectorStore(mockFs as any);
    s.deleteFile('a.ts');
    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
  });

  describe('search with topK > 1', () => {
    it('returns multiple results sorted by score descending', () => {
      const emb1 = new Float32Array([1, 0, 0]);
      const emb2 = new Float32Array([0.5, 0.5, 0]);
      const emb3 = new Float32Array([0, 0, 1]);
      store.upsertChunks('a.ts', [{ startLine: 0, endLine: 5, content: 'a', embedding: emb1 }], 0);
      store.upsertChunks('b.ts', [{ startLine: 0, endLine: 5, content: 'b', embedding: emb2 }], 0);
      store.upsertChunks('c.ts', [{ startLine: 0, endLine: 5, content: 'c', embedding: emb3 }], 0);
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
      store.upsertChunks('a.ts', [{ startLine: 0, endLine: 5, content: 'a', embedding: emb }], 0);
      const zeroQuery = new Float32Array([0, 0, 0]);
      expect(() => store.search(zeroQuery, 1)).not.toThrow();
      const results = store.search(zeroQuery, 1);
      expect(results).toEqual([]);
    });

    it('skips chunk with zero embedding vector', () => {
      const zeroEmb = new Float32Array([0, 0, 0]);
      store.upsertChunks('a.ts', [{ startLine: 0, endLine: 5, content: 'a', embedding: zeroEmb }], 0);
      const query = new Float32Array([1, 0, 0]);
      expect(() => store.search(query, 1)).not.toThrow();
      const results = store.search(query, 1);
      expect(results).toEqual([]);
    });
  });

  describe('loadIntoMemory', () => {
    it('populates chunks from persisted files', () => {
      // First write some data via upsert
      const emb = new Float32Array([1, 0, 0]);
      store.upsertChunks('persist.ts', [{ startLine: 0, endLine: 5, content: 'hello', embedding: emb }], 123);

      // Create a new store pointing at same mockFs dir
      const store2 = new VectorStore(mockFs as any);
      store2.open('/test-db');
      store2.loadIntoMemory();

      const results = store2.search(new Float32Array([1, 0, 0]), 1);
      expect(results).toHaveLength(1);
      expect(results[0].filePath).toBe('persist.ts');
      expect(results[0].content).toBe('hello');
    });

    it('does nothing if store is not open', () => {
      const s = new VectorStore(mockFs as any);
      expect(() => s.loadIntoMemory()).not.toThrow();
    });
  });

  describe('deleteFile removes chunks for a file', () => {
    it('removes all chunks for the deleted file while keeping others', () => {
      const emb = new Float32Array([1, 0, 0]);
      store.upsertChunks('/del.ts', [{ startLine: 0, endLine: 5, content: 'del', embedding: emb }], 0);
      store.upsertChunks('/keep.ts', [{ startLine: 0, endLine: 5, content: 'keep', embedding: emb }], 0);

      store.deleteFile('/del.ts');

      const mtimes = store.getAllFileMtimes();
      expect(mtimes.has('/del.ts')).toBe(false);
      expect(mtimes.has('/keep.ts')).toBe(true);
    });
  });
});
