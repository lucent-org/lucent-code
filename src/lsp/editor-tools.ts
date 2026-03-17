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
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Find files in the workspace matching a glob pattern. Use as fallback when LSP cannot enumerate files.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern e.g. "src/**/*.ts"' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep_files',
      description: 'Search file contents with a regex pattern. Use as fallback when LSP reference lookup returns no results or the language has no server.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regex pattern to search for' },
          include: { type: 'string', description: 'Glob pattern to filter files (default: "**/*")' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: 'Search the web using DuckDuckGo. Returns an abstract and top results. Use to look up documentation, error messages, or concepts.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description: 'Fetch a URL and return its content as clean Markdown. Use to read documentation pages, READMEs, or package pages.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fetch' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'http_request',
      description: 'Make an HTTP request to a URL. Use to query a local dev server, REST API, or any HTTP endpoint.',
      parameters: {
        type: 'object',
        properties: {
          method: { type: 'string', description: 'HTTP method: GET, POST, PUT, DELETE' },
          url: { type: 'string', description: 'Request URL' },
          headers: { type: 'object', description: 'Optional request headers as key-value pairs' },
          body: { type: 'string', description: 'Optional request body' },
        },
        required: ['method', 'url'],
      },
    },
  },
];

export class EditorToolExecutor {
  async execute(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (toolName) {
        case 'rename_symbol':
          return await this.renameSymbol(args);
        case 'apply_code_action':
          return await this.applyCodeAction(args);
        case 'format_document':
          return await this.formatDocument(args);
        case 'insert_code':
          return await this.insertCode(args);
        case 'replace_range':
          return await this.replaceRange(args);
        case 'search_files':
          return await this.searchFiles(args);
        case 'grep_files':
          return await this.grepFiles(args);
        case 'search_web':
          return await this.searchWeb(args);
        case 'fetch_url':
          return await this.fetchUrl(args);
        case 'http_request':
          return await this.httpRequest(args);
        default:
          return { success: false, error: `Unknown tool: ${toolName}` };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async renameSymbol(args: Record<string, unknown>): Promise<ToolResult> {
    const uri = vscode.Uri.parse(args.uri as string);
    const position = new vscode.Position(args.line as number, args.character as number);
    const newName = args.newName as string;

    const edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
      'vscode.executeDocumentRenameProvider', uri, position, newName
    );

    if (!edit) {
      return { success: false, error: 'No rename edit returned — symbol may not be renameable at this position' };
    }

    await vscode.workspace.applyEdit(edit);
    return { success: true, message: `Renamed symbol to "${newName}"` };
  }

  private async applyCodeAction(args: Record<string, unknown>): Promise<ToolResult> {
    const uri = vscode.Uri.parse(args.uri as string);
    const position = new vscode.Position(args.line as number, args.character as number);
    const range = new vscode.Range(position, position);
    const actionTitle = args.actionTitle as string;

    const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
      'vscode.executeCodeActionProvider', uri, range
    );

    if (!actions) return { success: false, error: 'No code actions available' };

    const action = actions.find((a) => a.title === actionTitle);
    if (!action) {
      const available = actions.map((a) => a.title).join(', ');
      return { success: false, error: `Code action "${actionTitle}" not found. Available: ${available}` };
    }

    if (action.edit) await vscode.workspace.applyEdit(action.edit);
    if (action.command) await vscode.commands.executeCommand(action.command.command, ...(action.command.arguments || []));

    return { success: true, message: `Applied code action: ${actionTitle}` };
  }

  private async formatDocument(args: Record<string, unknown>): Promise<ToolResult> {
    const uri = vscode.Uri.parse(args.uri as string);
    const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
      'vscode.executeFormatDocumentProvider', uri, { tabSize: 2, insertSpaces: true }
    );

    if (edits && edits.length > 0) {
      const edit = new vscode.WorkspaceEdit();
      for (const e of edits) edit.replace(uri, e.range, e.newText);
      await vscode.workspace.applyEdit(edit);
    }

    return { success: true, message: 'Document formatted' };
  }

  private async insertCode(args: Record<string, unknown>): Promise<ToolResult> {
    const uri = vscode.Uri.parse(args.uri as string);
    const position = new vscode.Position(args.line as number, args.character as number);
    const edit = new vscode.WorkspaceEdit();
    edit.insert(uri, position, args.code as string);
    await vscode.workspace.applyEdit(edit);
    return { success: true, message: `Inserted code at line ${args.line}` };
  }

  private async replaceRange(args: Record<string, unknown>): Promise<ToolResult> {
    const uri = vscode.Uri.parse(args.uri as string);
    const range = new vscode.Range(
      new vscode.Position(args.startLine as number, args.startCharacter as number),
      new vscode.Position(args.endLine as number, args.endCharacter as number)
    );
    const edit = new vscode.WorkspaceEdit();
    edit.replace(uri, range, args.code as string);
    await vscode.workspace.applyEdit(edit);
    return { success: true, message: `Replaced code at lines ${args.startLine}-${args.endLine}` };
  }

  private async searchFiles(args: Record<string, unknown>): Promise<ToolResult> {
    const pattern = args.pattern as string;
    const uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 500);
    if (uris.length === 0) return { success: true, message: 'No files found' };
    return { success: true, message: uris.map((u) => u.fsPath).join('\n') };
  }

  private async grepFiles(args: Record<string, unknown>): Promise<ToolResult> {
    const pattern = args.pattern as string;
    const include = (args.include as string | undefined) ?? '**/*';
    let regex: RegExp;
    try {
      regex = new RegExp(pattern);
    } catch {
      return { success: false, error: `Invalid regex: ${pattern}` };
    }

    const uris = await vscode.workspace.findFiles(include, '**/node_modules/**', 100);
    const matches: string[] = [];

    for (const uri of uris) {
      if (matches.length >= 50) break;
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        const content = new TextDecoder().decode(bytes);
        const lines = content.split('\n');
        for (let i = 0; i < lines.length && matches.length < 50; i++) {
          if (regex.test(lines[i])) {
            matches.push(`${uri.fsPath}:${i + 1}: ${lines[i].trim()}`);
          }
        }
      } catch { /* skip unreadable files */ }
    }

    return { success: true, message: matches.length > 0 ? matches.join('\n') : 'No matches found' };
  }

  private async searchWeb(args: Record<string, unknown>): Promise<ToolResult> {
    const query = args.query as string;
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const response = await fetch(url);
    if (!response.ok) return { success: false, error: `Search failed: ${response.status}` };

    const data = await response.json() as {
      Abstract?: string;
      RelatedTopics?: Array<{ Text?: string }>;
    };

    const parts: string[] = [];
    if (data.Abstract) parts.push(data.Abstract);
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, 5)) {
        if (topic.Text) parts.push(`- ${topic.Text}`);
      }
    }
    return { success: true, message: parts.join('\n') || 'No results found' };
  }

  private async fetchUrl(args: Record<string, unknown>): Promise<ToolResult> {
    const url = args.url as string;
    const response = await fetch(`https://r.jina.ai/${url}`);
    if (!response.ok) return { success: false, error: `Fetch failed: ${response.status}` };
    const text = await response.text();
    return { success: true, message: text };
  }

  private async httpRequest(args: Record<string, unknown>): Promise<ToolResult> {
    const method = (args.method as string).toUpperCase();
    const url = args.url as string;
    const headers = args.headers as Record<string, string> | undefined;
    const body = args.body as string | undefined;

    const response = await fetch(url, { method, headers, body });
    const text = await response.text();
    return { success: true, message: JSON.stringify({ status: response.status, body: text }) };
  }
}
