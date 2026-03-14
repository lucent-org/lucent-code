import { Component, Show, For, createMemo } from 'solid-js';
import DOMPurify from 'dompurify';
import type { ChatMessage as ChatMessageType } from '../stores/chat';
import CodeBlock from './CodeBlock';

interface ChatMessageProps {
  message: ChatMessageType;
}

interface ContentPart {
  type: 'text' | 'code';
  content: string;
  language?: string;
}

function parseContent(content: string): ContentPart[] {
  const parts: ContentPart[] = [];
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'code', content: match[2].trim(), language: match[1] || undefined });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: 'text', content: content.slice(lastIndex) });
  }

  return parts;
}

const ChatMessage: Component<ChatMessageProps> = (props) => {
  const parts = createMemo(() => parseContent(props.message.content));

  return (
    <div class={`chat-message ${props.message.role}`}>
      <div class="message-role">{props.message.role === 'user' ? 'You' : 'Assistant'}</div>
      <div class="message-content">
        <For each={parts()}>
          {(part) => (
            <Show
              when={part.type === 'code'}
              fallback={<span innerHTML={formatText(part.content)} />}
            >
              <CodeBlock code={part.content} language={part.language} />
            </Show>
          )}
        </For>
        <Show when={props.message.isStreaming}>
          <span class="cursor-blink">|</span>
        </Show>
      </div>
    </div>
  );
};

function formatText(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['code', 'strong', 'em', 'br'],
    ALLOWED_ATTR: [],
  });
}

export default ChatMessage;
