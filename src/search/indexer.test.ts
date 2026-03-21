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
import * as vscode from 'vscode';

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

describe('Indexer.indexAll', () => {
  const embedding = Array.from({ length: 1536 }, () => 0.1);

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ embedding }] }),
    });
  });

  it('indexes all eligible files returned by findFiles', async () => {
    vi.mocked(vscode.workspace.findFiles).mockResolvedValue([
      { fsPath: '/workspace/src/foo.ts' } as any,
      { fsPath: '/workspace/src/bar.ts' } as any,
    ]);

    const indexer = new Indexer(() => 'test-key');
    const upsertChunks = (indexer as any).vectorStore.upsertChunks as ReturnType<typeof vi.fn>;

    await indexer.indexAll();

    expect(upsertChunks).toHaveBeenCalledTimes(2);
    expect(upsertChunks).toHaveBeenCalledWith('/workspace/src/foo.ts', expect.any(Array), expect.any(Number));
    expect(upsertChunks).toHaveBeenCalledWith('/workspace/src/bar.ts', expect.any(Array), expect.any(Number));
  });

  it('skips files in node_modules even if returned by findFiles', async () => {
    vi.mocked(vscode.workspace.findFiles).mockResolvedValue([
      { fsPath: '/workspace/node_modules/pkg/index.ts' } as any,
      { fsPath: '/workspace/src/app.ts' } as any,
    ]);

    const indexer = new Indexer(() => 'test-key');
    const upsertChunks = (indexer as any).vectorStore.upsertChunks as ReturnType<typeof vi.fn>;

    await indexer.indexAll();

    expect(upsertChunks).toHaveBeenCalledTimes(1);
    expect(upsertChunks).toHaveBeenCalledWith('/workspace/src/app.ts', expect.any(Array), expect.any(Number));
  });
});

describe('Indexer.searchAsync', () => {
  const embedding = Array.from({ length: 1536 }, () => 0.5);

  it('returns search results from vector store', async () => {
    const mockResults = [
      { filePath: '/workspace/src/foo.ts', startLine: 0, endLine: 5, content: 'export function foo() {}', score: 0.9 },
    ];

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ embedding }] }),
    });

    const indexer = new Indexer(() => 'test-key');
    const searchFn = (indexer as any).vectorStore.search as ReturnType<typeof vi.fn>;
    searchFn.mockReturnValue(mockResults);

    const results = await indexer.searchAsync('find foo function', 5);

    expect(results).toEqual(mockResults);
    expect(searchFn).toHaveBeenCalledWith(expect.any(Float32Array), 5);
  });
});

describe('Indexer.startFileWatcher', () => {
  it('registers a file watcher and re-indexes on change events', async () => {
    const onDidChangeCb: Array<(uri: { fsPath: string }) => void> = [];
    const mockWatcher = {
      onDidChange: vi.fn((cb: (uri: { fsPath: string }) => void) => { onDidChangeCb.push(cb); }),
      onDidCreate: vi.fn(),
      onDidDelete: vi.fn(),
      dispose: vi.fn(),
    };
    vi.mocked(vscode.workspace.createFileSystemWatcher).mockReturnValue(mockWatcher as any);

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ embedding: Array.from({ length: 1536 }, () => 0.1) }] }),
    });

    const indexer = new Indexer(() => 'test-key');
    // start() sets up the watcher
    await indexer.start('/workspace');

    expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalled();
    expect(mockWatcher.onDidChange).toHaveBeenCalled();

    // Simulate a file change event for an eligible file
    const upsertChunks = (indexer as any).vectorStore.upsertChunks as ReturnType<typeof vi.fn>;
    upsertChunks.mockClear();

    // Trigger the registered onChange callback
    const changeUri = { fsPath: '/workspace/src/changed.ts' };
    for (const cb of onDidChangeCb) {
      cb(changeUri);
    }

    // Allow microtasks/promises to settle
    await new Promise((r) => setTimeout(r, 10));

    expect(upsertChunks).toHaveBeenCalledWith('/workspace/src/changed.ts', expect.any(Array), expect.any(Number));
  });
});
