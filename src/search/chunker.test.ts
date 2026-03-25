import { describe, it, expect } from 'vitest';
import { chunkFile, chunkBySymbols } from './chunker';

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

describe('chunkBySymbols', () => {
  it('returns empty array when symbols is empty', () => {
    const content = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n');
    expect(chunkBySymbols(content, [])).toEqual([]);
  });

  it('creates a single chunk for a single symbol with label prefix', () => {
    const content = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n');
    const chunks = chunkBySymbols(content, [{ name: 'myFunc', startLine: 0, endLine: 4 }]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].startLine).toBe(0);
    expect(chunks[0].endLine).toBe(4);
    expect(chunks[0].content).toMatch(/^\/\/ myFunc\n/);
    expect(chunks[0].content).toContain('line 0');
    expect(chunks[0].content).toContain('line 4');
  });

  it('uses Container.Name prefix when containerName is provided', () => {
    const content = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n');
    const chunks = chunkBySymbols(content, [
      { name: 'doWork', containerName: 'MyService', startLine: 2, endLine: 5 },
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toMatch(/^\/\/ MyService\.doWork\n/);
  });

  it('sub-chunks large symbols exceeding MAX_SYMBOL_LINES (120)', () => {
    // Create a 150-line content
    const content = Array.from({ length: 150 }, (_, i) => `line ${i}`).join('\n');
    const chunks = chunkBySymbols(content, [{ name: 'bigFunc', startLine: 0, endLine: 149 }]);
    // Should produce multiple sub-chunks
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content).toMatch(/^\/\/ bigFunc\n/);
    }
  });

  it('handles multiple symbols producing multiple chunks', () => {
    const content = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n');
    const chunks = chunkBySymbols(content, [
      { name: 'funcA', startLine: 0, endLine: 9 },
      { name: 'funcB', startLine: 15, endLine: 25 },
    ]);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].content).toMatch(/^\/\/ funcA\n/);
    expect(chunks[1].content).toMatch(/^\/\/ funcB\n/);
  });

  it('falls through to no chunks when symbols is empty (caller uses chunkFile)', () => {
    const content = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
    const result = chunkBySymbols(content, []);
    expect(result).toHaveLength(0);
    // Caller is expected to fall back to chunkFile — verify chunkFile still works
    const fallback = chunkFile(content);
    expect(fallback.length).toBeGreaterThan(0);
  });
});
