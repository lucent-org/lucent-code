import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('./vector-store', () => ({
  VectorStore: vi.fn(() => ({
    open: vi.fn(),
    upsertChunks: vi.fn(),
    deleteFile: vi.fn(),
    loadIntoMemory: vi.fn(),
    search: vi.fn(() => []),
    getAllFileMtimes: vi.fn(() => new Map()),
    close: vi.fn(),
  })),
}));

vi.mock('./chunker', () => ({
  chunkFile: vi.fn((content: string) => [
    { content, startLine: 0, endLine: 1 },
  ]),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('fs/promises', () => ({
  stat: vi.fn(() => Promise.resolve({ mtimeMs: 1000, size: 100 })),
  readFile: vi.fn(() => Promise.resolve('const x = 1;\n')),
  mkdir: vi.fn(() => Promise.resolve()),
}));

vi.mock('vscode', () => ({
  workspace: {
    createFileSystemWatcher: vi.fn(() => ({
      onDidChange: vi.fn(),
      onDidCreate: vi.fn(),
      onDidDelete: vi.fn(),
      dispose: vi.fn(),
    })),
    findFiles: vi.fn(() => Promise.resolve([])),
  },
  Uri: {
    file: (p: string) => ({ fsPath: p }),
  },
  RelativePattern: class {
    constructor(public base: string, public pattern: string) {}
  },
}));

import { Indexer } from './indexer';

describe('Indexer.shouldIndex', () => {
  it('indexes .ts files', () => {
    const indexer = new Indexer(() => 'fake-key');
    expect((indexer as any).shouldIndex('/workspace/src/foo.ts')).toBe(true);
  });

  it('skips node_modules', () => {
    const indexer = new Indexer(() => 'fake-key');
    expect((indexer as any).shouldIndex('/workspace/node_modules/foo.ts')).toBe(false);
  });

  it('skips .min.js files', () => {
    const indexer = new Indexer(() => 'fake-key');
    expect((indexer as any).shouldIndex('/workspace/dist/bundle.min.js')).toBe(false);
  });

  it('skips .lucent/ directory', () => {
    const indexer = new Indexer(() => 'fake-key');
    expect((indexer as any).shouldIndex('/workspace/.lucent/index.db')).toBe(false);
  });

  it('indexes .md files', () => {
    const indexer = new Indexer(() => 'fake-key');
    expect((indexer as any).shouldIndex('/workspace/README.md')).toBe(true);
  });

  it('skips .png files', () => {
    const indexer = new Indexer(() => 'fake-key');
    expect((indexer as any).shouldIndex('/workspace/assets/logo.png')).toBe(false);
  });
});

describe('Indexer.embedChunks', () => {
  it('calls OpenRouter embeddings API and returns Float32Arrays', async () => {
    const embedding = Array.from({ length: 1536 }, () => 0.1);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ embedding }] }),
    });

    const indexer = new Indexer(() => 'test-key');
    const results = await (indexer as any).embedChunks([{ content: 'hello', startLine: 0, endLine: 1 }]);
    expect(results).toHaveLength(1);
    expect(results[0]).toBeInstanceOf(Float32Array);
    expect(results[0].length).toBe(1536);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
      })
    );
  });

  it('throws on API error', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({}) });
    const indexer = new Indexer(() => 'bad-key');
    await expect((indexer as any).embedChunks([{ content: 'x', startLine: 0, endLine: 0 }]))
      .rejects.toThrow('Embeddings API error: 401');
  });
});
