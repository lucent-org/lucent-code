import { createSignal, createRoot } from 'solid-js';
import { getVsCodeApi } from '../utils/vscode-api';
import type { DiffLine } from '../components/DiffView';
import type { ConversationSummary, OpenRouterModel, Conversation, ContentPart, ApprovalScope } from '@shared';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool_approval';
  content: string;
  images?: string[];           // base64 data URLs for thumbnail display
  isStreaming?: boolean;
  cost?: number;
  tokens?: number;
  toolApproval?: {
    requestId: string;
    toolName: string;
    args: Record<string, unknown>;
    status: 'pending' | 'approved' | 'denied';
    diff?: DiffLine[];
  };
}

interface DiffState {
  lines: DiffLine[];
  filename: string;
  fileUri: string;
}

const MAX_RECENTS = 5;

function createChatStore() {
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const [models, setModels] = createSignal<OpenRouterModel[]>([]);
  const [selectedModel, setSelectedModel] = createSignal<string>(
    (() => {
      const saved = getVsCodeApi().getState() as { selectedModel?: string } | undefined;
      return saved?.selectedModel ?? '';
    })()
  );
  const [isStreaming, setIsStreaming] = createSignal(false);
  const [conversations, setConversations] = createSignal<ConversationSummary[]>([]);
  const [currentConversationId, setCurrentConversationId] = createSignal<string>('');
  const [showConversationList, setShowConversationList] = createSignal(false);
  const [diffState, setDiffState] = createSignal<DiffState | null>(null);
  const [availableSkills, setAvailableSkills] = createSignal<{ name: string; description: string }[]>([]);
  const [pendingSkillChip, setPendingSkillChip] = createSignal<{ name: string; content: string } | null>(null);
  const [autonomousMode, setAutonomousModeSignal] = createSignal(false);
  const [worktreeStatus, setWorktreeStatus] = createSignal<'idle' | 'creating' | 'active' | 'finishing'>('idle');
  const [noCredits, setNoCredits] = createSignal(false);

  const [recentConversationIds, setRecentConversationIds] = createSignal<string[]>(
    (() => {
      const saved = getVsCodeApi().getState() as { recentConversationIds?: string[]; lastConversationId?: string } | undefined;
      return saved?.recentConversationIds ?? [];
    })()
  );

  const vscode = getVsCodeApi();

  function pushRecent(id: string) {
    if (!id) return;
    setRecentConversationIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, MAX_RECENTS);
      vscode.setState({ ...(vscode.getState() as object ?? {}), recentConversationIds: next });
      return next;
    });
  }

  function removeFromRecents(id: string) {
    setRecentConversationIds((prev) => {
      const next = prev.filter((x) => x !== id);
      vscode.setState({ ...(vscode.getState() as object ?? {}), recentConversationIds: next });
      return next;
    });
    // If the closed tab was the active conversation, start fresh
    if (currentConversationId() === id) {
      newChat();
    }
  }

  function sendMessage(content: string, images: string[] = []) {
    if (!content.trim() && images.length === 0) return;
    if (isStreaming()) return;

    const model = selectedModel();
    if (!model) return;

    setMessages((prev) => [...prev, { role: 'user', content, images: images.length ? images : undefined }]);
    setMessages((prev) => [...prev, { role: 'assistant', content: '', isStreaming: true }]);
    setIsStreaming(true);

    vscode.postMessage({ type: 'sendMessage', content, images: images.length ? images : undefined, model });
  }

  function cancelRequest() {
    vscode.postMessage({ type: 'cancelRequest' });
  }

  function newChat() {
    setMessages([]);
    setCurrentConversationId('');
    setShowConversationList(false);
    setNoCredits(false);
    vscode.setState({ ...(vscode.getState() as object ?? {}), lastConversationId: undefined });
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
        const content = last.content || '_(No response received. The model may not support this request or ran out of credits.)_';
        updated[updated.length - 1] = { ...last, content, isStreaming: false };
      }
      return updated;
    });
  }

  function handleToolApprovalRequest(
    requestId: string,
    toolName: string,
    args: Record<string, unknown>,
    diff?: DiffLine[]
  ) {
    setMessages((prev) => [
      ...prev,
      {
        role: 'tool_approval' as const,
        content: '',
        toolApproval: { requestId, toolName, args, status: 'pending' as const, diff },
      },
    ]);
  }

  function handleSkillsLoaded(skills: { name: string; description: string }[]): void {
    setAvailableSkills(skills);
  }

  function setAutonomousModeFromMessage(value: boolean) {
    setAutonomousModeSignal(value);
  }

  function handleWorktreeStatus(status: 'idle' | 'creating' | 'active' | 'finishing') {
    setWorktreeStatus(status);
  }

  function handleUsageUpdate(lastMessageCost: number, lastMessageTokens: number) {
    setMessages((prev) => {
      const updated = [...prev];
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].role === 'assistant') {
          updated[i] = { ...updated[i], cost: lastMessageCost, tokens: lastMessageTokens };
          break;
        }
      }
      return updated;
    });
  }

  function handleNoCredits() {
    setNoCredits(true);
  }

  function resolveToolApproval(requestId: string, approved: boolean, scope?: ApprovalScope) {
    setMessages((prev) =>
      prev.map((m) =>
        m.toolApproval?.requestId === requestId
          ? { ...m, toolApproval: { ...m.toolApproval!, status: approved ? 'approved' : 'denied' } as const }
          : m
      )
    );
    vscode.postMessage({ type: 'toolApprovalResponse', requestId, approved, scope });
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
    const saved = (vscode.getState() as { selectedModel?: string } | undefined)?.selectedModel;
    if (saved && modelList.some((m) => m.id === saved)) {
      setSelectedModel(saved);
    } else if (!selectedModel() && modelList.length > 0) {
      setSelectedModel(modelList[0].id);
    }
  }

  function selectModel(modelId: string) {
    setSelectedModel(modelId);
    vscode.setState({ ...(vscode.getState() as object ?? {}), selectedModel: modelId });
    vscode.postMessage({ type: 'setModel', modelId });
  }

  function handleConversationList(list: ConversationSummary[]) {
    setConversations(list);
    // Restore last active conversation on reload
    const saved = vscode.getState() as { lastConversationId?: string } | undefined;
    const lastId = saved?.lastConversationId;
    if (lastId && list.some((c) => c.id === lastId) && !currentConversationId()) {
      vscode.postMessage({ type: 'loadConversation', id: lastId });
    }
  }

  function handleConversationLoaded(conversation: Conversation) {
    setCurrentConversationId(conversation.id);
    pushRecent(conversation.id);
    vscode.setState({ ...(vscode.getState() as object ?? {}), lastConversationId: conversation.id });
    setMessages(conversation.messages
      .filter((m): m is { role: 'user' | 'assistant'; content: string | ContentPart[]; tool_calls?: unknown; tool_call_id?: string } =>
        m.role === 'user' || m.role === 'assistant')
      .map((m) => {
        if (typeof m.content === 'string') {
          return { role: m.role, content: m.content };
        }
        const text = m.content
          .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
          .map((p) => p.text)
          .join('');
        const images = m.content
          .filter((p): p is { type: 'image_url'; image_url: { url: string } } => p.type === 'image_url')
          .map((p) => p.image_url.url);
        return { role: m.role, content: text, images: images.length ? images : undefined };
      }));
    setShowConversationList(false);
  }

  function handleConversationSaved(id: string, title: string) {
    setCurrentConversationId(id);
    pushRecent(id);
    vscode.setState({ ...(vscode.getState() as object ?? {}), lastConversationId: id });
    // Keep conversations list in sync so the tab renders immediately
    setConversations((prev) => {
      if (prev.some((c) => c.id === id)) {
        return prev.map((c) => c.id === id ? { ...c, title } : c);
      }
      return [...prev, {
        id,
        title,
        model: selectedModel(),
        messageCount: messages().filter((m) => m.role !== 'tool_approval').length,
        updatedAt: new Date().toISOString(),
      }];
    });
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
    handleToolApprovalRequest,
    resolveToolApproval,
    availableSkills,
    handleSkillsLoaded,
    pendingSkillChip,
    setPendingSkillChip,
    autonomousMode,
    setAutonomousModeFromMessage,
    worktreeStatus,
    handleWorktreeStatus,
    recentConversationIds,
    removeFromRecents,
    noCredits,
    handleUsageUpdate,
    handleNoCredits,
  };
}

export const chatStore = createRoot(createChatStore);
