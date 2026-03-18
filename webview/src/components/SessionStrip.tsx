import { Component, createSignal, createMemo, onMount, onCleanup, For, Show } from 'solid-js';
import type { ConversationSummary } from '@shared';

interface SessionStripProps {
  recentIds: string[];
  conversations: ConversationSummary[];
  currentId: string;
  onSelect: (id: string) => void;
}

const SessionStrip: Component<SessionStripProps> = (props) => {
  const [wide, setWide] = createSignal(true);
  let wrapperRef: HTMLDivElement | undefined;
  let observer: ResizeObserver | undefined;

  onMount(() => {
    observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setWide(width >= 400);
    });
    if (wrapperRef) {
      observer.observe(wrapperRef);
    }
  });

  onCleanup(() => observer?.disconnect());

  // Build ordered list of ConversationSummary for the recents, skipping deleted ones
  const recentConversations = createMemo(() =>
    props.recentIds
      .map((id) => props.conversations.find((c) => c.id === id))
      .filter((c): c is ConversationSummary => c !== undefined)
  );

  return (
    <div class="session-strip" ref={wrapperRef}>
      <Show when={wide()} fallback={
        <select
          class="session-strip-select"
          value={props.currentId}
          onChange={(e) => props.onSelect(e.currentTarget.value)}
        >
          <For each={recentConversations()}>
            {(conv) => (
              <option value={conv.id}>{conv.title}</option>
            )}
          </For>
        </select>
      }>
        <div class="session-strip-tabs">
          <For each={recentConversations()}>
            {(conv) => (
              <button
                class={`session-tab ${conv.id === props.currentId ? 'session-tab--active' : ''}`}
                onClick={() => props.onSelect(conv.id)}
                title={conv.title}
              >
                {conv.title}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default SessionStrip;
