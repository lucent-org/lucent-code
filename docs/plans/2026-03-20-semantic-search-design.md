# Semantic Codebase Search — Design

## Goal

Add meaning-based code retrieval to Lucent Code: the AI can call `semantic_search` as a tool, and users can invoke it manually via `@codebase <query>` in the chat input. Embeddings are generated via the OpenRouter embeddings API (same key already configured) and persisted in a SQLite index inside the workspace.

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Embedding provider | OpenRouter (`openai/text-embedding-3-small`) | Same API key already configured, no extra setup |
| Storage | SQLite (`better-sqlite3`) at `.lucent/index.db` | Persistent across restarts, incremental updates, no external service |
| In-memory search | Float32Array cosine similarity | Fast for <100k chunks, no native vector DB needed |
| Surfaces | AI tool + `@codebase` mention | Both autonomous and user-controlled retrieval |

---

## Architecture

### New files

```
src/search/
  chunker.ts       — split file content into overlapping ~500-token chunks
  vector-store.ts  — SQLite schema, CRUD, load-to-memory, cosine search
  indexer.ts       — file filtering, embedding via OpenRouter, file watching, startup reconciliation
```

### Modified files

- `src/lsp/editor-tools.ts` — add `semantic_search` tool definition + handler
- `src/extension.ts` — initialise indexer on workspace open, register `indexCodebase` command, add status bar item
- `webview/src/components/ChatInput.tsx` — add `codebase` to `@` mention list
- `src/chat/message-handler.ts` — intercept `@codebase` mentions, run search, inject context block

---

## SQLite Schema

**Location:** `<workspaceRoot>/.lucent/index.db` (add `.lucent/` to `.gitignore`)

```sql
CREATE TABLE IF NOT EXISTS chunks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path  TEXT    NOT NULL,
  start_line INTEGER NOT NULL,
  end_line   INTEGER NOT NULL,
  content    TEXT    NOT NULL,
  embedding  BLOB    NOT NULL,   -- Float32Array serialised as raw binary buffer
  mtime      INTEGER NOT NULL    -- file mtime (ms) for incremental invalidation
);

CREATE INDEX IF NOT EXISTS idx_file_path ON chunks(file_path);
```

---

## Chunker (`src/search/chunker.ts`)

Split a file's text into overlapping chunks:

- **Chunk size:** ~40 lines (≈ 500 tokens for typical code)
- **Overlap:** 5 lines between consecutive chunks (preserves context across boundaries)
- Each chunk records `{ content, startLine, endLine }`
- Skip empty files and files over 500KB

---

## Vector Store (`src/search/vector-store.ts`)

```typescript
class VectorStore {
  open(dbPath: string): void          // open/create SQLite DB, run migrations
  upsertChunks(chunks): void          // delete old chunks for file, insert new
  deleteFile(filePath: string): void  // remove all chunks for a deleted file
  loadIntoMemory(): void              // read all embeddings into Float32Array matrix
  search(queryEmbedding, topK): SearchResult[]  // cosine similarity, sorted
  getAllFileMtimes(): Map<string, number>        // for startup reconciliation
  close(): void
}
```

**In-memory layout:**
- `embeddings: Float32Array` — flat array, one embedding per chunk concatenated
- `metadata: ChunkMeta[]` — parallel array with `{ filePath, startLine, endLine, content }`
- Cosine similarity: `dot(a, b) / (norm(a) * norm(b))`, computed in a tight JS loop

**Reloaded from SQLite** after every batch insert (incremental update keeps memory in sync).

---

## Indexer (`src/search/indexer.ts`)

```typescript
class Indexer {
  async start(workspaceRoot: string): Promise<void>
  async indexAll(): Promise<void>           // full re-index
  async indexFile(filePath: string): Promise<void>
  private async embedChunks(chunks): Promise<Float32Array[]>
  private shouldIndex(filePath: string): boolean
  private startFileWatcher(): void
  private reconcileOnStartup(): Promise<void>
}
```

### File filter (`shouldIndex`)

**Skip:**
- `node_modules/`, `.git/`, `dist/`, `out/`, `build/`, `.lucent/`
- `*.min.js`, `*.map`, `*.lock`, `*.png`, `*.jpg`, `*.svg`, `*.woff`
- Files over 500KB
- Binary files (check first 512 bytes for null bytes)

**Index:** `.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.go`, `.rs`, `.cs`, `.java`, `.md`, `.json` (under 500KB)

### Embedding API call

```typescript
POST https://openrouter.ai/api/v1/embeddings
Authorization: Bearer <openrouter-key>
Content-Type: application/json

{
  "model": "openai/text-embedding-3-small",
  "input": ["chunk1 content", "chunk2 content", ...]  // up to 100 per batch
}
```

Response: `data[i].embedding` — array of 1536 floats. Serialised to `Buffer` for SQLite BLOB storage.

### Startup reconciliation

```
stored = vectorStore.getAllFileMtimes()         // file_path → mtime from SQLite
current = glob all indexable files in workspace // file_path → fs.mtime

for each file in stored:
  if not in current → vectorStore.deleteFile(file)     // deleted
  else if current.mtime !== stored.mtime → re-index    // modified while closed

for each file in current:
  if not in stored → index it                          // new file
```

### File watcher

```typescript
const watcher = vscode.workspace.createFileSystemWatcher('**/*');
watcher.onDidChange(uri => indexer.indexFile(uri.fsPath));
watcher.onDidCreate(uri => indexer.indexFile(uri.fsPath));
watcher.onDidDelete(uri => vectorStore.deleteFile(uri.fsPath));
```

---

## `semantic_search` Tool

Added to `src/lsp/editor-tools.ts`:

```typescript
{
  name: 'semantic_search',
  description: 'Search the codebase for code semantically related to a natural language query. Use this when grep_files would miss results because the query is conceptual rather than literal.',
  input_schema: {
    type: 'object',
    properties: {
      query:  { type: 'string', description: 'Natural language description of what to find' },
      limit:  { type: 'number', description: 'Max results to return (default 8, max 20)' }
    },
    required: ['query']
  }
}
```

Handler:
1. Embed `query` via OpenRouter embeddings API
2. Run `vectorStore.search(embedding, limit ?? 8)`
3. Return formatted results: `file_path:start_line–end_line\n<content>`

Subject to the same HITL approval gate as other tools (bypassed in autonomous mode).

---

## `@codebase` Mention

### Webview side (`ChatInput.tsx`)

Add `{ trigger: '@', value: 'codebase', label: 'Codebase', description: 'Semantic search across all indexed files' }` to the `@` mention suggestions list. Renders as `@codebase` chip in the input.

When submitted, the chip is included in the message payload with `type: 'codebase'` and the remaining message text is the query.

### Extension side (`message-handler.ts`)

Before sending the message to the LLM, detect any `@codebase` attachment:
1. Extract the query (the message text after removing `@codebase`)
2. Call `indexer.search(query, 10)`
3. Prepend a context block to the system prompt for this turn:

```
<codebase-context query="find the auth middleware">
src/core/auth.ts:12–45
```typescript
export class AuthManager { ... }
```

src/middleware/auth.ts:1–30
```typescript
export function requireAuth(req, res, next) { ... }
```
</codebase-context>
```

The AI sees this context and answers with full awareness of the relevant code.

---

## Commands & Status Bar

### Command
`lucentCode.indexCodebase` — registered in `extension.ts`, triggers `indexer.indexAll()`. Shown in command palette as "Lucent Code: Index Codebase".

### Status Bar Item

```
$(loading~spin) Indexing…   (during indexAll)
$(database) Indexed         (ready, N chunks)
$(warning) Not indexed      (click to index)
```

Clicking the status bar item triggers `indexCodebase` command.

---

## Vector Invalidation

Two layers ensure the index stays consistent:

### During session — file watcher
VS Code `FileSystemWatcher` fires on every save/create/delete. On change or create: delete old chunks for that file, re-embed, insert new chunks with new mtime. On delete: remove chunks. Lag: ~1–2s per file.

### Between sessions — startup reconciliation
On workspace open, compare stored mtimes against current filesystem mtimes. Re-index changed files, index new files, delete chunks for removed files. Runs before the first chat message.

**Rename handling:** VS Code fires delete + create for renames — handled correctly by the two events.

---

## Dependencies

Add to `package.json`:
```json
"dependencies": {
  "better-sqlite3": "^9.4.3"
}
```

Add to `devDependencies`:
```json
"@types/better-sqlite3": "^7.6.8"
```

`better-sqlite3` is a native Node module — it requires `electron-rebuild` or a prebuilt binary compatible with VS Code's Electron version. The standard approach for VS Code extensions is to include prebuilt binaries via `better-sqlite3-multiple-ciphers` or use the `@vscode/sqlite3` wrapper. This detail is handled in the implementation plan.

---

## Files Changed

| File | Change |
|---|---|
| `src/search/chunker.ts` | New — file chunking |
| `src/search/vector-store.ts` | New — SQLite wrapper + cosine search |
| `src/search/indexer.ts` | New — embedding pipeline + file watcher + reconciliation |
| `src/lsp/editor-tools.ts` | Add `semantic_search` tool |
| `src/extension.ts` | Init indexer, register command, add status bar item |
| `src/chat/message-handler.ts` | Intercept `@codebase` mention, inject context |
| `webview/src/components/ChatInput.tsx` | Add `codebase` to `@` mention list |
| `package.json` | Add `better-sqlite3` dependency, register `indexCodebase` command |
| `.gitignore` | Add `.lucent/` |
