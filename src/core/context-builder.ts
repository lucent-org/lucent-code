import * as vscode from 'vscode';
import type { CodeContext } from '../shared/types';

export class ContextBuilder {
  buildContext(): CodeContext {
    const editor = vscode.window.activeTextEditor;
    const context: CodeContext = {};

    if (!editor) {
      return context;
    }

    const document = editor.document;

    context.activeFile = {
      uri: document.uri.toString(),
      languageId: document.languageId,
      content: document.getText(),
      cursorLine: editor.selection.active.line,
      cursorCharacter: editor.selection.active.character,
    };

    if (!editor.selection.isEmpty) {
      context.selection = {
        text: document.getText(editor.selection),
        startLine: editor.selection.start.line,
        endLine: editor.selection.end.line,
      };
    }

    context.openEditors = vscode.window.visibleTextEditors
      .filter((e) => e !== editor)
      .map((e) => ({
        uri: e.document.uri.toString(),
        languageId: e.document.languageId,
      }));

    return context;
  }

  formatForPrompt(context: CodeContext): string {
    const parts: string[] = [];

    if (context.activeFile) {
      parts.push(`## Active File: ${context.activeFile.uri}`);
      parts.push(`Language: ${context.activeFile.languageId}`);
      if (context.activeFile.cursorLine !== undefined) {
        parts.push(`Cursor: line ${context.activeFile.cursorLine + 1}`);
      }
      parts.push('```' + context.activeFile.languageId);
      parts.push(context.activeFile.content);
      parts.push('```');
    }

    if (context.selection) {
      parts.push(`\n## Selected Code (lines ${context.selection.startLine + 1}-${context.selection.endLine + 1}):`);
      parts.push('```');
      parts.push(context.selection.text);
      parts.push('```');
    }

    if (context.openEditors && context.openEditors.length > 0) {
      parts.push('\n## Other Open Files:');
      for (const editor of context.openEditors) {
        parts.push(`- ${editor.uri} (${editor.languageId})`);
      }
    }

    return parts.join('\n');
  }
}
