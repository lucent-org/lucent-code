import { Component, Show, For, createMemo } from 'solid-js';
import DOMPurify from 'dompurify';
import type { ChatMessage as ChatMessageType } from '../stores/chat';
import CodeBlock from './CodeBlock';
import ToolCallCard from './ToolCallCard';
import type { ToolApprovalData } from './ToolCallCard';

interface ChatMessageProps {
  message: ChatMessageType;
}

interface ContentPart {
  type: 'text' | 'code';
  content: string;
  language?: string;
  filename?: string;
}

function parseContent(content: string): ContentPart[] {
  const parts: ContentPart[] = [];
  const codeBlockRegex = /```([\w]*)([^\n]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }
    const language = match[1] || undefined;
    const filename = match[2].trim() || undefined;
    parts.push({ type: 'code', content: match[3].trim(), language, filename });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: 'text', content: content.slice(lastIndex) });
  }

  return parts;
}

const ChatMessage: Component<ChatMessageProps> = (props) => {
  // Render tool approval card inline
  if (props.message.role === 'tool_approval' && props.message.toolApproval) {
    return (
      <ToolCallCard
        approval={props.message.toolApproval as ToolApprovalData}
        onRespond={(requestId, approved, scope) => {
          window.dispatchEvent(new CustomEvent('tool-approval', { detail: { requestId, approved, scope } }));
        }}
      />
    );
  }

  const parts = createMemo(() => parseContent(props.message.content));

  return (
    <div class={`chat-message ${props.message.role}`}>
      <div class="message-role">{props.message.role === 'user' ? 'You' : 'Assistant'}</div>
      <div class="message-content">
        <Show when={props.message.role === 'user' && (props.message.images?.length ?? 0) > 0}>
          <div class="message-images">
            <For each={props.message.images ?? []}>
              {(src) => <img class="message-image-thumb" src={src} alt="attachment" />}
            </For>
          </div>
        </Show>
        <For each={parts()}>
          {(part) => (
            <Show
              when={part.type === 'code'}
              fallback={<div innerHTML={formatText(part.content)} />}
            >
              <CodeBlock code={part.content} language={part.language} filename={part.filename} />
            </Show>
          )}
        </For>
        <Show when={props.message.isStreaming && !props.message.content}>
          <span class="thinking-dots"><span>.</span><span>.</span><span>.</span></span>
        </Show>
        <Show when={props.message.isStreaming && !!props.message.content}>
          <span class="cursor-blink">|</span>
        </Show>
        <Show when={props.message.role === 'assistant' && props.message.cost !== undefined}>
          <div class="message-cost">
            · ${props.message.cost!.toFixed(4)} · {props.message.tokens?.toLocaleString()} tokens
          </div>
        </Show>
      </div>
    </div>
  );
};

function formatText(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Headings (h1–h4)
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Tables (| col | col | rows with a separator row)
  html = html.replace(/((?:^\|.+\|\n?)+)/gm, (block) => {
    const rows = block.trimEnd().split('\n').filter((r) => r.trim());
    // Detect separator row (e.g. |---|---|)
    const sepIdx = rows.findIndex((r) => /^\|[\s\-|:]+\|$/.test(r));
    if (sepIdx === -1) return block; // not a table
    const headerRow = rows[sepIdx - 1];
    const bodyRows = rows.slice(sepIdx + 1);
    const parseRow = (row: string, tag: string) =>
      '<tr>' + row.replace(/^\||\|$/g, '').split('|').map((cell) =>
        `<${tag}>${cell.trim()}</${tag}>`
      ).join('') + '</tr>';
    const thead = headerRow ? `<thead>${parseRow(headerRow, 'th')}</thead>` : '';
    const tbody = bodyRows.length ? `<tbody>${bodyRows.map((r) => parseRow(r, 'td')).join('')}</tbody>` : '';
    return `<table>${thead}${tbody}</table>`;
  });

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

  html = html
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['code', 'strong', 'em', 'br', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    ALLOWED_ATTR: [],
  });
}

export default ChatMessage;
