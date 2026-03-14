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
  role: 'system' | 'user' | 'assistant';
  content: string;
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
    };
    finish_reason: string | null;
  }>;
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
  | { type: 'contextUpdate'; context: CodeContext };

export type WebviewMessage =
  | { type: 'sendMessage'; content: string; model: string }
  | { type: 'cancelRequest' }
  | { type: 'getModels' }
  | { type: 'setModel'; modelId: string }
  | { type: 'newChat' }
  | { type: 'ready' };

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
}
