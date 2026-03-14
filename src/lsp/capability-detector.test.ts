import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecuteCommand } = vi.hoisted(() => ({
  mockExecuteCommand: vi.fn(),
}));

vi.mock('vscode', () => ({
  commands: {
    executeCommand: mockExecuteCommand,
  },
  Uri: {
    parse: (s: string) => ({ toString: () => s }),
  },
  Position: class {
    constructor(public line: number, public character: number) {}
  },
  Range: class {
    constructor(public start: any, public end: any) {}
  },
}));

import { CapabilityDetector } from './capability-detector';

describe('CapabilityDetector', () => {
  let detector: CapabilityDetector;

  beforeEach(() => {
    vi.clearAllMocks();
    detector = new CapabilityDetector();
  });

  it('should detect available capabilities', async () => {
    mockExecuteCommand.mockImplementation((cmd: string) => {
      if (cmd === 'vscode.executeHoverProvider') return Promise.resolve([{ contents: [] }]);
      if (cmd === 'vscode.executeDocumentSymbolProvider') return Promise.resolve([]);
      if (cmd === 'vscode.executeCodeActionProvider') return Promise.resolve([]);
      return Promise.resolve(null);
    });

    const caps = await detector.detect('file:///test.ts', 'typescript');
    expect(caps.hover).toBe(true);
    expect(caps.symbols).toBe(true);
    expect(caps.codeActions).toBe(true);
  });

  it('should handle providers that throw', async () => {
    mockExecuteCommand.mockRejectedValue(new Error('no provider'));
    const caps = await detector.detect('file:///test.ts', 'plaintext');
    expect(caps.hover).toBe(false);
    expect(caps.definition).toBe(false);
  });

  it('should format capabilities for system prompt', () => {
    const caps = {
      hover: true,
      definition: true,
      typeDefinition: false,
      references: true,
      symbols: true,
      rename: false,
      codeActions: true,
      formatting: false,
      languageId: 'typescript',
    };

    const prompt = detector.formatForPrompt(caps);
    expect(prompt).toContain('typescript');
    expect(prompt).toContain('hover');
    expect(prompt).toContain('definition');
    expect(prompt).toContain('references');
    expect(prompt).not.toContain('rename');
    expect(prompt).not.toContain('formatting');
  });

  it('should return empty string when no capabilities', () => {
    const caps = {
      hover: false, definition: false, typeDefinition: false,
      references: false, symbols: false, rename: false,
      codeActions: false, formatting: false, languageId: 'plaintext',
    };
    const prompt = detector.formatForPrompt(caps);
    expect(prompt).toBe('');
  });
});
