import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Terminal } from 'vscode';

// Capture the onDidWriteTerminalData listener so tests can call it directly
let writeDataListener: ((e: { terminal: Terminal; data: string }) => void) | undefined;
let closeListener: ((terminal: Terminal) => void) | undefined;
let mockWriteDisposable: { dispose: ReturnType<typeof vi.fn> };
let mockCloseDisposable: { dispose: ReturnType<typeof vi.fn> };

vi.mock('vscode', () => ({
  window: {
    onDidWriteTerminalData: vi.fn((cb) => { writeDataListener = cb; mockWriteDisposable = { dispose: vi.fn() }; return mockWriteDisposable; }),
    onDidCloseTerminal: vi.fn((cb) => { closeListener = cb; mockCloseDisposable = { dispose: vi.fn() }; return mockCloseDisposable; }),
    activeTerminal: undefined as Terminal | undefined,
  },
}));

import { TerminalBuffer } from './terminal-buffer';

const makeTerminal = (name: string) => ({ name } as unknown as Terminal);

describe('TerminalBuffer', () => {
  beforeEach(async () => {
    writeDataListener = undefined;
    closeListener = undefined;
    // reset activeTerminal to undefined between tests
    const vscode = await import('vscode');
    (vscode.window as { activeTerminal: Terminal | undefined }).activeTerminal = undefined;
  });

  it('returns undefined when no active terminal', () => {
    const buf = new TerminalBuffer();
    expect(buf.getActiveTerminalOutput()).toBeUndefined();
    buf.dispose();
  });

  it('buffers lines written to the active terminal', async () => {
    const term = makeTerminal('bash');
    const vscode = await import('vscode');
    (vscode.window as { activeTerminal: Terminal | undefined }).activeTerminal = term;
    const buf = new TerminalBuffer();

    writeDataListener!({ terminal: term, data: 'hello\nworld\n' });

    expect(buf.getActiveTerminalOutput()).toContain('hello');
    expect(buf.getActiveTerminalOutput()).toContain('world');
    buf.dispose();
  });

  it('keeps only last 200 lines', async () => {
    const term = makeTerminal('zsh');
    const vscode = await import('vscode');
    (vscode.window as { activeTerminal: Terminal | undefined }).activeTerminal = term;
    const buf = new TerminalBuffer();

    const data = Array.from({ length: 300 }, (_, i) => `line${i}`).join('\n') + '\n';
    writeDataListener!({ terminal: term, data });

    const output = buf.getActiveTerminalOutput()!;
    const lines = output.split('\n').filter(Boolean);
    expect(lines.length).toBeLessThanOrEqual(200);
    expect(lines[lines.length - 1]).toBe('line299');
    buf.dispose();
  });

  it('clears buffer when terminal is closed', async () => {
    const term = makeTerminal('fish');
    const vscode = await import('vscode');
    (vscode.window as { activeTerminal: Terminal | undefined }).activeTerminal = term;
    const buf = new TerminalBuffer();

    writeDataListener!({ terminal: term, data: 'some output\n' });
    closeListener!(term);

    expect(buf.getActiveTerminalOutput()).toBeUndefined();
    buf.dispose();
  });

  describe('CRLF handling', () => {
    it('splits CRLF lines correctly', async () => {
      const term = makeTerminal('powershell');
      const vscode = await import('vscode');
      (vscode.window as { activeTerminal: Terminal | undefined }).activeTerminal = term;
      const buf = new TerminalBuffer();

      writeDataListener!({ terminal: term, data: 'line1\r\nline2\r\nline3\r\n' });

      const output = buf.getActiveTerminalOutput()!;
      const lines = output.split('\n').filter(Boolean);
      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe('line1');
      expect(lines[1]).toBe('line2');
      expect(lines[2]).toBe('line3');
      buf.dispose();
    });
  });

  describe('multiple terminals', () => {
    it('tracks lines per terminal independently', async () => {
      const term1 = makeTerminal('bash');
      const term2 = makeTerminal('zsh');
      const vscode = await import('vscode');
      const buf = new TerminalBuffer();

      writeDataListener!({ terminal: term1, data: 'from-bash\n' });
      writeDataListener!({ terminal: term2, data: 'from-zsh\n' });

      (vscode.window as { activeTerminal: Terminal | undefined }).activeTerminal = term1;
      const output1 = buf.getActiveTerminalOutput()!;
      expect(output1).toContain('from-bash');
      expect(output1).not.toContain('from-zsh');

      (vscode.window as { activeTerminal: Terminal | undefined }).activeTerminal = term2;
      const output2 = buf.getActiveTerminalOutput()!;
      expect(output2).toContain('from-zsh');
      expect(output2).not.toContain('from-bash');

      buf.dispose();
    });
  });

  describe('dispose', () => {
    it('disposes the write listener', () => {
      const buf = new TerminalBuffer();
      buf.dispose();
      expect(mockWriteDisposable.dispose).toHaveBeenCalled();
    });
  });
});
