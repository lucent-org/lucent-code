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
  onSend: (content: string) => void;
  onCancel: () => void;
  isStreaming: boolean;
  onResolveMention: (type: string) => Promise<string | null>;
}

const ChatInput: Component<ChatInputProps> = (props) => {
  const [input, setInput] = createSignal('');
  const [showMentions, setShowMentions] = createSignal(false);
  const [mentionFilter, setMentionFilter] = createSignal('');
  const [isResolvingMention, setIsResolvingMention] = createSignal(false);

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
    const content = input().trim();
    if (content && !props.isStreaming) {
      props.onSend(content);
      setInput('');
    }
  };

  return (
    <div class="chat-input-container">
      <div class="chat-input-wrapper">
        <Show when={showMentions() && filteredSources().length > 0}>
          <div class="mention-dropdown">
            {(() => {
              const sources = filteredSources();
              const actions = sources.filter((s) => s.kind === 'action');
              const contexts = sources.filter((s) => s.kind === 'context');
              return (
                <>
                  <For each={actions}>
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
                  <Show when={actions.length > 0 && contexts.length > 0}>
                    <div class="mention-group-separator" />
                  </Show>
                  <For each={contexts}>
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
                </>
              );
            })()}
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
