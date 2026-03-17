import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Terminal } from 'vscode';

// Capture the onDidWriteTerminalData listener so tests can call it directly
let writeDataListener: ((e: { terminal: Terminal; data: string }) => void) | undefined;
let closeListener: ((terminal: Terminal) => void) | undefined;

vi.mock('vscode', () => ({
  window: {
    onDidWriteTerminalData: vi.fn((cb) => { writeDataListener = cb; return { dispose: vi.fn() }; }),
    onDidCloseTerminal: vi.fn((cb) => { closeListener = cb; return { dispose: vi.fn() }; }),
    activeTerminal: undefined as Terminal | undefined,
  },
}));

import { TerminalBuffer } from './terminal-buffer';

const makeTerminal = (name: string) => ({ name } as unknown as Terminal);

describe('TerminalBuffer', () => {
  beforeEach(() => {
    writeDataListener = undefined;
    closeListener = undefined;
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
});
