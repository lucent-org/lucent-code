import { Component, For, onMount } from 'solid-js';
import { chatStore } from './stores/chat';
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';
import ModelSelector from './components/ModelSelector';
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
        <button class="new-chat-button" onClick={chatStore.newChat} title="New Chat">
          +
        </button>
      </div>

      <div class="messages">
        <For each={chatStore.messages()}>
          {(message) => <ChatMessage message={message} />}
        </For>
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
