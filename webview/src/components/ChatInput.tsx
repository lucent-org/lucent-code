import { Component, createSignal, Show } from 'solid-js';

interface ChatInputProps {
  onSend: (content: string) => void;
  onCancel: () => void;
  isStreaming: boolean;
}

const ChatInput: Component<ChatInputProps> = (props) => {
  const [input, setInput] = createSignal('');

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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
      <textarea
        class="chat-input"
        value={input()}
        onInput={(e) => setInput(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask about your code..."
        rows={3}
        disabled={props.isStreaming}
      />
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
