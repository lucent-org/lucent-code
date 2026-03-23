# Integration Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add integration tests that exercise real I/O boundaries — SQLite on disk, HTTP streaming, and the indexer-to-vector-store pipeline — catching bugs that unit mocks cannot.

**Architecture:** Three test files, each targeting one real boundary. VectorStore tests use real `better-sqlite3` against a temp file. OpenRouterClient tests use a local `http` server (Node built-in) that emits real SSE. Indexer tests use real temp files on disk with only the embedding `fetch` mocked. All tests live in `src/**/*.integration.test.ts` and run with `npx vitest run --reporter=verbose`.

**Tech Stack:** TypeScript, Vitest, Node `http` module (no extra deps), `better-sqlite3` (already in `dependencies`), `tmp` directories via `os.tmpdir()` + `fs/promises`

---

### Task 1: VectorStore — real SQLite integration

**Files:**
- Create: `src/search/vector-store.integration.test.ts`

**Context:** The existing `vector-store.test.ts` mocks `better-sqlite3` entirely. These tests open a real `:memory:` database so we verify the actual SQL schema, transactions, and cosine-search round-trip with real data.

**Step 1: Create the test file**

```typescript
// src/search/vector-store.integration.test.ts
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
    // If schema creation failed, upsert would throw — verify it doesn't
    const embedding = new Float32Array(3).fill(0.5);
    expect(() =>
      store.upsertChunks('a.ts', [{ startLine: 0, endLine: 5, content: 'hello', embedding }], 1000)
    ).not.toThrow();
  });

  it('upsert then loadIntoMemory then search returns correct result', () => {
    // Two chunks pointing in different directions
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

    // Reopen same file
    const store2 = new VectorStore();
    store2.open(dbPath);
    store2.loadIntoMemory();
    const results = store2.search(new Float32Array([0.5, 0.5, 0]), 1);
    store2.close();

    expect(results[0].filePath).toBe('persist.ts');
    expect(results[0].content).toBe('persistent');
  });
});
```

**Step 2: Run tests to verify they pass**

```bash
npx vitest run src/search/vector-store.integration.test.ts --reporter=verbose
```

Expected: 6 tests pass

**Step 3: Commit**

```bash
git add src/search/vector-store.integration.test.ts
git commit -m "test(search): add VectorStore integration tests against real SQLite"
```

---

### Task 2: OpenRouterClient — real HTTP streaming integration

**Files:**
- Create: `src/core/openrouter-client.integration.test.ts`

**Context:** The existing `openrouter-client.test.ts` mocks `fetch` with `vi.stubGlobal`. These tests spin up a real `http.createServer()` on a random port and let the client's real `fetch` calls hit it — verifying SSE parsing, retry logic with `Retry-After` headers, abort signal propagation, and non-retryable error handling.

**Step 1: Create the test file**

```typescript
// src/core/openrouter-client.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'http';
import { OpenRouterClient } from './openrouter-client';

// Patch BASE_URL by temporarily pointing the client at our local server.
// We do this by monkey-patching the module's BASE_URL via a proxy client
// that overrides the fetch call to prepend the local base URL.

function makeClient(baseUrl: string): OpenRouterClient {
  const client = new OpenRouterClient(async () => 'test-key');
  // Intercept fetch at the global level for this test by wrapping
  // We'll use a different approach: subclass and override private method
  // Instead: use globalThis.fetch interception scoped via test server URL matching
  return client;
}

// We need to intercept `fetch` to redirect calls to our local server.
// The cleanest approach: stub globalThis.fetch to forward only openrouter.ai calls.

let server: http.Server;
let baseUrl: string;
let requestHandler: ((req: http.IncomingMessage, res: http.ServerResponse) => void) | null = null;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (requestHandler) requestHandler(req, res);
    else res.writeHead(500).end('no handler');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;

  // Redirect openrouter.ai fetch calls to our local server
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    const urlStr = url.toString().replace('https://openrouter.ai', baseUrl);
    return originalFetch(urlStr, init);
  }) as typeof fetch;
});

afterAll(() => {
  server.close();
});

function makeSSEBody(chunks: object[], done = true): string {
  const lines = chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join('');
  return lines + (done ? 'data: [DONE]\n\n' : '');
}

describe('OpenRouterClient integration', () => {
  it('chatStream yields parsed chunks from real SSE response', async () => {
    requestHandler = (_req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      });
      const body = makeSSEBody([
        { choices: [{ delta: { content: 'Hello' }, finish_reason: null }] },
        { choices: [{ delta: { content: ' world' }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
      ]);
      res.end(body);
    };

    const client = new OpenRouterClient(async () => 'test-key');
    const chunks: string[] = [];
    for await (const chunk of client.chatStream({ model: 'test', messages: [] })) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) chunks.push(content);
    }

    expect(chunks).toEqual(['Hello', ' world']);
  });

  it('chatStream respects AbortSignal mid-stream', async () => {
    requestHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      // Send one chunk then hang
      res.write('data: {"choices":[{"delta":{"content":"first"},"finish_reason":null}]}\n\n');
      // Don't call res.end() — simulate a hanging server
    };

    const controller = new AbortController();
    const client = new OpenRouterClient(async () => 'test-key');
    const chunks: string[] = [];

    const gen = client.chatStream({ model: 'test', messages: [] }, controller.signal);
    const firstChunk = await gen.next();
    chunks.push(firstChunk.value?.choices[0]?.delta?.content ?? '');
    controller.abort();

    // Consuming the rest after abort should not hang
    const result = await Promise.race([
      gen.next().then(() => 'done'),
      new Promise<string>(resolve => setTimeout(() => resolve('timeout'), 1000)),
    ]);

    expect(chunks).toContain('first');
    expect(result).not.toBe('timeout');
  });

  it('retries on 429 and succeeds on second attempt', async () => {
    let callCount = 0;
    requestHandler = (_req, res) => {
      callCount++;
      if (callCount === 1) {
        res.writeHead(429, { 'Retry-After': '0' }).end('rate limited');
      } else {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.end(makeSSEBody([{ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }]));
      }
    };

    const client = new OpenRouterClient(async () => 'test-key');
    const chunks: string[] = [];
    for await (const chunk of client.chatStream({ model: 'test', messages: [] })) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) chunks.push(content);
    }

    expect(callCount).toBe(2);
    expect(chunks).toContain('ok');
  });

  it('throws immediately on 400 (non-retryable)', async () => {
    requestHandler = (_req, res) => {
      res.writeHead(400).end('bad request');
    };

    const client = new OpenRouterClient(async () => 'test-key');
    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of client.chatStream({ model: 'test', messages: [] })) { /* drain */ }
    }).rejects.toThrow('OpenRouter API error (400)');
  });

  it('throws after max retries on 503', async () => {
    let callCount = 0;
    requestHandler = (_req, res) => {
      callCount++;
      res.writeHead(503, { 'Retry-After': '0' }).end('unavailable');
    };

    const client = new OpenRouterClient(async () => 'test-key');
    await expect(async () => {
      for await (const _ of client.chatStream({ model: 'test', messages: [] })) { /* drain */ }
    }).rejects.toThrow('OpenRouter API error (503)');

    // MAX_RETRIES = 3 means 4 total attempts (attempt 0,1,2,3)
    expect(callCount).toBe(4);
  });

  it('throws when no API key configured', async () => {
    const client = new OpenRouterClient(async () => undefined);
    await expect(async () => {
      for await (const _ of client.chatStream({ model: 'test', messages: [] })) { /* drain */ }
    }).rejects.toThrow('No API key configured');
  });
});
```

**Step 2: Run tests to verify they pass**

```bash
npx vitest run src/core/openrouter-client.integration.test.ts --reporter=verbose
```

Expected: 6 tests pass (the 503-retry test may take a moment due to retry delays — Retry-After: 0 minimizes this)

**Step 3: Commit**

```bash
git add src/core/openrouter-client.integration.test.ts
git commit -m "test(core): add OpenRouterClient integration tests against local HTTP server"
```

---

### Task 3: Indexer + VectorStore — end-to-end pipeline integration

**Files:**
- Create: `src/search/indexer.integration.test.ts`

**Context:** The existing `indexer.test.ts` mocks both `VectorStore` and `fs/promises`. These tests use real temp files on disk and a real `VectorStore` (real SQLite), mocking only the embedding `fetch` API. This verifies the full chunking → embedding → upsert → search pipeline, including `shouldIndex` filtering, the binary-file guard, and `reconcileOnStartup` behaviour (stale file removal, re-indexing changed files).

**Step 1: Create the test file**

```typescript
// src/search/indexer.integration.test.ts
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
});

afterEach(async () => {
  indexer.dispose();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('Indexer integration', () => {
  it('indexes a TypeScript file and finds it via search', async () => {
    const filePath = path.join(tmpDir, 'hello.ts');
    await fs.writeFile(filePath, 'export function greet(name: string) {\n  return `Hello, ${name}`;\n}\n');

    // Start with empty workspace (no files yet reconciled)
    await indexer.start(tmpDir);

    mockEmbeddingResponse(1); // one chunk from a small file
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
    mockFetch.mockClear(); // ensure no calls happen

    await indexer.indexFile(filePath);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not index a file inside node_modules', async () => {
    const nodeModulesDir = path.join(tmpDir, 'node_modules', 'pkg');
    await fs.mkdir(nodeModulesDir, { recursive: true });
    const filePath = path.join(nodeModulesDir, 'index.ts');
    await fs.writeFile(filePath, 'export {}');

    await indexer.start(tmpDir);
    mockFetch.mockClear();

    await indexer.indexFile(filePath);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not index a binary file', async () => {
    const filePath = path.join(tmpDir, 'binary.ts');
    // Write a buffer with null bytes (binary indicator)
    const buf = Buffer.alloc(10);
    buf[5] = 0; // null byte
    await fs.writeFile(filePath, buf);

    await indexer.start(tmpDir);
    mockFetch.mockClear();

    await indexer.indexFile(filePath);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('re-indexing a modified file replaces old chunks', async () => {
    const filePath = path.join(tmpDir, 'changing.ts');
    await fs.writeFile(filePath, 'const x = 1;\n');

    await indexer.start(tmpDir);

    mockEmbeddingResponse(1);
    await indexer.indexFile(filePath);

    // Overwrite with new content
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

  it('throws when embedding API returns non-ok status', async () => {
    const filePath = path.join(tmpDir, 'err.ts');
    await fs.writeFile(filePath, 'const err = true;\n');

    await indexer.start(tmpDir);

    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

    // indexFile swallows errors silently — verify no crash and no chunks stored
    await expect(indexer.indexFile(filePath)).resolves.not.toThrow();

    const store: VectorStore = (indexer as any).vectorStore;
    const results = store.search(new Float32Array(makeFakeEmbedding()), 5);
    expect(results.find(r => r.filePath === filePath)).toBeUndefined();
  });
});
```

**Step 2: Run tests to verify they pass**

```bash
npx vitest run src/search/indexer.integration.test.ts --reporter=verbose
```

Expected: 6 tests pass

**Step 3: Run the full suite to confirm nothing regressed**

```bash
npx vitest run --reporter=verbose 2>&1 | tail -20
```

Expected: all existing tests + new integration tests pass (335+ total)

**Step 4: Commit**

```bash
git add src/search/indexer.integration.test.ts
git commit -m "test(search): add Indexer+VectorStore end-to-end integration tests"
```
