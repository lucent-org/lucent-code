import { Component, For, Show, createMemo } from 'solid-js';
import type { ConversationSummary } from '@shared';

interface ChatTabsProps {
  recentIds: string[];
  conversations: ConversationSummary[];
  currentId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

const ChatTabs: Component<ChatTabsProps> = (props) => {
  const recentConversations = createMemo(() =>
    props.recentIds
      .map((id) => props.conversations.find((c) => c.id === id))
      .filter((c): c is ConversationSummary => c !== undefined)
  );

  const isNewChat = () => !props.currentId;

  return (
    <div class="chat-tabs" role="tablist" aria-label="Open chats">
      <Show when={isNewChat()}>
        <div class="chat-tab chat-tab--active" role="tab" aria-selected={true}>
          <span class="chat-tab__label">New Chat</span>
        </div>
      </Show>
      <For each={recentConversations()}>
        {(conv) => (
          <div
            class={`chat-tab ${conv.id === props.currentId ? 'chat-tab--active' : ''}`}
            role="tab"
            aria-selected={conv.id === props.currentId}
          >
            <button
              class="chat-tab__label"
              onClick={() => props.onSelect(conv.id)}
              title={conv.title}
            >
              {conv.title}
            </button>
            <button
              class="chat-tab__close"
              onClick={(e) => { e.stopPropagation(); props.onClose(conv.id); }}
              title="Close tab"
              aria-label={`Close ${conv.title}`}
            >
              ×
            </button>
          </div>
        )}
      </For>
    </div>
  );
};

export default ChatTabs;
