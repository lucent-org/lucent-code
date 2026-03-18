import { Component, For, Show, createEffect, onMount } from 'solid-js';
import { chatStore } from './stores/chat';
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';
import ModelSelector from './components/ModelSelector';
import ConversationList from './components/ConversationList';
import DiffView from './components/DiffView';
import { getVsCodeApi } from './utils/vscode-api';

const App: Component = () => {
  let messagesEndRef: HTMLDivElement | undefined;
  const vscode = getVsCodeApi();

  onMount(() => {

    window.addEventListener('message', (event) => {
      const message = event.data;
      switch (message.type) {
        case 'streamChunk':
          chatStore.handleStreamChunk(message.content);
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
          chatStore.cancelRequest();
          chatStore.handleStreamEnd(); // reset streaming state so sendMessage proceeds
          chatStore.sendMessage(message.content);
          break;
        case 'showDiff':
          chatStore.setDiffState({
            lines: message.lines,
            filename: message.filename,
            fileUri: message.fileUri,
          });
          break;
        case 'toolApprovalRequest': {
          const msg = message as any;
          chatStore.handleToolApprovalRequest(msg.requestId, msg.toolName, msg.args, msg.diff);
          break;
        }
        case 'skillsLoaded':
          chatStore.handleSkillsLoaded(message.skills);
          break;
        case 'insertSkillChip':
          chatStore.setPendingSkillChip({ name: message.name, content: message.content });
          break;
        case 'autonomousModeChanged':
          chatStore.setAutonomousModeFromMessage(message.enabled);
          break;
      }
    });

    vscode.postMessage({ type: 'ready' });

    window.addEventListener('tool-approval', (e: Event) => {
      const { requestId, approved } = (e as CustomEvent).detail;
      chatStore.resolveToolApproval(requestId, approved);
    });
  });

  createEffect(() => {
    chatStore.messages(); // subscribe to signal — fires on new messages and streaming chunks
    requestAnimationFrame(() => {
      messagesEndRef?.scrollIntoView({ behavior: 'smooth' });
    });
  });

  const handleSend = (content: string, images: string[] = []) => {
    chatStore.sendMessage(content, images);
  };

  const handleResolveMention = (type: string): Promise<string | null> => {
    switch (type) {
      case 'fix':     return Promise.resolve('Fix the following code:');
      case 'explain': return Promise.resolve('Explain the following code:');
      case 'test':    return Promise.resolve('Write tests for the following code:');
    }
    // Context mentions require extension-host roundtrip
    const requestType = `get${type.charAt(0).toUpperCase() + type.slice(1)}Output` as 'getTerminalOutput';
    const responseType = `${type}Output` as 'terminalOutput';
    return new Promise((resolve) => {
      const handler = (event: MessageEvent) => {
        const msg = event.data as { type: string; content?: string | null };
        if (msg.type === responseType) {
          window.removeEventListener('message', handler);
          resolve(msg.content ?? null);
        }
      };
      window.addEventListener('message', handler);
      vscode.postMessage({ type: requestType });
      setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve(null);
      }, 3000);
    });
  };

  const handleResolveSkill = (name: string): Promise<string | null> => {
    return new Promise((resolve) => {
      const handler = (event: MessageEvent) => {
        const msg = event.data as { type: string; name?: string; content?: string | null };
        if (msg.type === 'skillContent' && msg.name === name) {
          window.removeEventListener('message', handler);
          resolve(msg.content ?? null);
        }
      };
      window.addEventListener('message', handler);
      vscode.postMessage({ type: 'getSkillContent', name });
      setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve(null);
      }, 5000);
    });
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
        <button
          class={`autonomous-button ${chatStore.autonomousMode() ? 'active' : ''}`}
          onClick={() => vscode.postMessage({ type: 'setAutonomousMode', enabled: !chatStore.autonomousMode() })}
          title="Autonomous mode — all tools run without approval"
        >
          ⚡
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
            <div class="empty-state-title">Lucent Code</div>
            <div class="empty-state-hint">
              <Show when={chatStore.models().length > 0} fallback={
                <span>Set your API key to get started.<br/>Use the command palette: <code>Lucent Code: Set API Key</code></span>
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

      <Show when={chatStore.diffState()}>
        {(state) => (
          <DiffView
            lines={state().lines}
            filename={state().filename}
            fileUri={state().fileUri}
            onDismiss={() => chatStore.setDiffState(null)}
          />
        )}
      </Show>

      <ChatInput
        onSend={handleSend}
        onCancel={chatStore.cancelRequest}
        isStreaming={chatStore.isStreaming()}
        onResolveMention={handleResolveMention}
        skills={chatStore.availableSkills()}
        onResolveSkill={handleResolveSkill}
        pendingChip={chatStore.pendingSkillChip()}
        onPendingChipConsumed={() => chatStore.setPendingSkillChip(null)}
      />
    </div>
  );
};

export default App;
