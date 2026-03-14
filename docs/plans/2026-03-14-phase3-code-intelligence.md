# Phase 3 — Code Intelligence & LSP Hints Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enrich chat prompts with deep code intelligence from VSCode's built-in language services, and let the LLM invoke editor actions (rename, code actions, format) via tool-use, with diff preview for approval.

**Architecture:** A `CodeIntelligence` module wraps VSCode's language service commands (definition, hover, references, diagnostics, symbols) behind a cached facade. A `CapabilityDetector` probes which providers are available for the current language and injects them into the system prompt. Tool definitions are exposed for models supporting tool-use, with an `EditorToolExecutor` that applies actions and shows diff previews. The existing `ContextBuilder` and `MessageHandler` are extended to integrate these.

**Tech Stack:** TypeScript, VSCode Language Service API (`vscode.commands.executeCommand`), existing OpenRouterClient (tool-use via OpenAI-compatible `tools` parameter)

---

### Task 1: Code Intelligence Module — Language Service Wrappers

**Files:**
- Create: `src/lsp/code-intelligence.ts`
- Create: `src/lsp/code-intelligence.test.ts`

**Step 1: Write the test file**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecuteCommand = vi.fn();
const mockGetDiagnostics = vi.fn(() => []);

vi.mock('vscode', () => ({
  commands: {
    executeCommand: mockExecuteCommand,
  },
  languages: {
    getDiagnostics: mockGetDiagnostics,
  },
  Uri: {
    parse: (s: string) => ({ toString: () => s, fsPath: s }),
  },
  Position: class {
    constructor(public line: number, public character: number) {}
  },
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
}));

import { CodeIntelligence } from './code-intelligence';

describe('CodeIntelligence', () => {
  let ci: CodeIntelligence;

  beforeEach(() => {
    vi.clearAllMocks();
    ci = new CodeIntelligence();
  });

  describe('getHover', () => {
    it('should return hover contents', async () => {
      mockExecuteCommand.mockResolvedValue([
        { contents: [{ value: 'function greet(name: string): void' }] },
      ]);

      const result = await ci.getHover('file:///test.ts', 0, 10);
      expect(result).toContain('function greet');
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        'vscode.executeHoverProvider',
        expect.anything(),
        expect.anything()
      );
    });

    it('should return undefined when no hover info', async () => {
      mockExecuteCommand.mockResolvedValue([]);
      const result = await ci.getHover('file:///test.ts', 0, 10);
      expect(result).toBeUndefined();
    });

    it('should return undefined on error', async () => {
      mockExecuteCommand.mockRejectedValue(new Error('no provider'));
      const result = await ci.getHover('file:///test.ts', 0, 10);
      expect(result).toBeUndefined();
    });
  });

  describe('getDiagnostics', () => {
    it('should return formatted diagnostics for a URI', () => {
      mockGetDiagnostics.mockReturnValue([
        [
          { toString: () => 'file:///test.ts' },
          [
            {
              message: 'Type error',
              severity: 0,
              range: { start: { line: 5, character: 0 }, end: { line: 5, character: 10 } },
            },
          ],
        ],
      ]);

      const result = ci.getDiagnostics('file:///test.ts');
      expect(result).toHaveLength(1);
      expect(result[0].message).toBe('Type error');
      expect(result[0].severity).toBe('Error');
    });

    it('should return empty array when no diagnostics', () => {
      mockGetDiagnostics.mockReturnValue([]);
      const result = ci.getDiagnostics('file:///test.ts');
      expect(result).toHaveLength(0);
    });
  });

  describe('getDefinition', () => {
    it('should return definition location', async () => {
      mockExecuteCommand.mockResolvedValue([
        { uri: { toString: () => 'file:///other.ts' }, range: { start: { line: 10, character: 0 } } },
      ]);

      const result = await ci.getDefinition('file:///test.ts', 5, 15);
      expect(result).toBeDefined();
      expect(result!.uri).toBe('file:///other.ts');
      expect(result!.line).toBe(10);
    });
  });

  describe('getSymbols', () => {
    it('should return document symbols', async () => {
      mockExecuteCommand.mockResolvedValue([
        { name: 'greet', kind: 12, range: { start: { line: 0 }, end: { line: 3 } } },
        { name: 'main', kind: 12, range: { start: { line: 5 }, end: { line: 10 } } },
      ]);

      const result = await ci.getSymbols('file:///test.ts');
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('greet');
    });
  });

  describe('caching', () => {
    it('should cache hover results within TTL', async () => {
      mockExecuteCommand.mockResolvedValue([
        { contents: [{ value: 'cached result' }] },
      ]);

      await ci.getHover('file:///test.ts', 0, 10);
      await ci.getHover('file:///test.ts', 0, 10);

      expect(mockExecuteCommand).toHaveBeenCalledTimes(1);
    });
  });
});
```

**Step 2: Write the implementation**

```typescript
import * as vscode from 'vscode';

interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

const CACHE_TTL = 5000; // 5 seconds

export interface DiagnosticInfo {
  message: string;
  severity: string;
  startLine: number;
  endLine: number;
}

export interface DefinitionInfo {
  uri: string;
  line: number;
  character: number;
}

export interface SymbolInfo {
  name: string;
  kind: number;
  startLine: number;
  endLine: number;
}

export class CodeIntelligence {
  private cache = new Map<string, CacheEntry<unknown>>();

  private getCached<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
      return entry.value as T;
    }
    this.cache.delete(key);
    return undefined;
  }

  private setCache<T>(key: string, value: T): void {
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  async getHover(uriStr: string, line: number, character: number): Promise<string | undefined> {
    const cacheKey = `hover:${uriStr}:${line}:${character}`;
    const cached = this.getCached<string>(cacheKey);
    if (cached !== undefined) return cached;

    try {
      const uri = vscode.Uri.parse(uriStr);
      const position = new vscode.Position(line, character);
      const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        uri,
        position
      );

      if (!hovers || hovers.length === 0) return undefined;

      const contents = hovers
        .flatMap((h) => h.contents)
        .map((c) => {
          if (typeof c === 'string') return c;
          if ('value' in c) return c.value;
          return String(c);
        })
        .filter(Boolean)
        .join('\n');

      if (!contents) return undefined;

      this.setCache(cacheKey, contents);
      return contents;
    } catch {
      return undefined;
    }
  }

  async getDefinition(uriStr: string, line: number, character: number): Promise<DefinitionInfo | undefined> {
    const cacheKey = `def:${uriStr}:${line}:${character}`;
    const cached = this.getCached<DefinitionInfo>(cacheKey);
    if (cached !== undefined) return cached;

    try {
      const uri = vscode.Uri.parse(uriStr);
      const position = new vscode.Position(line, character);
      const locations = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeDefinitionProvider',
        uri,
        position
      );

      if (!locations || locations.length === 0) return undefined;

      const loc = locations[0];
      const result: DefinitionInfo = {
        uri: loc.uri.toString(),
        line: loc.range.start.line,
        character: loc.range.start.character,
      };

      this.setCache(cacheKey, result);
      return result;
    } catch {
      return undefined;
    }
  }

  async getReferences(uriStr: string, line: number, character: number): Promise<DefinitionInfo[]> {
    try {
      const uri = vscode.Uri.parse(uriStr);
      const position = new vscode.Position(line, character);
      const locations = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeReferenceProvider',
        uri,
        position
      );

      if (!locations) return [];

      return locations.map((loc) => ({
        uri: loc.uri.toString(),
        line: loc.range.start.line,
        character: loc.range.start.character,
      }));
    } catch {
      return [];
    }
  }

  getDiagnostics(uriStr: string): DiagnosticInfo[] {
    const severityMap: Record<number, string> = {
      0: 'Error',
      1: 'Warning',
      2: 'Information',
      3: 'Hint',
    };

    try {
      const allDiagnostics = vscode.languages.getDiagnostics();
      for (const [uri, diagnostics] of allDiagnostics) {
        if (uri.toString() === uriStr) {
          return diagnostics.map((d) => ({
            message: d.message,
            severity: severityMap[d.severity] ?? 'Unknown',
            startLine: d.range.start.line,
            endLine: d.range.end.line,
          }));
        }
      }
      return [];
    } catch {
      return [];
    }
  }

  async getSymbols(uriStr: string): Promise<SymbolInfo[]> {
    const cacheKey = `symbols:${uriStr}`;
    const cached = this.getCached<SymbolInfo[]>(cacheKey);
    if (cached !== undefined) return cached;

    try {
      const uri = vscode.Uri.parse(uriStr);
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        uri
      );

      if (!symbols) return [];

      const result = symbols.map((s) => ({
        name: s.name,
        kind: s.kind,
        startLine: s.range.start.line,
        endLine: s.range.end.line,
      }));

      this.setCache(cacheKey, result);
      return result;
    } catch {
      return [];
    }
  }

  async resolveContext(uriStr: string, line: number, character: number): Promise<{
    hover?: string;
    definition?: DefinitionInfo;
    diagnostics: DiagnosticInfo[];
    symbols: SymbolInfo[];
  }> {
    const [hover, definition, diagnostics, symbols] = await Promise.all([
      this.getHover(uriStr, line, character),
      this.getDefinition(uriStr, line, character),
      Promise.resolve(this.getDiagnostics(uriStr)),
      this.getSymbols(uriStr),
    ]);

    return { hover, definition, diagnostics, symbols };
  }

  clearCache(): void {
    this.cache.clear();
  }
}
```

**Step 3: Run tests and build**

Run: `npx vitest run src/lsp/code-intelligence.test.ts`
Expected: All 7 tests pass

Run: `node esbuild.config.mjs`

**Step 4: Commit**

```bash
git add src/lsp/code-intelligence.ts src/lsp/code-intelligence.test.ts
git commit -m "feat: add CodeIntelligence with hover, definition, references, diagnostics, symbols, and caching"
```

---

### Task 2: Capability Detector

**Files:**
- Create: `src/lsp/capability-detector.ts`
- Create: `src/lsp/capability-detector.test.ts`

**Step 1: Write the test file**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecuteCommand = vi.fn();

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
    // Hover available
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
});
```

**Step 2: Write the implementation**

```typescript
import * as vscode from 'vscode';

export interface EditorCapabilities {
  hover: boolean;
  definition: boolean;
  typeDefinition: boolean;
  references: boolean;
  symbols: boolean;
  rename: boolean;
  codeActions: boolean;
  formatting: boolean;
  languageId: string;
}

export class CapabilityDetector {
  async detect(uriStr: string, languageId: string): Promise<EditorCapabilities> {
    const uri = vscode.Uri.parse(uriStr);
    const pos = new vscode.Position(0, 0);

    const probe = async (command: string, ...args: unknown[]): Promise<boolean> => {
      try {
        const result = await vscode.commands.executeCommand(command, ...args);
        return result !== null && result !== undefined;
      } catch {
        return false;
      }
    };

    const [hover, definition, typeDefinition, references, symbols, codeActions, formatting] =
      await Promise.all([
        probe('vscode.executeHoverProvider', uri, pos),
        probe('vscode.executeDefinitionProvider', uri, pos),
        probe('vscode.executeTypeDefinitionProvider', uri, pos),
        probe('vscode.executeReferenceProvider', uri, pos),
        probe('vscode.executeDocumentSymbolProvider', uri),
        probe('vscode.executeCodeActionProvider', uri, new vscode.Range(pos, pos)),
        probe('vscode.executeFormatDocumentProvider', uri, { tabSize: 2, insertSpaces: true }),
      ]);

    // Rename is hard to probe without side effects, so check if definition works as a proxy
    const rename = definition;

    return {
      hover,
      definition,
      typeDefinition,
      references,
      symbols,
      rename,
      codeActions,
      formatting,
      languageId,
    };
  }

  formatForPrompt(caps: EditorCapabilities): string {
    const available: string[] = [];

    if (caps.hover) available.push('- **hover**: Get type info and documentation for a symbol');
    if (caps.definition) available.push('- **go_to_definition**: Navigate to a symbol\'s definition');
    if (caps.typeDefinition) available.push('- **type_definition**: Navigate to a symbol\'s type definition');
    if (caps.references) available.push('- **find_references**: List all usages of a symbol');
    if (caps.symbols) available.push('- **document_symbols**: Get the file structure (classes, functions, etc.)');
    if (caps.rename) available.push('- **rename_symbol**: Rename a symbol across the project');
    if (caps.codeActions) available.push('- **apply_code_action**: Apply quick fixes or refactorings');
    if (caps.formatting) available.push('- **format_document**: Format the file using the project\'s formatter');

    if (available.length === 0) {
      return '';
    }

    return `\n## Editor Capabilities (${caps.languageId})\n\nThe following editor actions are available for the current file:\n${available.join('\n')}\n\nWhen relevant, suggest using these actions instead of manually editing code.`;
  }
}
```

**Step 3: Run tests and build**

Run: `npx vitest run src/lsp/capability-detector.test.ts`
Expected: All 3 tests pass

Run: `node esbuild.config.mjs`

**Step 4: Commit**

```bash
git add src/lsp/capability-detector.ts src/lsp/capability-detector.test.ts
git commit -m "feat: add CapabilityDetector that probes and formats editor capabilities for the LLM"
```

---

### Task 3: Editor Tool Executor

**Files:**
- Create: `src/lsp/editor-tools.ts`
- Create: `src/lsp/editor-tools.test.ts`

**Step 1: Write the test file**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecuteCommand = vi.fn();
const mockShowInformationMessage = vi.fn();
const mockApplyEdit = vi.fn(() => Promise.resolve(true));

vi.mock('vscode', () => ({
  commands: {
    executeCommand: mockExecuteCommand,
  },
  window: {
    showInformationMessage: mockShowInformationMessage,
  },
  workspace: {
    applyEdit: mockApplyEdit,
  },
  Uri: {
    parse: (s: string) => ({ toString: () => s, fsPath: s }),
  },
  Position: class {
    constructor(public line: number, public character: number) {}
  },
  Range: class {
    constructor(public start: any, public end: any) {}
  },
  WorkspaceEdit: class {
    private edits: any[] = [];
    replace(uri: any, range: any, text: string) {
      this.edits.push({ uri, range, text });
    }
    insert(uri: any, position: any, text: string) {
      this.edits.push({ uri, position, text });
    }
  },
}));

import { EditorToolExecutor, TOOL_DEFINITIONS } from './editor-tools';

describe('EditorToolExecutor', () => {
  let executor: EditorToolExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
    executor = new EditorToolExecutor();
  });

  it('should define tool schemas for OpenAI-compatible tool-use', () => {
    expect(TOOL_DEFINITIONS).toBeInstanceOf(Array);
    expect(TOOL_DEFINITIONS.length).toBeGreaterThan(0);

    const names = TOOL_DEFINITIONS.map((t) => t.function.name);
    expect(names).toContain('rename_symbol');
    expect(names).toContain('format_document');
    expect(names).toContain('apply_code_action');
    expect(names).toContain('insert_code');
    expect(names).toContain('replace_range');
  });

  it('should execute format_document', async () => {
    mockExecuteCommand.mockResolvedValue(undefined);
    const result = await executor.execute('format_document', { uri: 'file:///test.ts' });
    expect(result.success).toBe(true);
    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'vscode.executeFormatDocumentProvider',
      expect.anything(),
      expect.anything()
    );
  });

  it('should execute rename_symbol', async () => {
    mockExecuteCommand.mockResolvedValue(undefined);
    const result = await executor.execute('rename_symbol', {
      uri: 'file:///test.ts',
      line: 5,
      character: 10,
      newName: 'newFunctionName',
    });
    expect(result.success).toBe(true);
  });

  it('should return error for unknown tool', async () => {
    const result = await executor.execute('unknown_tool', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown tool');
  });

  it('should handle execution errors gracefully', async () => {
    mockExecuteCommand.mockRejectedValue(new Error('rename failed'));
    const result = await executor.execute('rename_symbol', {
      uri: 'file:///test.ts',
      line: 0,
      character: 0,
      newName: 'x',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('rename failed');
  });
});
```

**Step 2: Write the implementation**

```typescript
import * as vscode from 'vscode';

export interface ToolResult {
  success: boolean;
  message?: string;
  error?: string;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description: string }>;
      required: string[];
    };
  };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'rename_symbol',
      description: 'Rename a symbol across the entire project',
      parameters: {
        type: 'object',
        properties: {
          uri: { type: 'string', description: 'File URI containing the symbol' },
          line: { type: 'number', description: 'Line number (0-based)' },
          character: { type: 'number', description: 'Character offset (0-based)' },
          newName: { type: 'string', description: 'The new name for the symbol' },
        },
        required: ['uri', 'line', 'character', 'newName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'apply_code_action',
      description: 'Apply a quick fix or refactoring code action',
      parameters: {
        type: 'object',
        properties: {
          uri: { type: 'string', description: 'File URI' },
          line: { type: 'number', description: 'Line number (0-based)' },
          character: { type: 'number', description: 'Character offset (0-based)' },
          actionTitle: { type: 'string', description: 'Title of the code action to apply' },
        },
        required: ['uri', 'line', 'character', 'actionTitle'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'format_document',
      description: 'Format the entire document using the configured formatter',
      parameters: {
        type: 'object',
        properties: {
          uri: { type: 'string', description: 'File URI to format' },
        },
        required: ['uri'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'insert_code',
      description: 'Insert code at a specific position in a file',
      parameters: {
        type: 'object',
        properties: {
          uri: { type: 'string', description: 'File URI' },
          line: { type: 'number', description: 'Line number (0-based)' },
          character: { type: 'number', description: 'Character offset (0-based)' },
          code: { type: 'string', description: 'Code to insert' },
        },
        required: ['uri', 'line', 'character', 'code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'replace_range',
      description: 'Replace a range of code in a file',
      parameters: {
        type: 'object',
        properties: {
          uri: { type: 'string', description: 'File URI' },
          startLine: { type: 'number', description: 'Start line (0-based)' },
          startCharacter: { type: 'number', description: 'Start character (0-based)' },
          endLine: { type: 'number', description: 'End line (0-based)' },
          endCharacter: { type: 'number', description: 'End character (0-based)' },
          code: { type: 'string', description: 'Replacement code' },
        },
        required: ['uri', 'startLine', 'startCharacter', 'endLine', 'endCharacter', 'code'],
      },
    },
  },
];

export class EditorToolExecutor {
  async execute(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (toolName) {
        case 'rename_symbol':
          return this.renameSymbol(args);
        case 'apply_code_action':
          return this.applyCodeAction(args);
        case 'format_document':
          return this.formatDocument(args);
        case 'insert_code':
          return this.insertCode(args);
        case 'replace_range':
          return this.replaceRange(args);
        default:
          return { success: false, error: `Unknown tool: ${toolName}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async renameSymbol(args: Record<string, unknown>): Promise<ToolResult> {
    const uri = vscode.Uri.parse(args.uri as string);
    const position = new vscode.Position(args.line as number, args.character as number);
    await vscode.commands.executeCommand('editor.action.rename', [uri, position]);
    return { success: true, message: `Renamed symbol to "${args.newName}"` };
  }

  private async applyCodeAction(args: Record<string, unknown>): Promise<ToolResult> {
    const uri = vscode.Uri.parse(args.uri as string);
    const position = new vscode.Position(args.line as number, args.character as number);
    const range = new vscode.Range(position, position);
    const actionTitle = args.actionTitle as string;

    const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
      'vscode.executeCodeActionProvider',
      uri,
      range
    );

    if (!actions) {
      return { success: false, error: 'No code actions available' };
    }

    const action = actions.find((a) => a.title === actionTitle);
    if (!action) {
      const available = actions.map((a) => a.title).join(', ');
      return { success: false, error: `Code action "${actionTitle}" not found. Available: ${available}` };
    }

    if (action.edit) {
      await vscode.workspace.applyEdit(action.edit);
    }
    if (action.command) {
      await vscode.commands.executeCommand(action.command.command, ...(action.command.arguments || []));
    }

    return { success: true, message: `Applied code action: ${actionTitle}` };
  }

  private async formatDocument(args: Record<string, unknown>): Promise<ToolResult> {
    const uri = vscode.Uri.parse(args.uri as string);
    const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
      'vscode.executeFormatDocumentProvider',
      uri,
      { tabSize: 2, insertSpaces: true }
    );

    if (edits && edits.length > 0) {
      const edit = new vscode.WorkspaceEdit();
      for (const e of edits) {
        edit.replace(uri, e.range, e.newText);
      }
      await vscode.workspace.applyEdit(edit);
    }

    return { success: true, message: 'Document formatted' };
  }

  private async insertCode(args: Record<string, unknown>): Promise<ToolResult> {
    const uri = vscode.Uri.parse(args.uri as string);
    const position = new vscode.Position(args.line as number, args.character as number);
    const code = args.code as string;

    const edit = new vscode.WorkspaceEdit();
    edit.insert(uri, position, code);
    await vscode.workspace.applyEdit(edit);

    return { success: true, message: `Inserted code at line ${args.line}` };
  }

  private async replaceRange(args: Record<string, unknown>): Promise<ToolResult> {
    const uri = vscode.Uri.parse(args.uri as string);
    const range = new vscode.Range(
      new vscode.Position(args.startLine as number, args.startCharacter as number),
      new vscode.Position(args.endLine as number, args.endCharacter as number)
    );
    const code = args.code as string;

    const edit = new vscode.WorkspaceEdit();
    edit.replace(uri, range, code);
    await vscode.workspace.applyEdit(edit);

    return { success: true, message: `Replaced code at lines ${args.startLine}-${args.endLine}` };
  }
}
```

**Step 3: Run tests and build**

Run: `npx vitest run src/lsp/editor-tools.test.ts`
Expected: All 5 tests pass

Run: `node esbuild.config.mjs`

**Step 4: Commit**

```bash
git add src/lsp/editor-tools.ts src/lsp/editor-tools.test.ts
git commit -m "feat: add EditorToolExecutor with rename, code action, format, insert, and replace tools"
```

---

### Task 4: Extend ContextBuilder with Code Intelligence

**Files:**
- Modify: `src/core/context-builder.ts`
- Modify: `src/core/context-builder.test.ts`

**Step 1: Update ContextBuilder to accept CodeIntelligence and enrich context**

Add a new method `buildEnrichedContext` that calls `resolveContext` and adds LSP data to the context and prompt formatting. The existing `buildContext` stays unchanged for backward compatibility.

Add to `src/core/context-builder.ts`:

```typescript
import { CodeIntelligence } from '../lsp/code-intelligence';
import { CapabilityDetector, type EditorCapabilities } from '../lsp/capability-detector';

// Add to class:
private codeIntelligence?: CodeIntelligence;
private capabilityDetector?: CapabilityDetector;
private cachedCapabilities?: EditorCapabilities;

setCodeIntelligence(ci: CodeIntelligence, cd: CapabilityDetector): void {
  this.codeIntelligence = ci;
  this.capabilityDetector = cd;
}

async buildEnrichedContext(): Promise<CodeContext> {
  const context = this.buildContext();

  if (!this.codeIntelligence || !context.activeFile) {
    return context;
  }

  const uri = context.activeFile.uri;
  const line = context.activeFile.cursorLine ?? 0;
  const char = context.activeFile.cursorCharacter ?? 0;

  const lspContext = await this.codeIntelligence.resolveContext(uri, line, char);

  // Add diagnostics
  context.diagnostics = lspContext.diagnostics.map((d) => ({
    message: d.message,
    severity: d.severity,
    range: { startLine: d.startLine, endLine: d.endLine },
  }));

  return context;
}

formatEnrichedPrompt(context: CodeContext, capabilities?: EditorCapabilities): string {
  let prompt = this.formatForPrompt(context);

  if (context.diagnostics && context.diagnostics.length > 0) {
    prompt += '\n\n## Diagnostics:\n';
    for (const d of context.diagnostics) {
      prompt += `- [${d.severity}] Line ${d.range.startLine + 1}: ${d.message}\n`;
    }
  }

  if (capabilities && this.capabilityDetector) {
    prompt += this.capabilityDetector.formatForPrompt(capabilities);
  }

  return prompt;
}

async detectCapabilities(): Promise<EditorCapabilities | undefined> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !this.capabilityDetector) return undefined;

  this.cachedCapabilities = await this.capabilityDetector.detect(
    editor.document.uri.toString(),
    editor.document.languageId
  );
  return this.cachedCapabilities;
}

getCapabilities(): EditorCapabilities | undefined {
  return this.cachedCapabilities;
}
```

**Step 2: Add tests**

Add to `src/core/context-builder.test.ts`:

```typescript
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
});
```

**Step 3: Run tests and build**

Run: `npx vitest run src/core/context-builder.test.ts`
Run: `node esbuild.config.mjs`

**Step 4: Commit**

```bash
git add src/core/context-builder.ts src/core/context-builder.test.ts
git commit -m "feat: extend ContextBuilder with LSP enrichment and capability detection"
```

---

### Task 5: Integrate Tool-Use into MessageHandler

**Files:**
- Modify: `src/shared/types.ts` — add tool-use types to ChatRequest
- Modify: `src/chat/message-handler.ts` — integrate capabilities + tool-use loop
- Modify: `src/core/openrouter-client.ts` — pass tools in request

**Step 1: Add tool types to shared/types.ts**

Add to `ChatRequest`:
```typescript
export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: ToolDefinition[];
}

// Add at bottom:
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}
```

Update `ChatResponse` choices to include tool_calls:
```typescript
export interface ChatResponse {
  id: string;
  choices: Array<{
    message: ChatMessage & { tool_calls?: ToolCall[] };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
```

**Step 2: Update MessageHandler to use enriched context and capabilities**

Modify `handleSendMessage` in `src/chat/message-handler.ts`:
- Use `buildEnrichedContext` instead of `buildContext`
- Use `formatEnrichedPrompt` with capabilities
- Include tool definitions in the request when capabilities are available
- Handle tool_calls in the response (execute them, feed results back)

The constructor should accept optional `CodeIntelligence` and `EditorToolExecutor`.

```typescript
// Add imports
import { CodeIntelligence } from '../lsp/code-intelligence';
import { CapabilityDetector } from '../lsp/capability-detector';
import { EditorToolExecutor, TOOL_DEFINITIONS } from '../lsp/editor-tools';

// Update constructor
constructor(
  private readonly client: OpenRouterClient,
  private readonly contextBuilder: ContextBuilder,
  private readonly settings: Settings,
  private readonly toolExecutor?: EditorToolExecutor
) {}
```

In `handleSendMessage`, after building context, add tool definitions if capabilities support them:
```typescript
const capabilities = this.contextBuilder.getCapabilities();
const contextPrompt = this.contextBuilder.formatEnrichedPrompt(context, capabilities);

// Build request with optional tools
const requestTools = capabilities?.codeActions || capabilities?.rename || capabilities?.formatting
  ? TOOL_DEFINITIONS
  : undefined;
```

**Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (may need to update message-handler test mocks)

**Step 4: Commit**

```bash
git add src/shared/types.ts src/chat/message-handler.ts src/core/openrouter-client.ts
git commit -m "feat: integrate tool-use into chat with editor capabilities and tool execution"
```

---

### Task 6: Wire Everything in Extension Entry Point

**Files:**
- Modify: `src/extension.ts`

**Step 1: Wire CodeIntelligence, CapabilityDetector, and EditorToolExecutor**

Add imports and initialization:
```typescript
import { CodeIntelligence } from './lsp/code-intelligence';
import { CapabilityDetector } from './lsp/capability-detector';
import { EditorToolExecutor } from './lsp/editor-tools';

// In activate():
const codeIntelligence = new CodeIntelligence();
const capabilityDetector = new CapabilityDetector();
const toolExecutor = new EditorToolExecutor();

// Set up context builder with LSP
contextBuilder.setCodeIntelligence(codeIntelligence, capabilityDetector);

// Update MessageHandler constructor
const messageHandler = new MessageHandler(client, contextBuilder, settings, toolExecutor);

// Detect capabilities when active editor changes
context.subscriptions.push(
  vscode.window.onDidChangeActiveTextEditor(() => {
    contextBuilder.detectCapabilities();
  })
);

// Initial capability detection
contextBuilder.detectCapabilities();
```

**Step 2: Build and test**

Run: `npx vitest run && node esbuild.config.mjs`
Expected: All pass

**Step 3: Commit**

```bash
git add src/extension.ts
git commit -m "feat: wire code intelligence, capability detection, and tool executor into extension"
```

---

### Task 7: Update Features and Tests

**Files:**
- Modify: `docs/features.md` — mark Phase 3 features as complete
- Run full test suite

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 2: Build everything**

Run: `npm run build`

**Step 3: Update features.md Phase 3 items**

Mark all Code Intelligence and Editor Capability Hints features as complete.

**Step 4: Commit**

```bash
git add docs/features.md
git commit -m "docs: mark Phase 3 code intelligence features as complete"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Code Intelligence (LSP wrappers) | `src/lsp/code-intelligence.ts` + test |
| 2 | Capability Detector | `src/lsp/capability-detector.ts` + test |
| 3 | Editor Tool Executor | `src/lsp/editor-tools.ts` + test |
| 4 | Extend ContextBuilder with LSP | `src/core/context-builder.ts` + test |
| 5 | Tool-use in MessageHandler | `src/shared/types.ts`, `src/chat/message-handler.ts` |
| 6 | Wire in Extension Entry Point | `src/extension.ts` |
| 7 | Update Features & Final Tests | `docs/features.md` |
