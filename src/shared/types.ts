// ---- OpenRouter API types ----

export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
  top_provider?: {
    max_completion_tokens?: number;
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: ToolDefinition[];
}

export interface ChatResponseChunk {
  id: string;
  choices: Array<{
    delta: {
      content?: string;
      role?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ChatResponse {
  id: string;
  choices: Array<{
    message: ChatMessage & { tool_calls?: ToolCall[] };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ---- Webview ↔ Extension message protocol ----

export type ExtensionMessage =
  | { type: 'streamChunk'; content: string }
  | { type: 'streamEnd'; usage?: ChatResponse['usage'] }
  | { type: 'streamError'; error: string }
  | { type: 'modelsLoaded'; models: OpenRouterModel[] }
  | { type: 'modelChanged'; modelId: string }
  | { type: 'contextUpdate'; context: CodeContext }
  | { type: 'conversationList'; conversations: ConversationSummary[] }
  | { type: 'conversationLoaded'; conversation: Conversation }
  | { type: 'conversationSaved'; id: string; title: string }
  | { type: 'conversationTitled'; id: string; title: string }
  | { type: 'triggerSend'; content: string; newChat: boolean }
  | { type: 'showDiff'; lines: DiffLine[]; filename: string; fileUri: string }
  | { type: 'toolApprovalRequest'; requestId: string; toolName: string; args: Record<string, unknown>; diff?: DiffLine[] }
  | { type: 'terminalOutput'; content: string | null }
  | { type: 'skillsLoaded'; skills: SkillSummary[] }
  | { type: 'skillContent'; name: string; content: string | null }
  | { type: 'insertSkillChip'; name: string; content: string }
  | { type: 'mcpStatus'; servers: Record<string, 'connected' | 'error'> }
  | { type: 'autonomousModeChanged'; enabled: boolean }
  | { type: 'worktreeStatus'; status: 'idle' | 'creating' | 'active' | 'finishing'; branch?: string }
  | { type: 'usageUpdate'; lastMessageCost: number; lastMessageTokens: number; sessionCost: number; creditsUsed: number; creditsLimit: number | null }
  | { type: 'noCredits' };

export type WebviewMessage =
  | { type: 'sendMessage'; content: string; images?: string[]; model: string }
  | { type: 'cancelRequest' }
  | { type: 'getModels' }
  | { type: 'setModel'; modelId: string }
  | { type: 'newChat' }
  | { type: 'ready' }
  | { type: 'listConversations' }
  | { type: 'loadConversation'; id: string }
  | { type: 'deleteConversation'; id: string }
  | { type: 'exportConversation'; id: string; format: 'json' | 'markdown' }
  | { type: 'applyToFile'; code: string; language: string; filename?: string }
  | { type: 'confirmApply'; fileUri: string }
  | { type: 'toolApprovalResponse'; requestId: string; approved: boolean }
  | { type: 'getTerminalOutput' }
  | { type: 'getSkillContent'; name: string }
  | { type: 'setAutonomousMode'; enabled: boolean }
  | { type: 'startWorktree' }
  | { type: 'openExternal'; url: string };

// ---- Diff types ----

export interface DiffLine {
  type: 'context' | 'added' | 'removed';
  content: string;
}

// ---- Code context ----

export interface CodeContext {
  activeFile?: {
    uri: string;
    languageId: string;
    content: string;
    cursorLine?: number;
    cursorCharacter?: number;
  };
  selection?: {
    text: string;
    startLine: number;
    endLine: number;
  };
  openEditors?: Array<{
    uri: string;
    languageId: string;
  }>;
  diagnostics?: Array<{
    message: string;
    severity: string;
    range: { startLine: number; endLine: number };
  }>;
  codeActions?: string[];
}

// ---- Conversations ----

export interface Conversation {
  id: string;
  title: string;
  model: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  model: string;
  messageCount: number;
  updatedAt: string;
}

export interface SkillSummary {
  name: string;
  description: string;
}

export interface WorktreeDiff {
  branch: string;
  worktreePath: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
}
