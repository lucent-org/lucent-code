import * as vscode from 'vscode';

export class TerminalBuffer implements vscode.Disposable {
  private readonly buffers = new WeakMap<vscode.Terminal, string[]>();
  private readonly disposables: vscode.Disposable[] = [];
  private static readonly MAX_LINES = 200;

  constructor() {
    // onDidWriteTerminalData requires the proposed API "terminalDataWriteEvent".
    // Accessing it without the proposal declared in enabledApiProposals crashes
    // extension activation, so wrap in try-catch to degrade gracefully.
    try {
      this.disposables.push(
        vscode.window.onDidWriteTerminalData(({ terminal, data }) => {
          const existing = this.buffers.get(terminal) ?? [];
          const newLines = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
          const combined = [...existing, ...newLines].slice(-TerminalBuffer.MAX_LINES);
          this.buffers.set(terminal, combined);
        })
      );
    } catch {
      // Terminal capture unavailable — getActiveTerminalOutput() returns undefined
    }
    this.disposables.push(
      vscode.window.onDidCloseTerminal((terminal) => {
        this.buffers.delete(terminal);
      })
    );
  }

  getActiveTerminalOutput(): string | undefined {
    const terminal = vscode.window.activeTerminal;
    if (!terminal) return undefined;
    const lines = this.buffers.get(terminal);
    if (!lines || lines.length === 0) return undefined;
    return lines.join('\n');
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
