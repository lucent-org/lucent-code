import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { VectorStore, SearchResult } from './vector-store';
import { chunkFile, chunkBySymbols, SymbolChunkInput, Chunk } from './chunker';

const INDEXABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.cs',
  '.java', '.json',
]);

const SKIP_DIRS = ['node_modules', '.git', 'dist', 'out', 'build', '.lucent', 'docs'];
const SKIP_SUFFIXES = ['.min.js', '.map', '.lock', '.png', '.jpg', '.svg', '.woff'];
const SKIP_FILENAMES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'tsconfig.json', 'tsconfig.build.json', 'jsconfig.json',
  '.eslintrc.json', '.prettierrc.json', 'jest.config.json',
]);
const MAX_FILE_SIZE = 500 * 1024; // 500 KB
const EMBED_BATCH_SIZE = 100;

export class Indexer {
  private readonly vectorStore = new VectorStore();
  private workspaceRoot = '';
  private dbPath = '';
  private watcher?: vscode.Disposable;

  constructor(private readonly getApiKey: () => string | undefined | Promise<string | undefined>) {}

  async start(workspaceRoot: string): Promise<void> {
    this.workspaceRoot = workspaceRoot;
    this.dbPath = path.join(workspaceRoot, '.lucent');

    await fs.mkdir(this.dbPath, { recursive: true });
    this.vectorStore.open(this.dbPath);
    this.vectorStore.loadIntoMemory();

    this.startFileWatcher();
    await this.reconcileOnStartup();
  }

  async indexAll(): Promise<void> {
    const uris = await vscode.workspace.findFiles('**/*', '{**/node_modules/**,**/.git/**,**/dist/**,**/out/**,**/build/**,**/.lucent/**}');
    const paths = uris.map((u) => u.fsPath).filter((p) => this.shouldIndex(p));
    for (const filePath of paths) {
      await this.indexFile(filePath, { skipMemoryReload: true });
    }
    this.vectorStore.loadIntoMemory();
  }

  async indexFile(filePath: string, { skipMemoryReload = false } = {}): Promise<void> {
    if (!this.shouldIndex(filePath)) return;

    try {
      const stat = await fs.stat(filePath);
      if (stat.size > MAX_FILE_SIZE) return;

      const content = await fs.readFile(filePath, 'utf8');
      if (isBinary(content)) return;

      let chunks = await this.getSymbolChunks(filePath, content);
      if (chunks.length === 0) {
        chunks = chunkFile(content);
      }
      if (chunks.length === 0) return;

      console.log(`[Lucent Indexer] indexing ${path.relative(this.workspaceRoot, filePath)} (${chunks.length} chunks)`);
      const embeddings = await this.embedChunks(chunks);
      const chunksWithEmbeddings = chunks.map((c, i) => ({ ...c, embedding: embeddings[i] }));

      this.vectorStore.upsertChunks(filePath, chunksWithEmbeddings, stat.mtimeMs);
      if (!skipMemoryReload) {
        this.vectorStore.loadIntoMemory();
      }
    } catch (e) {
      console.error(`[Lucent Indexer] error indexing ${path.basename(filePath)}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  isDbOpen(): boolean {
    return this.vectorStore.isOpen();
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
    const root = this.workspaceRoot.replace(/\\/g, '/');

    // Must be within the workspace root
    if (!normalized.startsWith(root + '/') && normalized !== root) return false;

    for (const dir of SKIP_DIRS) {
      if (normalized.includes(`/${dir}/`) || normalized.endsWith(`/${dir}`)) return false;
    }

    for (const suffix of SKIP_SUFFIXES) {
      if (normalized.endsWith(suffix)) return false;
    }

    const basename = path.basename(filePath);
    if (SKIP_FILENAMES.has(basename)) return false;

    const ext = path.extname(filePath).toLowerCase();
    return INDEXABLE_EXTENSIONS.has(ext);
  }

  private async embedChunks(chunks: { content: string }[]): Promise<Float32Array[]> {
    const results: Float32Array[] = [];

    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('No API key configured');
    }
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

  private async getSymbolChunks(filePath: string, content: string): Promise<Chunk[]> {
    try {
      const uri = vscode.Uri.file(filePath);
      await vscode.workspace.openTextDocument(uri);
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        uri
      );
      if (!symbols || symbols.length === 0) return [];

      const INCLUDED_KINDS = new Set([5, 6, 7, 9, 11]); // Class, Method, Property, Constructor, Function

      function flattenSymbols(
        syms: vscode.DocumentSymbol[],
        containerName: string | undefined,
        depth: number
      ): SymbolChunkInput[] {
        const result: SymbolChunkInput[] = [];
        for (const sym of syms) {
          const startLine = sym.range.start.line;
          const endLine = sym.range.end.line;
          const lineSpan = endLine - startLine + 1;

          if (INCLUDED_KINDS.has(sym.kind)) {
            if (depth === 0 || lineSpan >= 3) {
              result.push({ name: sym.name, containerName, startLine, endLine });
            }
          }

          if (sym.children && sym.children.length > 0) {
            // Use this symbol's name as the container for its children (innermost container)
            const childContainer = INCLUDED_KINDS.has(sym.kind) ? sym.name : containerName;
            result.push(...flattenSymbols(sym.children, childContainer, depth + 1));
          }
        }
        return result;
      }

      const flatSymbols = flattenSymbols(symbols, undefined, 0);
      if (flatSymbols.length === 0) return [];
      return chunkBySymbols(content, flatSymbols);
    } catch {
      return [];
    }
  }

  private startFileWatcher(): void {
    this.watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.workspaceRoot, '**/*')
    );
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
        await this.indexFile(filePath, { skipMemoryReload: true });
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
