import * as vscode from 'vscode';
import type { CodeContext } from '../shared/types';
import { CodeIntelligence } from '../lsp/code-intelligence';
import { CapabilityDetector, type EditorCapabilities } from '../lsp/capability-detector';

interface InstructionsProvider {
  getInstructions(): string | undefined;
}

export class ContextBuilder {
  private codeIntelligence?: CodeIntelligence;
  private capabilityDetector?: CapabilityDetector;
  private cachedCapabilities?: EditorCapabilities;
  private instructionsLoader?: InstructionsProvider;

  setInstructionsLoader(loader: InstructionsProvider): void {
    this.instructionsLoader = loader;
  }

  getCustomInstructions(): string | undefined {
    return this.instructionsLoader?.getInstructions();
  }

  setCodeIntelligence(ci: CodeIntelligence, cd: CapabilityDetector): void {
    this.codeIntelligence = ci;
    this.capabilityDetector = cd;
  }

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

  async buildEnrichedContext(): Promise<CodeContext> {
    const context = this.buildContext();

    if (!context.activeFile) {
      return context;
    }

    const line = context.activeFile.cursorLine ?? 0;
    const char = context.activeFile.cursorCharacter ?? 0;

    if (this.codeIntelligence) {
      const lspContext = await this.codeIntelligence.resolveContext(context.activeFile.uri, line, char);

      context.diagnostics = lspContext.diagnostics.map((d) => ({
        message: d.message,
        severity: d.severity,
        range: { startLine: d.startLine, endLine: d.endLine },
      }));
    }

    // Fetch available code actions at cursor
    try {
      const uri = vscode.Uri.parse(context.activeFile.uri);
      const pos = new vscode.Position(line, char);
      const range = new vscode.Range(pos, pos);
      const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
        'vscode.executeCodeActionProvider',
        uri,
        range,
        vscode.CodeActionKind.QuickFix.value
      );
      if (actions && actions.length > 0) {
        context.codeActions = actions.map((a) => a.title);
      }
    } catch {
      // Code actions not supported for this language — omit
    }

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

    if (context.codeActions && context.codeActions.length > 0) {
      prompt += '\n\n## Available Code Actions at Cursor:\n';
      for (const action of context.codeActions) {
        prompt += `- ${action}\n`;
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
}
