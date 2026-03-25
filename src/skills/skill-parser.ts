export interface FrontmatterResult {
  name?: string;
  description?: string;
  body: string;
}

export function parseFrontmatter(markdown: string): FrontmatterResult {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { body: markdown };
  const fm = match[1];
  const body = match[2] ?? '';
  const stripQuotes = (s: string) => s.replace(/^["']|["']$/g, '');
  const name = fm.match(/^name:\s*(.+)$/m)?.[1] ? stripQuotes(fm.match(/^name:\s*(.+)$/m)![1].trim()) : undefined;
  const description = fm.match(/^description:\s*(.+)$/m)?.[1] ? stripQuotes(fm.match(/^description:\s*(.+)$/m)![1].trim()) : undefined;
  return { name, description, body };
}
