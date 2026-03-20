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
