import { Component, For, Show } from 'solid-js';
import type { ConversationSummary } from '../stores/chat';

interface ConversationListProps {
  conversations: ConversationSummary[];
  currentId: string;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string, format: 'json' | 'markdown') => void;
}

const ConversationList: Component<ConversationListProps> = (props) => {
  return (
    <div class="conversation-list">
      <div class="conversation-list-header">Conversations</div>
      <Show when={props.conversations.length > 0} fallback={
        <div class="conversation-list-empty">No saved conversations</div>
      }>
        <For each={props.conversations}>
          {(conv) => (
            <div class={`conversation-item ${conv.id === props.currentId ? 'active' : ''}`}>
              <button class="conversation-item-main" onClick={() => props.onLoad(conv.id)}>
                <div class="conversation-title">{conv.title}</div>
                <div class="conversation-meta">
                  {conv.messageCount} msgs · {new Date(conv.updatedAt).toLocaleDateString()}
                </div>
              </button>
              <div class="conversation-actions">
                <button onClick={() => props.onExport(conv.id, 'markdown')} title="Export Markdown">MD</button>
                <button onClick={() => props.onExport(conv.id, 'json')} title="Export JSON">JS</button>
                <button onClick={() => props.onDelete(conv.id)} title="Delete" class="delete-btn">X</button>
              </div>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
};

export default ConversationList;
