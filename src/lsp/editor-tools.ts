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
          return await this.renameSymbol(args);
        case 'apply_code_action':
          return await this.applyCodeAction(args);
        case 'format_document':
          return await this.formatDocument(args);
        case 'insert_code':
          return await this.insertCode(args);
        case 'replace_range':
          return await this.replaceRange(args);
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
}
