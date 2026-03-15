import { Component, For, Show, onMount } from 'solid-js';
import { chatStore } from './stores/chat';
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';
import ModelSelector from './components/ModelSelector';
import ConversationList from './components/ConversationList';
import { getVsCodeApi } from './utils/vscode-api';

const App: Component = () => {
  let messagesEndRef: HTMLDivElement | undefined;

  onMount(() => {
    const vscode = getVsCodeApi();

    window.addEventListener('message', (event) => {
      const message = event.data;
      switch (message.type) {
        case 'streamChunk':
          chatStore.handleStreamChunk(message.content);
          scrollToBottom();
          break;
        case 'streamEnd':
          chatStore.handleStreamEnd();
          break;
        case 'streamError':
          chatStore.handleStreamError(message.error);
          break;
        case 'modelsLoaded':
          chatStore.handleModelsLoaded(message.models);
          break;
        case 'modelChanged':
          chatStore.selectModel(message.modelId);
          break;
        case 'conversationList':
          chatStore.handleConversationList(message.conversations);
          break;
        case 'conversationLoaded':
          chatStore.handleConversationLoaded(message.conversation);
          scrollToBottom();
          break;
        case 'conversationSaved':
          chatStore.handleConversationSaved(message.id);
          break;
        case 'conversationTitled':
          chatStore.handleConversationTitled(message.id, message.title);
          break;
        case 'triggerSend':
          if (message.newChat) {
            chatStore.newChat();
          }
          chatStore.sendMessage(message.content);
          scrollToBottom();
          break;
      }
    });

    vscode.postMessage({ type: 'ready' });
  });

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      messagesEndRef?.scrollIntoView({ behavior: 'smooth' });
    });
  };

  const handleSend = (content: string) => {
    chatStore.sendMessage(content);
    scrollToBottom();
  };

  return (
    <div class="app">
      <div class="toolbar">
        <ModelSelector
          models={chatStore.models()}
          selectedModel={chatStore.selectedModel()}
          onSelect={chatStore.selectModel}
        />
        <button
          class={`history-button ${chatStore.showConversationList() ? 'active' : ''}`}
          onClick={chatStore.toggleConversationList}
          title="Conversation History"
        >
          ☰
        </button>
        <button class="new-chat-button" onClick={chatStore.newChat} title="New Chat">
          +
        </button>
      </div>

      <Show when={chatStore.showConversationList()}>
        <ConversationList
          conversations={chatStore.conversations()}
          currentId={chatStore.currentConversationId()}
          onLoad={chatStore.loadConversation}
          onDelete={chatStore.deleteConversation}
          onExport={chatStore.exportConversation}
        />
      </Show>

      <div class="messages">
        <Show when={chatStore.messages().length > 0} fallback={
          <div class="empty-state">
            <div class="empty-state-icon">&#x1F4AC;</div>
            <div class="empty-state-title">OpenRouter Chat</div>
            <div class="empty-state-hint">
              <Show when={chatStore.models().length > 0} fallback={
                <span>Set your API key to get started.<br/>Use the command palette: <code>OpenRouter Chat: Set API Key</code></span>
              }>
                <span>Ask a question about your code, or try one of these:</span>
                <div class="empty-state-suggestions">
                  <button class="suggestion" onClick={() => handleSend('Explain this code')}>Explain this code</button>
                  <button class="suggestion" onClick={() => handleSend('Find bugs in the selected code')}>Find bugs</button>
                  <button class="suggestion" onClick={() => handleSend('Suggest improvements')}>Suggest improvements</button>
                </div>
              </Show>
            </div>
          </div>
        }>
          <For each={chatStore.messages()}>
            {(message) => <ChatMessage message={message} />}
          </For>
        </Show>
        <div ref={messagesEndRef} />
      </div>

      <ChatInput
        onSend={handleSend}
        onCancel={chatStore.cancelRequest}
        isStreaming={chatStore.isStreaming()}
      />
    </div>
  );
};

export default App;
