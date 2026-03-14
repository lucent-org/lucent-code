import { createSignal, createRoot } from 'solid-js';
import { getVsCodeApi } from '../utils/vscode-api';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

export interface Model {
  id: string;
  name: string;
  context_length: number;
  pricing: { prompt: string; completion: string };
}

function createChatStore() {
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const [models, setModels] = createSignal<Model[]>([]);
  const [selectedModel, setSelectedModel] = createSignal<string>('');
  const [isStreaming, setIsStreaming] = createSignal(false);

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

  function handleModelsLoaded(modelList: Model[]) {
    setModels(modelList);
    if (!selectedModel() && modelList.length > 0) {
      setSelectedModel(modelList[0].id);
    }
  }

  function selectModel(modelId: string) {
    setSelectedModel(modelId);
    vscode.postMessage({ type: 'setModel', modelId });
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
  };
}

export const chatStore = createRoot(createChatStore);
