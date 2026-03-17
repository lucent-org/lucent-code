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
        onRespond={(requestId, approved) => {
          window.dispatchEvent(new CustomEvent('tool-approval', { detail: { requestId, approved } }));
        }}
      />
    );
  }

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
              <CodeBlock code={part.content} language={part.language} filename={part.filename} />
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
