import { describe, it, expect } from 'vitest';
import { buildCompletionPrompt } from './prompt-builder';

describe('buildCompletionPrompt', () => {
  const fullContent = [
    'function greet(name: string) {',
    '  console.log(`Hello, ${name}!`);',
    '}',
    '',
    'function add(a: number, b: number) {',
    '  return a + b;',
    '}',
    '',
    'function main() {',
    '  const result = add(1, 2);',
    '  ',
    '}',
  ].join('\n');

  it('should split content at cursor into prefix and suffix', () => {
    const result = buildCompletionPrompt(fullContent, 10, 2, 'typescript', 100);
    expect(result.prefix).toContain('function main()');
    expect(result.prefix.endsWith('  ')).toBe(true);
    expect(result.suffix).toContain('}');
  });

  it('should include language in the prompt', () => {
    const result = buildCompletionPrompt(fullContent, 10, 2, 'typescript', 100);
    expect(result.languageId).toBe('typescript');
  });

  it('should limit context to maxLines before and after cursor', () => {
    const result = buildCompletionPrompt(fullContent, 10, 2, 'typescript', 3);
    const prefixLines = result.prefix.split('\n');
    expect(prefixLines.length).toBeLessThanOrEqual(4);
  });

  it('should handle cursor at start of file', () => {
    const result = buildCompletionPrompt(fullContent, 0, 0, 'typescript', 100);
    expect(result.prefix).toBe('');
    expect(result.suffix.length).toBeGreaterThan(0);
  });

  it('should handle cursor at end of file', () => {
    const lines = fullContent.split('\n');
    const lastLine = lines.length - 1;
    const lastChar = lines[lastLine].length;
    const result = buildCompletionPrompt(fullContent, lastLine, lastChar, 'typescript', 100);
    expect(result.suffix).toBe('');
    expect(result.prefix.length).toBeGreaterThan(0);
  });

  it('should build chat messages for the API call', () => {
    const result = buildCompletionPrompt(fullContent, 10, 2, 'typescript', 100);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].role).toBe('system');
    expect(result.messages[0].content).toContain('code completion');
    expect(result.messages[1].role).toBe('user');
    expect(result.messages[1].content).toContain(result.prefix);
  });
});
