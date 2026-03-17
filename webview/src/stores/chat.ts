import { createSignal, createRoot } from 'solid-js';
import { getVsCodeApi } from '../utils/vscode-api';
import type { DiffLine } from '../components/DiffView';
import type { ConversationSummary, OpenRouterModel, Conversation } from '@shared';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

interface DiffState {
  lines: DiffLine[];
  filename: string;
  fileUri: string;
}

function createChatStore() {
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const [models, setModels] = createSignal<OpenRouterModel[]>([]);
  const [selectedModel, setSelectedModel] = createSignal<string>('');
  const [isStreaming, setIsStreaming] = createSignal(false);
  const [conversations, setConversations] = createSignal<ConversationSummary[]>([]);
  const [currentConversationId, setCurrentConversationId] = createSignal<string>('');
  const [showConversationList, setShowConversationList] = createSignal(false);
  const [diffState, setDiffState] = createSignal<DiffState | null>(null);

  const vscode = getVsCodeApi();

  function sendMessage(content: string) {
    if (!content.trim() || isStreaming()) return;

    const model = selectedModel();
    if (!model) return;

    setMessages((prev) => [...prev, { role: 'user', content }]);
    setMessages((prev) => [...prev, { role: 'assistant', content: '', isStreaming: true }]);
    setIsStreaming(true);

    vscode.postMessage({ type: 'sendMessage', content, model });
  }

  function cancelRequest() {
    vscode.postMessage({ type: 'cancelRequest' });
  }

  function newChat() {
    setMessages([]);
    setCurrentConversationId('');
    setShowConversationList(false);
    vscode.postMessage({ type: 'newChat' });
  }

  function handleStreamChunk(content: string) {
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last.role === 'assistant') {
        updated[updated.length - 1] = { ...last, content: last.content + content };
      }
      return updated;
    });
  }

  function handleStreamEnd() {
    setIsStreaming(false);
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last.role === 'assistant') {
        updated[updated.length - 1] = { ...last, isStreaming: false };
      }
      return updated;
    });
  }

  function handleStreamError(error: string) {
    setIsStreaming(false);
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last.role === 'assistant') {
        updated[updated.length - 1] = {
          ...last,
          content: `Error: ${error}`,
          isStreaming: false,
        };
      }
      return updated;
    });
  }

  function handleModelsLoaded(modelList: OpenRouterModel[]) {
    setModels(modelList);
    if (!selectedModel() && modelList.length > 0) {
      setSelectedModel(modelList[0].id);
    }
  }

  function selectModel(modelId: string) {
    setSelectedModel(modelId);
    vscode.postMessage({ type: 'setModel', modelId });
  }

  function handleConversationList(list: ConversationSummary[]) {
    setConversations(list);
  }

  function handleConversationLoaded(conversation: Conversation) {
    setCurrentConversationId(conversation.id);
    setMessages(conversation.messages
      .filter((m): m is { role: 'user' | 'assistant'; content: string; tool_calls?: unknown; tool_call_id?: string } =>
        m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content })));
    setShowConversationList(false);
  }

  function handleConversationSaved(id: string) {
    setCurrentConversationId(id);
  }

  function handleConversationTitled(id: string, title: string) {
    setConversations((prev) => prev.map((c) => c.id === id ? { ...c, title } : c));
  }

  function loadConversation(id: string) {
    vscode.postMessage({ type: 'loadConversation', id });
  }

  function deleteConversation(id: string) {
    vscode.postMessage({ type: 'deleteConversation', id });
  }

  function exportConversation(id: string, format: 'json' | 'markdown') {
    vscode.postMessage({ type: 'exportConversation', id, format });
  }

  function toggleConversationList() {
    if (!showConversationList()) {
      vscode.postMessage({ type: 'listConversations' });
    }
    setShowConversationList(!showConversationList());
  }

  return {
    messages,
    models,
    selectedModel,
    isStreaming,
    sendMessage,
    cancelRequest,
    newChat,
    selectModel,
    handleStreamChunk,
    handleStreamEnd,
    handleStreamError,
    handleModelsLoaded,
    conversations,
    currentConversationId,
    showConversationList,
    handleConversationList,
    handleConversationLoaded,
    handleConversationSaved,
    handleConversationTitled,
    loadConversation,
    deleteConversation,
    exportConversation,
    toggleConversationList,
    diffState,
    setDiffState,
  };
}

export const chatStore = createRoot(createChatStore);
