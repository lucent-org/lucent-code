export interface Chunk {
  content: string;
  startLine: number;
  endLine: number;
}

const CHUNK_SIZE = 40;  // lines per chunk
const OVERLAP = 5;      // overlap between consecutive chunks

export interface SymbolChunkInput {
  name: string;
  containerName?: string;  // parent class/namespace name
  startLine: number;
  endLine: number;
}

const MAX_SYMBOL_LINES = 120;

export function chunkBySymbols(content: string, symbols: SymbolChunkInput[]): Chunk[] {
  if (symbols.length === 0) return [];
  const lines = content.split('\n');
  const chunks: Chunk[] = [];

  for (const sym of symbols) {
    const start = sym.startLine;
    const end = Math.min(sym.endLine, lines.length - 1);
    if (end < start) continue;

    const label = sym.containerName ? `${sym.containerName}.${sym.name}` : sym.name;

    if (end - start > MAX_SYMBOL_LINES) {
      // Sub-chunk large symbols using line-based splitting
      const subLines = lines.slice(start, end + 1);
      const sub = chunkFile(subLines.join('\n'));
      for (const sc of sub) {
        chunks.push({
          content: `// ${label}\n${sc.content}`,
          startLine: start + sc.startLine,
          endLine: start + sc.endLine,
        });
      }
    } else {
      chunks.push({
        content: `// ${label}\n${lines.slice(start, end + 1).join('\n')}`,
        startLine: start,
        endLine: end,
      });
    }
  }

  return chunks;
}

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
