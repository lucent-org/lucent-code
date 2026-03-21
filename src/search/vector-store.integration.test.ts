import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { VectorStore } from './vector-store';

// NOTE: No vi.mock — uses real better-sqlite3 against a temp file

let store: VectorStore;
let dbPath: string;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `lucent-test-${Date.now()}.db`);
  store = new VectorStore();
  store.open(dbPath);
});

afterEach(() => {
  store.close();
  try { fs.unlinkSync(dbPath); } catch { /* already deleted */ }
});

describe('VectorStore integration', () => {
  it('creates schema on open', () => {
    const embedding = new Float32Array(3).fill(0.5);
    expect(() =>
      store.upsertChunks('a.ts', [{ startLine: 0, endLine: 5, content: 'hello', embedding }], 1000)
    ).not.toThrow();
  });

  it('upsert then loadIntoMemory then search returns correct result', () => {
    const embA = new Float32Array([1, 0, 0]);
    const embB = new Float32Array([0, 1, 0]);
    store.upsertChunks('a.ts', [{ startLine: 0, endLine: 5, content: 'alpha', embedding: embA }], 1000);
    store.upsertChunks('b.ts', [{ startLine: 0, endLine: 5, content: 'beta', embedding: embB }], 2000);
    store.loadIntoMemory();

    const results = store.search(new Float32Array([1, 0, 0]), 2);
    expect(results[0].filePath).toBe('a.ts');
    expect(results[0].content).toBe('alpha');
    expect(results[0].score).toBeCloseTo(1.0, 4);
    expect(results[1].filePath).toBe('b.ts');
    expect(results[1].score).toBeCloseTo(0, 4);
  });

  it('upsert replaces previous chunks for same file', () => {
    const emb = new Float32Array([1, 0, 0]);
    store.upsertChunks('a.ts', [{ startLine: 0, endLine: 5, content: 'old', embedding: emb }], 1000);
    store.upsertChunks('a.ts', [{ startLine: 0, endLine: 5, content: 'new', embedding: emb }], 2000);
    store.loadIntoMemory();

    const results = store.search(new Float32Array([1, 0, 0]), 5);
    const contents = results.map(r => r.content);
    expect(contents).toContain('new');
    expect(contents).not.toContain('old');
  });

  it('deleteFile removes chunks and they are gone after reload', () => {
    const emb = new Float32Array([1, 0, 0]);
    store.upsertChunks('a.ts', [{ startLine: 0, endLine: 5, content: 'to delete', embedding: emb }], 1000);
    store.deleteFile('a.ts');
    store.loadIntoMemory();

    const results = store.search(new Float32Array([1, 0, 0]), 5);
    expect(results.find(r => r.filePath === 'a.ts')).toBeUndefined();
  });

  it('getAllFileMtimes returns correct mtimes after upsert', () => {
    const emb = new Float32Array([1, 0, 0]);
    store.upsertChunks('x.ts', [{ startLine: 0, endLine: 1, content: 'x', embedding: emb }], 9999);
    const mtimes = store.getAllFileMtimes();
    expect(mtimes.get('x.ts')).toBe(9999);
  });

  it('persists data across open/close/reopen', () => {
    const emb = new Float32Array([0.5, 0.5, 0]);
    store.upsertChunks('persist.ts', [{ startLine: 0, endLine: 3, content: 'persistent', embedding: emb }], 5000);
    store.close();

    const store2 = new VectorStore();
    store2.open(dbPath);
    store2.loadIntoMemory();
    const results = store2.search(new Float32Array([0.5, 0.5, 0]), 1);
    store2.close();

    expect(results[0].filePath).toBe('persist.ts');
    expect(results[0].content).toBe('persistent');
  });
});
