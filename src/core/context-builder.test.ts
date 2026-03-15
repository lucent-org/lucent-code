import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CodeContext } from '../shared/types';

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

import * as vscode from 'vscode';
import { ContextBuilder } from './context-builder';

describe('ContextBuilder', () => {
  let builder: ContextBuilder;

  beforeEach(() => {
    builder = new ContextBuilder();
    (vscode.window as any).activeTextEditor = undefined;
    (vscode.window as any).visibleTextEditors = [];
  });

  it('should return empty context when no active editor', () => {
    const context = builder.buildContext();
    expect(context.activeFile).toBeUndefined();
    expect(context.selection).toBeUndefined();
  });

  it('should populate activeFile when active editor exists', () => {
    (vscode.window as any).activeTextEditor = {
      document: {
        uri: { toString: () => 'file:///test.ts' },
        languageId: 'typescript',
        getText: vi.fn((range?: any) => range ? 'selected text' : 'full content'),
      },
      selection: {
        active: { line: 5, character: 10 },
        isEmpty: true,
        start: { line: 5, character: 10 },
        end: { line: 5, character: 10 },
      },
    };

    const context = builder.buildContext();

    expect(context.activeFile).toBeDefined();
    expect(context.activeFile!.uri).toBe('file:///test.ts');
    expect(context.activeFile!.languageId).toBe('typescript');
    expect(context.activeFile!.content).toBe('full content');
    expect(context.activeFile!.cursorLine).toBe(5);
    expect(context.activeFile!.cursorCharacter).toBe(10);
  });

  it('should populate selection when text is selected', () => {
    (vscode.window as any).activeTextEditor = {
      document: {
        uri: { toString: () => 'file:///test.ts' },
        languageId: 'typescript',
        getText: vi.fn((range?: any) => range ? 'selected text' : 'full content'),
      },
      selection: {
        active: { line: 5, character: 10 },
        isEmpty: false,
        start: { line: 3, character: 0 },
        end: { line: 5, character: 15 },
      },
    };

    const context = builder.buildContext();

    expect(context.selection).toBeDefined();
    expect(context.selection!.text).toBe('selected text');
    expect(context.selection!.startLine).toBe(3);
    expect(context.selection!.endLine).toBe(5);
  });

  it('should not populate selection when selection is empty', () => {
    (vscode.window as any).activeTextEditor = {
      document: {
        uri: { toString: () => 'file:///test.ts' },
        languageId: 'typescript',
        getText: vi.fn(() => 'full content'),
      },
      selection: {
        active: { line: 2, character: 0 },
        isEmpty: true,
        start: { line: 2, character: 0 },
        end: { line: 2, character: 0 },
      },
    };

    const context = builder.buildContext();

    expect(context.selection).toBeUndefined();
  });

  describe('formatForPrompt', () => {
    it('should format active file with URI, language, cursor line, and code block', () => {
      const context: CodeContext = {
        activeFile: {
          uri: 'file:///project/main.ts',
          languageId: 'typescript',
          content: 'const x = 1;',
          cursorLine: 0,
          cursorCharacter: 5,
        },
      };

      const result = builder.formatForPrompt(context);

      expect(result).toContain('file:///project/main.ts');
      expect(result).toContain('typescript');
      expect(result).toContain('line 1');
      expect(result).toContain('```typescript');
      expect(result).toContain('const x = 1;');
      expect(result).toContain('```');
    });

    it('should include Selected Code section when selection is present', () => {
      const context: CodeContext = {
        activeFile: {
          uri: 'file:///test.ts',
          languageId: 'typescript',
          content: 'full file',
          cursorLine: 3,
        },
        selection: {
          text: 'selected text here',
          startLine: 2,
          endLine: 4,
        },
      };

      const result = builder.formatForPrompt(context);

      expect(result).toContain('Selected Code');
      expect(result).toContain('selected text here');
      expect(result).toContain('lines 3-5');
    });

    it('should include Other Open Files section when openEditors is present', () => {
      const context: CodeContext = {
        openEditors: [
          { uri: 'file:///utils.ts', languageId: 'typescript' },
          { uri: 'file:///styles.css', languageId: 'css' },
        ],
      };

      const result = builder.formatForPrompt(context);

      expect(result).toContain('Other Open Files');
      expect(result).toContain('file:///utils.ts');
      expect(result).toContain('typescript');
      expect(result).toContain('file:///styles.css');
      expect(result).toContain('css');
    });

    it('should return empty string for empty context', () => {
      const context: CodeContext = {};
      const result = builder.formatForPrompt(context);
      expect(result).toBe('');
    });
  });

  describe('formatEnrichedPrompt', () => {
    it('should include diagnostics in prompt', () => {
      const builder = new ContextBuilder();
      const context: CodeContext = {
        activeFile: {
          uri: 'file:///test.ts',
          languageId: 'typescript',
          content: 'const x = 1;',
          cursorLine: 0,
          cursorCharacter: 0,
        },
        diagnostics: [
          { message: 'Type error', severity: 'Error', range: { startLine: 0, endLine: 0 } },
        ],
      };

      const prompt = builder.formatEnrichedPrompt(context);
      expect(prompt).toContain('Diagnostics');
      expect(prompt).toContain('Type error');
      expect(prompt).toContain('[Error]');
    });

    it('should not include diagnostics section when none exist', () => {
      const builder = new ContextBuilder();
      const context: CodeContext = {
        activeFile: {
          uri: 'file:///test.ts',
          languageId: 'typescript',
          content: 'const x = 1;',
          cursorLine: 0,
          cursorCharacter: 0,
        },
      };

      const prompt = builder.formatEnrichedPrompt(context);
      expect(prompt).not.toContain('Diagnostics');
    });
  });

  describe('InstructionsLoader integration', () => {
    it('should return undefined when no loader is set', () => {
      expect(builder.getCustomInstructions()).toBeUndefined();
    });

    it('should return instructions from the loader', () => {
      const mockLoader = { getInstructions: vi.fn().mockReturnValue('# Custom') } as any;
      builder.setInstructionsLoader(mockLoader);
      expect(builder.getCustomInstructions()).toBe('# Custom');
    });

    it('should return undefined when loader has no instructions', () => {
      const mockLoader = { getInstructions: vi.fn().mockReturnValue(undefined) } as any;
      builder.setInstructionsLoader(mockLoader);
      expect(builder.getCustomInstructions()).toBeUndefined();
    });
  });
});
