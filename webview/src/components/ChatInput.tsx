import { Component, createSignal, Show, For } from 'solid-js';

interface MentionSource {
  id: string;
  label: string;
  description: string;
  kind: 'context' | 'action';
}

const MENTION_SOURCES: MentionSource[] = [
  { id: 'fix',     label: '@fix',     description: 'Fix code at cursor',              kind: 'action'  },
  { id: 'explain', label: '@explain', description: 'Explain code at cursor',           kind: 'action'  },
  { id: 'test',    label: '@test',    description: 'Write tests for code at cursor',   kind: 'action'  },
  { id: 'terminal', label: '@terminal', description: 'Last 200 lines of active terminal', kind: 'context' },
];

interface ChatInputProps {
  onSend: (content: string, images: string[]) => void;
  onCancel: () => void;
  isStreaming: boolean;
  onResolveMention: (type: string) => Promise<string | null>;
}

const ChatInput: Component<ChatInputProps> = (props) => {
  const [input, setInput] = createSignal('');
  const [showMentions, setShowMentions] = createSignal(false);
  const [mentionFilter, setMentionFilter] = createSignal('');
  const [isResolvingMention, setIsResolvingMention] = createSignal(false);

  interface Attachment {
    id: string;
    name: string;
    kind: 'image' | 'text';
    data: string;
    mimeType: string;
    error?: string;
  }

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

  const [attachments, setAttachments] = createSignal<Attachment[]>([]);

  const handleFiles = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      const id = Math.random().toString(36).slice(2);
      const kind: 'image' | 'text' = file.type.startsWith('image/') ? 'image' : 'text';

      if (file.size > MAX_FILE_SIZE) {
        setAttachments((prev) => [
          ...prev,
          { id, name: file.name, kind, data: '', mimeType: file.type, error: 'Too large (max 5 MB)' },
        ]);
        continue;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const data = (e.target?.result as string) ?? '';
        setAttachments((prev) => [...prev, { id, name: file.name, kind, data, mimeType: file.type }]);
      };

      if (kind === 'image') {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowMentions(false);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !showMentions()) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: Event) => {
    const value = (e.currentTarget as HTMLTextAreaElement).value;
    setInput(value);

    // Detect @ trigger — only open at start or after a space
    const lastAt = value.lastIndexOf('@');
    if (lastAt !== -1 && (lastAt === 0 || value[lastAt - 1] === ' ')) {
      const after = value.slice(lastAt + 1);
      // Only show if no space after @
      if (!after.includes(' ')) {
        setMentionFilter(after.toLowerCase());
        setShowMentions(true);
        return;
      }
    }
    setShowMentions(false);
  };

  const filteredSources = () =>
    MENTION_SOURCES.filter((s) => s.label.toLowerCase().includes(mentionFilter()));

  const actionSources = () => filteredSources().filter((s) => s.kind === 'action');
  const contextSources = () => filteredSources().filter((s) => s.kind === 'context');

  const selectMention = async (source: MentionSource) => {
    setShowMentions(false);
    setIsResolvingMention(true);
    const value = input();
    const lastAt = value.lastIndexOf('@');
    const beforeAt = lastAt !== -1 ? value.slice(0, lastAt) : value;

    try {
      const content = await props.onResolveMention(source.id);
      if (content) {
        if (source.kind === 'action') {
          setInput(`${beforeAt}${content} `);
        } else {
          setInput(`${beforeAt}<${source.id} output>\n${content}\n</${source.id} output> `);
        }
      } else {
        setInput(`${beforeAt}[${source.label}: not available] `);
      }
    } finally {
      setIsResolvingMention(false);
    }
  };

  const handleSend = () => {
    if (props.isStreaming) return;

    const validAttachments = attachments().filter((a) => !a.error);
    const textFiles = validAttachments.filter((a) => a.kind === 'text');
    const images = validAttachments.filter((a) => a.kind === 'image').map((a) => a.data);

    const textParts = textFiles.map((a) => `\`\`\`${a.name}\n${a.data}\n\`\`\``);
    const fullContent = [...textParts, input().trim()].filter(Boolean).join('\n\n');

    if (!fullContent && images.length === 0) return;

    props.onSend(fullContent, images);
    setInput('');
    setAttachments([]);
  };

  return (
    <div class="chat-input-container">
      <div class="chat-input-wrapper">
        <Show when={showMentions() && filteredSources().length > 0}>
          <div class="mention-dropdown">
            <For each={actionSources()}>
              {(source) => (
                <button
                  class="mention-item"
                  onMouseDown={(e) => { e.preventDefault(); void selectMention(source); }}
                >
                  <span class="mention-item-label">{source.label}</span>
                  <span class="mention-item-desc">{source.description}</span>
                </button>
              )}
            </For>
            <Show when={actionSources().length > 0 && contextSources().length > 0}>
              <div class="mention-group-separator" />
            </Show>
            <For each={contextSources()}>
              {(source) => (
                <button
                  class="mention-item"
                  onMouseDown={(e) => { e.preventDefault(); void selectMention(source); }}
                >
                  <span class="mention-item-label">{source.label}</span>
                  <span class="mention-item-desc">{source.description}</span>
                </button>
              )}
            </For>
          </div>
        </Show>
        <textarea
          class="chat-input"
          value={input()}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your code... Type @ for mentions"
          rows={3}
          disabled={props.isStreaming || isResolvingMention()}
        />
      </div>
      <div class="chat-input-actions">
        <Show
          when={props.isStreaming}
          fallback={
            <button class="send-button" onClick={handleSend} disabled={!input().trim()}>
              Send
            </button>
          }
        >
          <button class="cancel-button" onClick={props.onCancel}>
            Stop
          </button>
        </Show>
      </div>
    </div>
  );
};

export default ChatInput;
