import DOMPurify from 'dompurify';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderMarkdown(text: string): string {
  let html = escapeHtml(text);

  // Fenced code blocks (must run before inline replacements)
  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_match, lang, code) =>
      `<pre><code class="language-${lang}">${code.trim()}</code></pre>`
  );

  // Headings (h1–h4)
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Unordered lists (consecutive `- ` lines → <ul><li>…</li></ul>)
  html = html.replace(/((?:^- .+\n?)+)/gm, (block) => {
    const items = block.trimEnd().split('\n').map((line) =>
      `<li>${line.replace(/^- /, '')}</li>`
    ).join('');
    return `<ul>${items}</ul>`;
  });

  // Ordered lists (consecutive `N. ` lines → <ol><li>…</li></ol>)
  html = html.replace(/((?:^\d+\. .+\n?)+)/gm, (block) => {
    const items = block.trimEnd().split('\n').map((line) =>
      `<li>${line.replace(/^\d+\. /, '')}</li>`
    ).join('');
    return `<ol>${items}</ol>`;
  });

  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/\n/g, '<br>');

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['pre', 'code', 'strong', 'em', 'br', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['class'],
  });
}
