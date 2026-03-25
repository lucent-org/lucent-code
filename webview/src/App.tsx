import { Component, For, Show, createEffect, onMount } from 'solid-js';
import { chatStore } from './stores/chat';
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';
import ChatTabs from './components/ChatTabs';
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
          chatStore.handleStreamEnd(message.cancelled);
          break;
        case 'streamError':
          chatStore.handleStreamError(message.error);
          break;
        case 'modelsLoaded':
          chatStore.handleModelsLoaded(message.models);
          break;
        case 'modelChanged':
          chatStore.receiveModelChange(message.modelId, message.providerName);
          break;
        case 'conversationList':
          chatStore.handleConversationList(message.conversations);
          break;
        case 'conversationLoaded':
          chatStore.handleConversationLoaded(message.conversation);
          break;
        case 'conversationSaved':
          chatStore.handleConversationSaved(message.id, message.title);
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
          chatStore.handleToolApprovalRequest(msg.requestId, msg.toolName, msg.args, msg.diff, msg.currentModel);
          break;
        }
        case 'skillsLoaded':
          chatStore.handleSkillsLoaded(message.skills);
          break;
        case 'activeSkillsChanged':
          chatStore.handleActiveSkillsChanged(message.skills);
          break;
        case 'insertSkillChip':
          chatStore.setPendingSkillChip({ name: message.name, content: message.content });
          break;
        case 'autonomousModeChanged':
          chatStore.setAutonomousModeFromMessage(message.enabled);
          break;
        case 'worktreeStatus':
          chatStore.handleWorktreeStatus(message.status);
          break;
        case 'usageUpdate':
          chatStore.handleUsageUpdate(message.lastMessageCost, message.lastMessageTokens);
          break;
        case 'noCredits':
          chatStore.handleNoCredits();
          break;
        case 'conversationCompacted':
          chatStore.handleConversationCompacted(message.summary);
          break;
        case 'fileList':
          chatStore.handleFileList(message.files);
          break;
        case 'fileAttachment':
          if (message.error) {
            chatStore.handlePendingFileAttachmentError({ relativePath: message.relativePath, error: message.error });
          } else {
            chatStore.handlePendingFileAttachment({ name: message.name, relativePath: message.relativePath, content: message.content });
          }
          break;
      }
    });

    vscode.postMessage({ type: 'ready' });
    vscode.postMessage({ type: 'listConversations' });

    window.addEventListener('tool-approval', (e: Event) => {
      const { requestId, approved, scope } = (e as CustomEvent).detail;
      chatStore.resolveToolApproval(requestId, approved, scope);
    });
  });

  createEffect(() => {
    chatStore.messages(); // subscribe to signal — fires on new messages and streaming chunks
    requestAnimationFrame(() => {
      messagesEndRef?.scrollIntoView({ behavior: 'smooth' });
    });
  });

  const handleSend = (content: string, images: string[] = [], skills: Array<{ name: string; content: string }> = []) => {
    chatStore.sendMessage(content, images, skills);
  };

  const handleResolveMention = (type: string): Promise<string | null> => {
    switch (type) {
      case 'fix':     return Promise.resolve('Fix the following code:');
      case 'explain': return Promise.resolve('Explain the following code:');
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
        <div class="toolbar-brand">
          <svg class="toolbar-brand__mark" aria-hidden="true" width="14" height="14" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="toolbar-beam" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%"   stop-color="#6366F1"/>
                <stop offset="50%"  stop-color="#8B5CF6"/>
                <stop offset="100%" stop-color="#22D3EE"/>
              </linearGradient>
            </defs>
            <line x1="40" y1="100" x2="88" y2="28" stroke="url(#toolbar-beam)" stroke-width="14" stroke-linecap="round"/>
          </svg>
          <span class="toolbar-brand__name">Lucent Code</span>
        </div>
        <ChatTabs
          recentIds={chatStore.recentConversationIds()}
          conversations={chatStore.conversations()}
          currentId={chatStore.currentConversationId()}
          onSelect={chatStore.loadConversation}
          onClose={chatStore.removeFromRecents}
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
          title={chatStore.autonomousMode() ? 'Autonomous mode on — click to disable' : 'Autonomous mode off — click to enable'}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <Show when={chatStore.autonomousMode()} fallback={
              <circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.5"/>
            }>
              <circle cx="8" cy="8" r="5.5" fill="currentColor"/>
            </Show>
          </svg>
        </button>
        <Show when={chatStore.activeSkillNames().length > 0}>
          <div class="active-skill-badge" title={`Active skill: ${chatStore.activeSkillNames().join(', ')}`}>
            ⚡ {chatStore.activeSkillNames().join(', ')}
            <button
              class="active-skill-badge__dismiss"
              onClick={() => { chatStore.handleActiveSkillsChanged([]); vscode.postMessage({ type: 'clearActiveSkills' }); }}
              title="Deactivate skill"
            >×</button>
          </div>
        </Show>
        <Show when={chatStore.worktreeStatus() !== 'idle'}>
          <button
            class={`worktree-badge worktree-badge--${chatStore.worktreeStatus()}`}
            title={`Worktree ${chatStore.worktreeStatus()}`}
            onClick={() => vscode.postMessage({ type: 'startWorktree' })}
          >
            ⎇
          </button>
        </Show>
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
            <svg class="empty-state__logo" aria-hidden="true" width="56" height="56" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="empty-beam" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%"   stop-color="#6366F1"/>
                  <stop offset="50%"  stop-color="#8B5CF6"/>
                  <stop offset="100%" stop-color="#22D3EE"/>
                </linearGradient>
              </defs>
              <line x1="40" y1="100" x2="88" y2="28" stroke="url(#empty-beam)" stroke-width="14" stroke-linecap="round"/>
            </svg>
            <div class="empty-state-title">Lucent Code</div>
            <div class="empty-state-tagline">Write code in a new light.</div>
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

      <Show when={chatStore.noCredits()}>
        <div class="no-credits-banner">
          <span>⚠ Insufficient credits — your account has no remaining balance.</span>
          <a
            href="https://openrouter.ai/settings/credits"
            onClick={(e) => { e.preventDefault(); vscode.postMessage({ type: 'openExternal', url: 'https://openrouter.ai/settings/credits' }); }}
          >
            Buy credits ↗
          </a>
        </div>
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
        models={chatStore.models()}
        selectedModel={chatStore.selectedModel()}
        selectedModelProvider={chatStore.selectedModelProvider()}
        onSelectModel={chatStore.selectModel}
        messages={chatStore.messages()}
        noCredits={chatStore.noCredits()}
        fileList={chatStore.fileList()}
        pendingFileAttachment={chatStore.pendingFileAttachment()}
        onPendingFileAttachmentConsumed={() => chatStore.setPendingFileAttachment(null)}
        pendingFileAttachmentError={chatStore.pendingFileAttachmentError()}
        onPendingFileAttachmentErrorConsumed={() => chatStore.setPendingFileAttachmentError(null)}
      />
    </div>
  );
};

export default App;
