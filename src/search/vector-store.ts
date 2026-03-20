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
      const chunkNorm = norm(chunk);
      if (chunkNorm === 0) continue;
      const score = dot(queryEmbedding, chunk) / (qNorm * chunkNorm);
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
