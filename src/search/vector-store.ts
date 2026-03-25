import * as fs from 'fs';
import * as path from 'path';

export interface SearchResult {
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  score: number;
}

interface ChunkMeta {
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  mtime: number;
}

interface IndexData {
  version: number;
  chunks: ChunkMeta[];
}

export class VectorStore {
  private dbDir = '';
  private chunks: ChunkMeta[] = [];
  private embeddingsMatrix: Float32Array = new Float32Array(0);
  private dim = 1536;
  private dirty = false;

  // Injectable for tests
  constructor(private readonly _fs: typeof fs = fs) {}

  open(dbDir: string): void {
    this.dbDir = dbDir;
  }

  isOpen(): boolean {
    return this.dbDir !== '';
  }

  loadIntoMemory(): void {
    if (!this.dbDir) return;
    const metaPath = path.join(this.dbDir, 'chunks.json');
    const embPath = path.join(this.dbDir, 'embeddings.bin');

    try {
      if (!this._fs.existsSync(metaPath) || !this._fs.existsSync(embPath)) return;
      const meta: IndexData = JSON.parse(this._fs.readFileSync(metaPath, 'utf8'));
      const embBuf = this._fs.readFileSync(embPath);
      this.chunks = meta.chunks;
      this.embeddingsMatrix = new Float32Array(embBuf.buffer, embBuf.byteOffset, embBuf.byteLength / 4);
      if (this.chunks.length > 0) {
        this.dim = this.embeddingsMatrix.length / this.chunks.length;
      }
    } catch {
      // Corrupt index — will be rebuilt
      this.chunks = [];
      this.embeddingsMatrix = new Float32Array(0);
    }
  }

  upsertChunks(
    filePath: string,
    chunks: { startLine: number; endLine: number; content: string; embedding: Float32Array }[],
    mtime: number
  ): void {
    if (!this.dbDir) return;

    // Remove existing entries for this file
    const keep: number[] = [];
    for (let i = 0; i < this.chunks.length; i++) {
      if (this.chunks[i].filePath !== filePath) keep.push(i);
    }

    const keptChunks = keep.map((i) => this.chunks[i]);
    const keptEmbeddings: number[] = [];
    for (const i of keep) {
      const offset = i * this.dim;
      for (let j = 0; j < this.dim; j++) keptEmbeddings.push(this.embeddingsMatrix[offset + j]);
    }

    // Append new chunks
    for (const c of chunks) {
      keptChunks.push({ filePath, startLine: c.startLine, endLine: c.endLine, content: c.content, mtime });
      for (let j = 0; j < c.embedding.length; j++) keptEmbeddings.push(c.embedding[j]);
    }

    this.chunks = keptChunks;
    this.embeddingsMatrix = new Float32Array(keptEmbeddings);
    if (chunks.length > 0) this.dim = chunks[0].embedding.length;
    this.dirty = true;
    this.flush();
  }

  deleteFile(filePath: string): void {
    if (!this.dbDir) return;
    const before = this.chunks.length;
    const keep: number[] = [];
    for (let i = 0; i < this.chunks.length; i++) {
      if (this.chunks[i].filePath !== filePath) keep.push(i);
    }
    if (keep.length === before) return;

    const keptChunks = keep.map((i) => this.chunks[i]);
    const keptEmbeddings: number[] = [];
    for (const i of keep) {
      const offset = i * this.dim;
      for (let j = 0; j < this.dim; j++) keptEmbeddings.push(this.embeddingsMatrix[offset + j]);
    }
    this.chunks = keptChunks;
    this.embeddingsMatrix = new Float32Array(keptEmbeddings);
    this.dirty = true;
    this.flush();
  }

  search(queryEmbedding: Float32Array, topK: number): SearchResult[] {
    if (this.chunks.length === 0) return [];

    const qNorm = norm(queryEmbedding);
    if (qNorm === 0) return [];

    const scores: { index: number; score: number }[] = [];
    for (let i = 0; i < this.chunks.length; i++) {
      const offset = i * this.dim;
      const chunk = this.embeddingsMatrix.subarray(offset, offset + this.dim);
      const chunkNorm = norm(chunk);
      if (chunkNorm === 0) continue;
      const score = dot(queryEmbedding, chunk) / (qNorm * chunkNorm);
      scores.push({ index: i, score });
    }

    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, topK).map(({ index, score }) => ({
      filePath: this.chunks[index].filePath,
      startLine: this.chunks[index].startLine,
      endLine: this.chunks[index].endLine,
      content: this.chunks[index].content,
      score,
    }));
  }

  getAllFileMtimes(): Map<string, number> {
    const map = new Map<string, number>();
    for (const c of this.chunks) {
      map.set(c.filePath, c.mtime);
    }
    return map;
  }

  close(): void {
    this.flush();
  }

  private flush(): void {
    if (!this.dirty || !this.dbDir) return;
    try {
      this._fs.mkdirSync(this.dbDir, { recursive: true });
      const meta: IndexData = { version: 1, chunks: this.chunks };
      this._fs.writeFileSync(path.join(this.dbDir, 'chunks.json'), JSON.stringify(meta));
      const buf = Buffer.from(this.embeddingsMatrix.buffer);
      this._fs.writeFileSync(path.join(this.dbDir, 'embeddings.bin'), buf);
      this.dirty = false;
    } catch (e) {
      console.warn('[VectorStore] flush failed:', e instanceof Error ? e.message : String(e));
    }
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
