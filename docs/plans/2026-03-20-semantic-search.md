# Semantic Codebase Search — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add meaning-based code retrieval: the AI can call `semantic_search` as a tool, and users can type `@codebase <query>` in the chat input to inject relevant code context.

**Architecture:** Three new files in `src/search/` (chunker, vector-store, indexer) wire into existing `editor-tools.ts`, `message-handler.ts`, `ChatInput.tsx`, and `extension.ts`. SQLite persists embeddings; Float32Array cosine similarity runs in memory. OpenRouter embeddings API — same Bearer token as chat.

**Tech Stack:** TypeScript, `better-sqlite3`, VS Code Extension API, SolidJS (webview), Vitest

**Design doc:** `docs/plans/2026-03-20-semantic-search-design.md`

---

### Task 1: Dependencies & project setup

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`

**Step 1: Install better-sqlite3**

```bash
npm install better-sqlite3
npm install --save-dev @types/better-sqlite3 @electron/rebuild
```

**Step 2: Add rebuild script to `package.json`**

In `package.json`, inside `"scripts"`, add:

```json
"rebuild": "electron-rebuild -f -w better-sqlite3"
```

**Step 3: Rebuild better-sqlite3 for VS Code's Electron version**

VS Code runs on Electron. After installing, the native module must be recompiled:

```bash
npx @electron/rebuild -f -w better-sqlite3
```

This produces a native `.node` binary in `node_modules/better-sqlite3/build/Release/` compatible with VS Code's Node ABI. Re-run after any VS Code update.

If `@electron/rebuild` cannot find the Electron version automatically, check VS Code's version in Help → About, then run:

```bash
npx @electron/rebuild -f -w better-sqlite3 --electronVersion 32.2.6
```

(Substitute the actual version number.)

**Step 4: Add `.lucent/` to `.gitignore`**

Open `.gitignore`, add at the end:

```
.lucent/
```

**Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: add better-sqlite3 dependency and rebuild script for semantic search"
```

---

### Task 2: Chunker

**Files:**
- Create: `src/search/chunker.ts`
- Create: `src/search/chunker.test.ts`

**Step 1: Write the failing tests**

Create `src/search/chunker.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { chunkFile } from './chunker';

describe('chunkFile', () => {
  it('returns empty array for empty content', () => {
    expect(chunkFile('')).toEqual([]);
  });

  it('returns single chunk for short file', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n');
    const chunks = chunkFile(lines);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].startLine).toBe(0);
    expect(chunks[0].endLine).toBe(9);
  });

  it('splits file into overlapping chunks at 40 lines', () => {
    const lines = Array.from({ length: 80 }, (_, i) => `line ${i}`).join('\n');
    const chunks = chunkFile(lines);
    // First chunk: lines 0–39; second: 35–74; third: 70–79
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].startLine).toBe(0);
    expect(chunks[0].endLine).toBe(39);
    expect(chunks[1].startLine).toBe(35); // 40 - 5 overlap
  });

  it('last chunk covers remaining lines', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
    const chunks = chunkFile(lines);
    const last = chunks[chunks.length - 1];
    expect(last.endLine).toBe(49);
  });

  it('chunk content matches source lines', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
    const chunks = chunkFile(lines);
    expect(chunks[0].content).toBe(lines);
  });
});
```

**Step 2: Run test to confirm failure**

```bash
npx vitest run src/search/chunker.test.ts
```

Expected: FAIL — `chunker.ts` does not exist.

**Step 3: Implement `src/search/chunker.ts`**

```typescript
export interface Chunk {
  content: string;
  startLine: number;
  endLine: number;
}

const CHUNK_SIZE = 40;  // lines per chunk
const OVERLAP = 5;      // overlap between consecutive chunks

export function chunkFile(content: string): Chunk[] {
  if (!content) return [];

  const lines = content.split('\n');
  const chunks: Chunk[] = [];
  let start = 0;

  while (start < lines.length) {
    const end = Math.min(start + CHUNK_SIZE - 1, lines.length - 1);
    chunks.push({
      content: lines.slice(start, end + 1).join('\n'),
      startLine: start,
      endLine: end,
    });
    if (end === lines.length - 1) break;
    start = end + 1 - OVERLAP;
  }

  return chunks;
}
```

**Step 4: Run tests**

```bash
npx vitest run src/search/chunker.test.ts
```

Expected: all 5 tests pass.

**Step 5: Commit**

```bash
git add src/search/chunker.ts src/search/chunker.test.ts
git commit -m "feat(search): add file chunker with overlapping 40-line chunks"
```

---

### Task 3: Vector Store

**Files:**
- Create: `src/search/vector-store.ts`
- Create: `src/search/vector-store.test.ts`

**Step 1: Write the failing tests**

Create `src/search/vector-store.test.ts`:

```typescript
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
    // Manually inject memory state
    const dim = 3;
    const store2 = new VectorStore();
    store2.open(':memory:');
    // We test via loadIntoMemory indirectly through search
    // Insert one embedding: [1,0,0], query [1,0,0] → similarity 1.0
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
    store2.loadIntoMemory();
    const results = store2.search(queryEmbedding, 1);
    expect(results).toHaveLength(1);
    expect(results[0].filePath).toBe('test.ts');
    expect(results[0].score).toBeCloseTo(1.0);
  });

  it('close calls db.close()', () => {
    store.close();
    expect(mockClose).toHaveBeenCalled();
  });
});
```

**Step 2: Run tests to confirm failure**

```bash
npx vitest run src/search/vector-store.test.ts
```

Expected: FAIL — `vector-store.ts` does not exist.

**Step 3: Implement `src/search/vector-store.ts`**

```typescript
import Database from 'better-sqlite3';

export interface SearchResult {
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  score: number;
}

interface ChunkRow {
  file_path: string;
  start_line: number;
  end_line: number;
  content: string;
  embedding: Buffer;
}

interface ChunkMeta {
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS chunks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path  TEXT    NOT NULL,
  start_line INTEGER NOT NULL,
  end_line   INTEGER NOT NULL,
  content    TEXT    NOT NULL,
  embedding  BLOB    NOT NULL,
  mtime      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_file_path ON chunks(file_path);
`;

export class VectorStore {
  private db!: Database.Database;
  private embeddingsMatrix: Float32Array = new Float32Array(0);
  private metadata: ChunkMeta[] = [];
  private dim = 1536; // text-embedding-3-small dimension

  open(dbPath: string): void {
    this.db = new Database(dbPath);
    this.db.exec(SCHEMA);
  }

  upsertChunks(
    filePath: string,
    chunks: { startLine: number; endLine: number; content: string; embedding: Float32Array }[],
    mtime: number
  ): void {
    const deleteStmt = this.db.prepare('DELETE FROM chunks WHERE file_path = ?');
    const insertStmt = this.db.prepare(
      'INSERT INTO chunks (file_path, start_line, end_line, content, embedding, mtime) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const tx = this.db.transaction(() => {
      deleteStmt.run(filePath);
      for (const chunk of chunks) {
        const buf = Buffer.from(chunk.embedding.buffer);
        insertStmt.run(filePath, chunk.startLine, chunk.endLine, chunk.content, buf, mtime);
      }
    });
    tx();
  }

  deleteFile(filePath: string): void {
    this.db.prepare('DELETE FROM chunks WHERE file_path = ?').run(filePath);
  }

  loadIntoMemory(): void {
    const rows = this.db
      .prepare('SELECT file_path, start_line, end_line, content, embedding FROM chunks')
      .all() as ChunkRow[];

    this.metadata = [];
    const flat: number[] = [];

    for (const row of rows) {
      const embedding = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4);
      this.metadata.push({
        filePath: row.file_path,
        startLine: row.start_line,
        endLine: row.end_line,
        content: row.content,
      });
      for (let i = 0; i < embedding.length; i++) {
        flat.push(embedding[i]);
      }
    }

    if (this.metadata.length > 0) {
      this.dim = flat.length / this.metadata.length;
    }
    this.embeddingsMatrix = new Float32Array(flat);
  }

  search(queryEmbedding: Float32Array, topK: number): SearchResult[] {
    if (this.metadata.length === 0) return [];

    const qNorm = norm(queryEmbedding);
    if (qNorm === 0) return [];

    const scores: { index: number; score: number }[] = [];

    for (let i = 0; i < this.metadata.length; i++) {
      const offset = i * this.dim;
      const chunk = this.embeddingsMatrix.subarray(offset, offset + this.dim);
      const score = dot(queryEmbedding, chunk) / (qNorm * norm(chunk));
      scores.push({ index: i, score });
    }

    scores.sort((a, b) => b.score - a.score);

    return scores.slice(0, topK).map(({ index, score }) => ({
      ...this.metadata[index],
      score,
    }));
  }

  getAllFileMtimes(): Map<string, number> {
    const rows = this.db
      .prepare('SELECT file_path, mtime FROM chunks GROUP BY file_path')
      .all() as { file_path: string; mtime: number }[];
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.file_path, row.mtime);
    }
    return map;
  }

  close(): void {
    this.db.close();
  }
}

function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function norm(a: Float32Array): number {
  return Math.sqrt(dot(a, a));
}
```

**Step 4: Run tests**

```bash
npx vitest run src/search/vector-store.test.ts
```

Expected: all 6 tests pass.

**Step 5: Commit**

```bash
git add src/search/vector-store.ts src/search/vector-store.test.ts
git commit -m "feat(search): add VectorStore with SQLite persistence and cosine similarity search"
```

---

### Task 4: Indexer

**Files:**
- Create: `src/search/indexer.ts`
- Create: `src/search/indexer.test.ts`

**Step 1: Write the failing tests**

Create `src/search/indexer.test.ts`:

```typescript
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
  stat: vi.fn(() => Promise.resolve({ mtimeMs: 1000 })),
  readFile: vi.fn(() => Promise.resolve('const x = 1;\n')),
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
    const indexer = new Indexer('fake-key');
    expect((indexer as any).shouldIndex('/workspace/src/foo.ts')).toBe(true);
  });

  it('skips node_modules', () => {
    const indexer = new Indexer('fake-key');
    expect((indexer as any).shouldIndex('/workspace/node_modules/foo.ts')).toBe(false);
  });

  it('skips .min.js files', () => {
    const indexer = new Indexer('fake-key');
    expect((indexer as any).shouldIndex('/workspace/dist/bundle.min.js')).toBe(false);
  });

  it('skips .lucent/ directory', () => {
    const indexer = new Indexer('fake-key');
    expect((indexer as any).shouldIndex('/workspace/.lucent/index.db')).toBe(false);
  });

  it('indexes .md files', () => {
    const indexer = new Indexer('fake-key');
    expect((indexer as any).shouldIndex('/workspace/README.md')).toBe(true);
  });

  it('skips .png files', () => {
    const indexer = new Indexer('fake-key');
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

    const indexer = new Indexer('test-key');
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
    const indexer = new Indexer('bad-key');
    await expect((indexer as any).embedChunks([{ content: 'x', startLine: 0, endLine: 0 }]))
      .rejects.toThrow('Embeddings API error: 401');
  });
});
```

**Step 2: Run tests to confirm failure**

```bash
npx vitest run src/search/indexer.test.ts
```

Expected: FAIL — `indexer.ts` does not exist.

**Step 3: Implement `src/search/indexer.ts`**

```typescript
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { VectorStore, SearchResult } from './vector-store';
import { chunkFile } from './chunker';

const INDEXABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.cs',
  '.java', '.md', '.json',
]);

const SKIP_DIRS = ['node_modules', '.git', 'dist', 'out', 'build', '.lucent'];
const SKIP_SUFFIXES = ['.min.js', '.map', '.lock', '.png', '.jpg', '.svg', '.woff'];
const MAX_FILE_SIZE = 500 * 1024; // 500 KB
const EMBED_BATCH_SIZE = 100;

export class Indexer {
  private readonly vectorStore = new VectorStore();
  private workspaceRoot = '';
  private dbPath = '';

  constructor(private readonly getApiKey: () => string | Promise<string>) {}

  async start(workspaceRoot: string): Promise<void> {
    this.workspaceRoot = workspaceRoot;
    this.dbPath = path.join(workspaceRoot, '.lucent', 'index.db');

    await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
    this.vectorStore.open(this.dbPath);
    this.vectorStore.loadIntoMemory();

    this.startFileWatcher();
    await this.reconcileOnStartup();
  }

  async indexAll(): Promise<void> {
    const uris = await vscode.workspace.findFiles('**/*', '{**/node_modules/**,**/.git/**,**/dist/**,**/out/**,**/build/**,**/.lucent/**}');
    const paths = uris.map((u) => u.fsPath).filter((p) => this.shouldIndex(p));
    for (const filePath of paths) {
      await this.indexFile(filePath);
    }
  }

  async indexFile(filePath: string): Promise<void> {
    if (!this.shouldIndex(filePath)) return;

    try {
      const stat = await fs.stat(filePath);
      if (stat.size > MAX_FILE_SIZE) return;

      const content = await fs.readFile(filePath, 'utf8');
      if (isBinary(content)) return;

      const chunks = chunkFile(content);
      if (chunks.length === 0) return;

      const embeddings = await this.embedChunks(chunks);
      const chunksWithEmbeddings = chunks.map((c, i) => ({ ...c, embedding: embeddings[i] }));

      this.vectorStore.upsertChunks(filePath, chunksWithEmbeddings, stat.mtimeMs);
      this.vectorStore.loadIntoMemory();
    } catch {
      // Skip unreadable files silently
    }
  }

  search(query: string, topK: number): SearchResult[] {
    // Synchronous search using already-loaded memory — caller handles async embedding
    throw new Error('Use searchAsync for query embedding');
  }

  async searchAsync(query: string, topK: number): Promise<SearchResult[]> {
    const [queryEmbedding] = await this.embedChunks([{ content: query, startLine: 0, endLine: 0 }]);
    return this.vectorStore.search(queryEmbedding, topK);
  }

  dispose(): void {
    this.vectorStore.close();
  }

  private shouldIndex(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/');

    for (const dir of SKIP_DIRS) {
      if (normalized.includes(`/${dir}/`) || normalized.includes(`/${dir}`)) return false;
    }

    for (const suffix of SKIP_SUFFIXES) {
      if (normalized.endsWith(suffix)) return false;
    }

    const ext = path.extname(filePath).toLowerCase();
    return INDEXABLE_EXTENSIONS.has(ext);
  }

  private async embedChunks(chunks: { content: string }[]): Promise<Float32Array[]> {
    const results: Float32Array[] = [];

    for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
      const apiKey = await this.getApiKey();

      const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'openai/text-embedding-3-small',
          input: batch.map((c) => c.content),
        }),
      });

      if (!response.ok) {
        throw new Error(`Embeddings API error: ${response.status}`);
      }

      const json = await response.json() as { data: { embedding: number[] }[] };
      for (const item of json.data) {
        results.push(new Float32Array(item.embedding));
      }
    }

    return results;
  }

  private startFileWatcher(): void {
    const watcher = vscode.workspace.createFileSystemWatcher('**/*');
    watcher.onDidChange((uri) => { void this.indexFile(uri.fsPath); });
    watcher.onDidCreate((uri) => { void this.indexFile(uri.fsPath); });
    watcher.onDidDelete((uri) => {
      this.vectorStore.deleteFile(uri.fsPath);
      this.vectorStore.loadIntoMemory();
    });
  }

  private async reconcileOnStartup(): Promise<void> {
    const stored = this.vectorStore.getAllFileMtimes();
    const uris = await vscode.workspace.findFiles('**/*', '{**/node_modules/**,**/.git/**,**/dist/**,**/out/**,**/build/**,**/.lucent/**}');

    const current = new Map<string, number>();
    for (const uri of uris) {
      if (!this.shouldIndex(uri.fsPath)) continue;
      try {
        const stat = await fs.stat(uri.fsPath);
        current.set(uri.fsPath, stat.mtimeMs);
      } catch { /* deleted between glob and stat */ }
    }

    // Remove deleted files
    for (const [filePath] of stored) {
      if (!current.has(filePath)) {
        this.vectorStore.deleteFile(filePath);
      }
    }

    // Re-index modified or new files
    for (const [filePath, mtime] of current) {
      if (stored.get(filePath) !== mtime) {
        await this.indexFile(filePath);
      }
    }

    this.vectorStore.loadIntoMemory();
  }
}

function isBinary(content: string): boolean {
  // Check first 512 chars for null bytes (binary indicator)
  const sample = content.slice(0, 512);
  return sample.includes('\0');
}
```

**Step 4: Run tests**

```bash
npx vitest run src/search/indexer.test.ts
```

Expected: all 8 tests pass.

**Step 5: Commit**

```bash
git add src/search/indexer.ts src/search/indexer.test.ts
git commit -m "feat(search): add Indexer with OpenRouter embeddings, file watcher, and startup reconciliation"
```

---

### Task 5: `semantic_search` tool

**Files:**
- Modify: `src/lsp/editor-tools.ts`
- Modify: `src/lsp/editor-tools.test.ts`

**Context:** `TOOL_DEFINITIONS` is a plain array at line 22 of `editor-tools.ts`. The `EditorToolExecutor.execute()` method dispatches tool calls by name. Look at any existing tool handler (e.g., `search_files`) to understand the dispatch pattern.

**Step 1: Read the rest of `editor-tools.ts`**

Read `src/lsp/editor-tools.ts` lines 120–end to understand the `execute()` method and existing tool handlers.

**Step 2: Add `semantic_search` to `TOOL_DEFINITIONS`**

In `src/lsp/editor-tools.ts`, after the last entry in `TOOL_DEFINITIONS` (find the last `},` before the closing `];`), append:

```typescript
  {
    type: 'function',
    function: {
      name: 'semantic_search',
      description: 'Search the codebase for code semantically related to a natural language query. Use this when grep_files would miss results because the query is conceptual rather than literal.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Natural language description of what to find' },
          limit: { type: 'number', description: 'Max results to return (default 8, max 20)' },
        },
        required: ['query'],
      },
    },
  },
```

**Step 3: Add `indexer` parameter to `EditorToolExecutor`**

Read `src/lsp/editor-tools.ts` to find the `EditorToolExecutor` class constructor. Add an optional `indexer` parameter:

```typescript
import type { Indexer } from '../search/indexer';
```

In the constructor signature, add:
```typescript
private readonly indexer?: Indexer
```

**Step 4: Add handler in `execute()` for `semantic_search`**

In the `execute()` dispatch method, add a case for `semantic_search`:

```typescript
case 'semantic_search': {
  const { query, limit } = args as { query: string; limit?: number };
  if (!this.indexer) {
    return { success: false, error: 'Codebase index not initialised' };
  }
  try {
    const results = await this.indexer.searchAsync(query, Math.min(limit ?? 8, 20));
    if (results.length === 0) {
      return { success: true, message: 'No results found for query.' };
    }
    const formatted = results
      .map((r) => `${r.filePath}:${r.startLine}–${r.endLine}\n\`\`\`\n${r.content}\n\`\`\``)
      .join('\n\n');
    return { success: true, message: formatted };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
```

**Step 5: Add test for `semantic_search` tool definition**

In `src/lsp/editor-tools.test.ts`, add a test:

```typescript
it('TOOL_DEFINITIONS includes semantic_search', () => {
  const tool = TOOL_DEFINITIONS.find((t) => t.function.name === 'semantic_search');
  expect(tool).toBeDefined();
  expect(tool!.function.parameters.required).toContain('query');
});
```

**Step 6: Run all editor-tools tests**

```bash
npx vitest run src/lsp/editor-tools.test.ts
```

Expected: all tests pass including the new one.

**Step 7: Commit**

```bash
git add src/lsp/editor-tools.ts src/lsp/editor-tools.test.ts
git commit -m "feat(search): add semantic_search tool to editor tools"
```

---

### Task 6: `@codebase` mention

**Files:**
- Modify: `webview/src/components/ChatInput.tsx`
- Modify: `src/chat/message-handler.ts`

**Step 1: Add `'search'` kind to `MentionSource` interface in `ChatInput.tsx`**

Find (line 7):
```typescript
  kind: 'context' | 'action';
```

Replace with:
```typescript
  kind: 'context' | 'action' | 'search';
```

**Step 2: Add `codebase` to `MENTION_SOURCES`**

In `MENTION_SOURCES` (line 10), add after the `terminal` entry:

```typescript
  { id: 'codebase', label: '@codebase', description: 'Semantic search across all indexed files', kind: 'search' },
```

**Step 3: Handle `'search'` kind in `selectMention`**

In `selectMention` (around line 206), inside the `try` block, before the `const content = await...` line, add early return for search mentions:

```typescript
    if (source.kind === 'search') {
      // Insert @codebase marker; user types the query after it
      setInput(`${beforeAt}@${source.id} `);
      return;
    }
```

**Step 4: Build webview to verify no TypeScript errors**

```bash
cd webview && npm run build && cd ..
```

Expected: build completes with no errors.

**Step 5: Intercept `@codebase` in `message-handler.ts`**

In `src/chat/message-handler.ts`, add `indexer` as optional constructor parameter:

```typescript
import type { Indexer } from '../search/indexer';
```

In the constructor, add at the end:

```typescript
private readonly indexer?: Indexer
```

In `handleSendMessage`, **before** the line `const skillMatches = ...` (around line 193), add:

```typescript
    // Handle @codebase semantic search
    let processedContent = content;
    if (content.startsWith('@codebase') && this.indexer) {
      const query = content.slice('@codebase'.length).trim();
      if (query) {
        try {
          const results = await this.indexer.searchAsync(query, 10);
          if (results.length > 0) {
            const contextBlock = results
              .map((r) => `${r.filePath}:${r.startLine}–${r.endLine}\n\`\`\`\n${r.content}\n\`\`\``)
              .join('\n\n');
            systemMessage.content += `\n\n<codebase-context query="${query}">\n${contextBlock}\n</codebase-context>`;
          }
        } catch {
          // Non-fatal — send message without codebase context
        }
        processedContent = query;
      }
    }
```

Then update the `baseContent` line below to use `processedContent` instead of `content`:

Find:
```typescript
    const baseContent = skillBlocks ? `${skillBlocks}\n\n${content}` : content;
```

Replace with:
```typescript
    const baseContent = skillBlocks ? `${skillBlocks}\n\n${processedContent}` : processedContent;
```

**Step 6: Add test in `message-handler.test.ts`**

Read the existing test file to understand the mock patterns, then add:

```typescript
it('injects codebase context when message starts with @codebase', async () => {
  const mockIndexer = {
    searchAsync: vi.fn(() => Promise.resolve([
      { filePath: 'src/auth.ts', startLine: 0, endLine: 10, content: 'export class AuthManager {}', score: 0.9 },
    ])),
  };
  // Construct handler with mock indexer injected
  // (adapt to the existing test setup pattern in this file)
  // Verify that the system message contains <codebase-context>
});
```

Read `src/chat/message-handler.test.ts` first to see the exact mock setup. Adapt the test to match the existing patterns.

**Step 7: Run tests**

```bash
npx vitest run src/chat/message-handler.test.ts
```

Expected: all tests pass.

**Step 8: Commit**

```bash
git add webview/src/components/ChatInput.tsx src/chat/message-handler.ts
git add webview/dist/
git commit -m "feat(search): add @codebase mention to chat input and intercept in message handler"
```

---

### Task 7: Extension wiring

**Files:**
- Modify: `src/extension.ts`
- Modify: `package.json`

**Context:** `extension.ts` follows a pattern: import → instantiate → register status bar → register commands → push to `context.subscriptions`. The `MessageHandler` constructor is called at line 193 with all deps. The `workspaceRoot` variable is already defined at line 97.

**Step 1: Import `Indexer` in `extension.ts`**

At the top of `extension.ts`, after the existing imports, add:

```typescript
import { Indexer } from './search/indexer';
```

**Step 2: Instantiate and start the indexer**

After the `const workspaceRoot = ...` line (around line 97), add:

```typescript
  const indexer = new Indexer(() => auth.getApiKey());
```

After `await connectMcpServers()` (around line 105), add:

```typescript
  if (workspaceRoot) {
    indexer.start(workspaceRoot).catch((e: Error) => {
      console.error('[Indexer] Failed to start:', e.message);
    });
  }
```

**Step 3: Add indexer status bar item**

After the `skillsStatusBar` block (around line 191), add:

```typescript
  // Indexer status bar
  const indexerStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 88);
  indexerStatusBar.command = 'lucentCode.indexCodebase';
  indexerStatusBar.text = '$(database) Indexed';
  indexerStatusBar.tooltip = 'Lucent Code: Codebase index — click to re-index';
  indexerStatusBar.show();
  context.subscriptions.push(indexerStatusBar);
```

**Step 4: Register `indexCodebase` command**

Find the block where other commands are registered (search for `registerCommand` in `extension.ts`). Add:

```typescript
  context.subscriptions.push(
    vscode.commands.registerCommand('lucentCode.indexCodebase', () => {
      indexerStatusBar.text = '$(loading~spin) Indexing…';
      indexer.indexAll()
        .then(() => { indexerStatusBar.text = '$(database) Indexed'; })
        .catch(() => { indexerStatusBar.text = '$(warning) Index failed'; });
    })
  );
```

**Step 5: Pass `indexer` to `EditorToolExecutor` and `MessageHandler`**

Find the line that creates `toolExecutor` (around line 142):
```typescript
  const toolExecutor = new EditorToolExecutor(() => auth.getTavilyApiKey());
```

Replace with:
```typescript
  const toolExecutor = new EditorToolExecutor(() => auth.getTavilyApiKey(), indexer);
```

Find the line that creates `messageHandler` (around line 193):
```typescript
  messageHandler = new MessageHandler(client, contextBuilder, settings, toolExecutor, history, notifications, terminalBuffer, skillRegistry, mcpClientManager);
```

Replace with:
```typescript
  messageHandler = new MessageHandler(client, contextBuilder, settings, toolExecutor, history, notifications, terminalBuffer, skillRegistry, mcpClientManager, indexer);
```

**Step 6: Register `lucentCode.indexCodebase` command in `package.json`**

In `package.json`, inside `contributes.commands`, add:

```json
{
  "command": "lucentCode.indexCodebase",
  "title": "Lucent Code: Index Codebase"
}
```

**Step 7: Add `indexer.dispose()` to `deactivate`**

Find the `deactivate` function (or the end of `activate` where disposables are pushed). Add:

```typescript
  context.subscriptions.push({ dispose: () => indexer.dispose() });
```

**Step 8: Compile to verify no TypeScript errors**

```bash
npm run compile
```

Expected: no TypeScript errors.

**Step 9: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

**Step 10: Commit**

```bash
git add src/extension.ts package.json
git commit -m "feat(search): wire indexer into extension — status bar, command, tool, @codebase"
```

---

## Post-implementation checklist

- [ ] `npx vitest run` — all tests green
- [ ] `npm run compile` — zero TypeScript errors
- [ ] `cd webview && npm run build` — webview builds cleanly
- [ ] Manual smoke test: Open VS Code with this extension, wait for "Indexed" status bar item, open chat, type `@codebase` and select from dropdown, type a query, send — verify context block appears in AI response
- [ ] Manual smoke test: In chat, the AI uses `semantic_search` tool on a conceptual query and returns relevant code chunks
