import type { ChatRequest, ChatResponseChunk } from '../shared/types';

export type LLMErrorCode = 'auth' | 'rate_limit' | 'quota' | 'unavailable' | 'bad_request' | 'moderation' | 'timeout';

export class LLMError extends Error {
  constructor(
    public readonly code: LLMErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

export interface ProviderModel {
  id: string;
  name: string;
  contextLength: number;
  pricing: { prompt: string; completion: string };
  topProvider?: { maxCompletionTokens?: number };
}

export interface ILLMProvider {
  readonly id: string;
  chatStream(request: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatResponseChunk, void, unknown>;
  listModels(): Promise<ProviderModel[]>;
  getAccountBalance?(): Promise<{ usage: number; limit: number | null }>;
}
