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

    const rename = definition;

    return { hover, definition, typeDefinition, references, symbols, rename, codeActions, formatting, languageId };
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

    if (available.length === 0) return '';

    return `\n## Editor Capabilities (${caps.languageId})\n\nThe following editor actions are available for the current file:\n${available.join('\n')}\n\nWhen relevant, suggest using these actions instead of manually editing code.`;
  }
}
