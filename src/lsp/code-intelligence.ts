import * as vscode from 'vscode';

interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

const CACHE_TTL = 5000;

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
    if (this.cache.size >= 100) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }
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
        'vscode.executeHoverProvider', uri, position
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
        'vscode.executeDefinitionProvider', uri, position
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
        'vscode.executeReferenceProvider', uri, position
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
    const severityMap: Record<number, string> = { 0: 'Error', 1: 'Warning', 2: 'Information', 3: 'Hint' };
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
        'vscode.executeDocumentSymbolProvider', uri
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
