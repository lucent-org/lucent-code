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
  private watcher?: vscode.Disposable;

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

  async searchAsync(query: string, topK: number): Promise<SearchResult[]> {
    const [queryEmbedding] = await this.embedChunks([{ content: query, startLine: 0, endLine: 0 }]);
    return this.vectorStore.search(queryEmbedding, topK);
  }

  dispose(): void {
    this.watcher?.dispose();
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

    const apiKey = await this.getApiKey();
    for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);

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
    this.watcher = vscode.workspace.createFileSystemWatcher('**/*');
    this.watcher.onDidChange((uri) => { void this.indexFile(uri.fsPath); });
    this.watcher.onDidCreate((uri) => { void this.indexFile(uri.fsPath); });
    this.watcher.onDidDelete((uri) => {
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
