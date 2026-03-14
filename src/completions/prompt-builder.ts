import type { ChatMessage } from '../shared/types';

export interface CompletionPrompt {
  prefix: string;
  suffix: string;
  languageId: string;
  messages: ChatMessage[];
}

export function buildCompletionPrompt(
  content: string,
  cursorLine: number,
  cursorCharacter: number,
  languageId: string,
  maxContextLines: number
): CompletionPrompt {
  const lines = content.split('\n');

  const startLine = Math.max(0, cursorLine - maxContextLines);
  const endLine = Math.min(lines.length - 1, cursorLine + maxContextLines);

  const prefixLines = lines.slice(startLine, cursorLine);
  const currentLinePrefix = lines[cursorLine]?.substring(0, cursorCharacter) ?? '';
  const prefix = [...prefixLines, currentLinePrefix].join('\n');

  const currentLineSuffix = lines[cursorLine]?.substring(cursorCharacter) ?? '';
  const suffixLines = lines.slice(cursorLine + 1, endLine + 1);
  const suffix = [currentLineSuffix, ...suffixLines].join('\n');

  const systemMessage: ChatMessage = {
    role: 'system',
    content: `You are a code completion assistant. You provide short, accurate code completions for ${languageId} code. Only output the completion text — no explanations, no markdown, no code fences. Continue from exactly where the cursor is.`,
  };

  const userMessage: ChatMessage = {
    role: 'user',
    content: `Complete the following ${languageId} code at the cursor position marked with <CURSOR>:\n\n${prefix}<CURSOR>${suffix}`,
  };

  return {
    prefix,
    suffix,
    languageId,
    messages: [systemMessage, userMessage],
  };
}
