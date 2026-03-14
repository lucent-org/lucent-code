import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({
  window: {
    activeTextEditor: undefined,
    visibleTextEditors: [],
  },
  languages: {
    getDiagnostics: vi.fn(() => []),
  },
  Uri: {
    file: (path: string) => ({ fsPath: path, toString: () => path }),
  },
}));

import { ContextBuilder } from './context-builder';

describe('ContextBuilder', () => {
  it('should return empty context when no active editor', () => {
    const builder = new ContextBuilder();
    const context = builder.buildContext();
    expect(context.activeFile).toBeUndefined();
    expect(context.selection).toBeUndefined();
  });
});
