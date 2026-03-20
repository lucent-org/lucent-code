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
