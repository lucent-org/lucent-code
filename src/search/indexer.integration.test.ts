import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';

// Mock only the vscode API (not available outside extension host)
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
  RelativePattern: vi.fn(),
}));

// Mock fetch — only the embeddings endpoint
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { Indexer } from './indexer';
import { VectorStore } from './vector-store';

// dim=3 is a test convenience; real embeddings use 1536 dimensions
function makeFakeEmbedding(dim = 3): number[] {
  return Array.from({ length: dim }, (_, i) => (i === 0 ? 1 : 0));
}

function mockEmbeddingResponse(count: number, dim = 3) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      data: Array.from({ length: count }, () => ({ embedding: makeFakeEmbedding(dim) })),
    }),
  });
}

let tmpDir: string;
let indexer: Indexer;

beforeEach(async () => {
  vi.clearAllMocks();
  tmpDir = path.join(os.tmpdir(), `lucent-indexer-test-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });
  indexer = new Indexer(async () => 'test-key');
  // NOTE: vscode.workspace.findFiles is mocked to return [] above.
  // This means indexer.start() -> reconcileOnStartup() is a no-op (no files to re-index).
  // This is intentional: it keeps start() fast and avoids consuming queued mockFetch
  // responses before individual tests can set them up.
});

afterEach(async () => {
  indexer.dispose();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('Indexer integration', () => {
  it('indexes a TypeScript file and finds it via search', async () => {
    const filePath = path.join(tmpDir, 'hello.ts');
    await fs.writeFile(filePath, 'export function greet(name: string) {\n  return `Hello, ${name}`;\n}\n');

    await indexer.start(tmpDir);

    mockEmbeddingResponse(1);
    await indexer.indexFile(filePath);

    const store: VectorStore = (indexer as any).vectorStore;
    const query = new Float32Array(makeFakeEmbedding());
    const results = store.search(query, 5);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].filePath).toBe(filePath);
  });

  it('does not index a file with a skipped extension (.png)', async () => {
    const filePath = path.join(tmpDir, 'image.png');
    await fs.writeFile(filePath, 'fake png data');

    await indexer.start(tmpDir);
    mockFetch.mockClear(); // clear any fetch calls made during start() so assertions below are clean

    await indexer.indexFile(filePath);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not index a file inside node_modules', async () => {
    const nodeModulesDir = path.join(tmpDir, 'node_modules', 'pkg');
    await fs.mkdir(nodeModulesDir, { recursive: true });
    const filePath = path.join(nodeModulesDir, 'index.ts');
    await fs.writeFile(filePath, 'export {}');

    await indexer.start(tmpDir);
    mockFetch.mockClear(); // clear any fetch calls made during start() so assertions below are clean

    await indexer.indexFile(filePath);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not index a binary file', async () => {
    const filePath = path.join(tmpDir, 'binary.ts');
    const buf = Buffer.alloc(10, 0);
    await fs.writeFile(filePath, buf);

    await indexer.start(tmpDir);
    mockFetch.mockClear(); // clear any fetch calls made during start() so assertions below are clean

    await indexer.indexFile(filePath);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('re-indexing a modified file replaces old chunks', async () => {
    const filePath = path.join(tmpDir, 'changing.ts');
    await fs.writeFile(filePath, 'const x = 1;\n');

    await indexer.start(tmpDir);

    mockEmbeddingResponse(1);
    await indexer.indexFile(filePath);

    await fs.writeFile(filePath, 'const y = 2;\n');
    mockEmbeddingResponse(1);
    await indexer.indexFile(filePath);

    const store: VectorStore = (indexer as any).vectorStore;
    const query = new Float32Array(makeFakeEmbedding());
    const results = store.search(query, 5).filter(r => r.filePath === filePath);

    const contents = results.map(r => r.content);
    expect(contents.some(c => c.includes('y = 2'))).toBe(true);
    expect(contents.every(c => !c.includes('x = 1'))).toBe(true);
  });

  it('indexFile silently skips when embedding API returns non-ok status', async () => {
    const filePath = path.join(tmpDir, 'err.ts');
    await fs.writeFile(filePath, 'const err = true;\n');

    await indexer.start(tmpDir);

    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

    await expect(indexer.indexFile(filePath)).resolves.not.toThrow();

    const store: VectorStore = (indexer as any).vectorStore;
    const results = store.search(new Float32Array(makeFakeEmbedding()), 5);
    expect(results.find(r => r.filePath === filePath)).toBeUndefined();
  });
});
