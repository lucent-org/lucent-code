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
