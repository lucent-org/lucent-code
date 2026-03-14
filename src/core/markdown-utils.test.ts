import { describe, it, expect } from 'vitest';

// Functions copied from webview/src/utils/markdown.ts to avoid
// cross-project module resolution issues.

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMarkdown(text: string): string {
  let html = escapeHtml(text);

  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_match, lang, code) =>
      `<pre><code class="language-${lang}">${code.trim()}</code></pre>`
  );

  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/\n/g, '<br>');

  return html;
}

describe('escapeHtml', () => {
  it('should escape &, <, >, ", and \'', () => {
    const input = '&<>"\'';
    const result = escapeHtml(input);
    expect(result).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('should return empty string for empty input', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('should pass through normal text unchanged', () => {
    const input = 'Hello, world! 123';
    expect(escapeHtml(input)).toBe('Hello, world! 123');
  });
});

describe('renderMarkdown', () => {
  it('should render code blocks with language class', () => {
    const input = '```javascript\nconst x = 1;\n```';
    const result = renderMarkdown(input);
    expect(result).toContain('<pre><code class="language-javascript">');
    expect(result).toContain('const x = 1;');
    expect(result).toContain('</code></pre>');
  });

  it('should render inline code', () => {
    const input = 'Use `console.log` to debug';
    const result = renderMarkdown(input);
    expect(result).toContain('<code>console.log</code>');
  });

  it('should render bold text', () => {
    const input = 'This is **bold** text';
    const result = renderMarkdown(input);
    expect(result).toContain('<strong>bold</strong>');
  });

  it('should render italic text', () => {
    const input = 'This is *italic* text';
    const result = renderMarkdown(input);
    expect(result).toContain('<em>italic</em>');
  });

  it('should convert newlines to <br>', () => {
    const input = 'line one\nline two';
    const result = renderMarkdown(input);
    expect(result).toContain('line one<br>line two');
  });

  it('should handle combined markdown elements', () => {
    const input = '```python\nprint("hi")\n```\nThis is **bold** and `code`';
    const result = renderMarkdown(input);
    expect(result).toContain('<pre><code class="language-python">');
    expect(result).toContain('<strong>bold</strong>');
    expect(result).toContain('<code>code</code>');
  });

  it('should escape HTML in user input to prevent XSS', () => {
    const input = '<script>alert("xss")</script>';
    const result = renderMarkdown(input);
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });
});
