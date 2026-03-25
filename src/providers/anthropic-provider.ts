import type { ChatMessage, ToolDefinition, ChatResponseChunk, ChatRequest } from '../shared/types';
import Anthropic from '@anthropic-ai/sdk';
import type { ILLMProvider, ProviderModel } from './llm-provider';
import { LLMError } from './llm-provider';

// OpenAI ToolDefinition → Anthropic tool format
export function toAnthropicTools(tools: ToolDefinition[]) {
  return tools.map(t => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
}

// OpenAI ChatMessage[] → Anthropic message[] (excludes system — handled separately by the caller)
export function toAnthropicMessages(messages: ChatMessage[]): Array<{ role: 'user' | 'assistant'; content: unknown }> {
  const result: Array<{ role: 'user' | 'assistant'; content: unknown }> = [];

  for (const msg of messages) {
    if (msg.role === 'system') continue;

    if (msg.role === 'tool') {
      // Tool results → user message with tool_result content block
      result.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: msg.tool_call_id,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        }],
      });
      continue;
    }

    if (msg.role === 'assistant' && msg.tool_calls?.length) {
      // Assistant with tool calls → tool_use content blocks
      const content: unknown[] = [];
      if (msg.content) content.push({ type: 'text', text: typeof msg.content === 'string' ? msg.content : '' });
      for (const tc of msg.tool_calls) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: (() => { try { return JSON.parse(tc.function.arguments || '{}'); } catch { return {}; } })(),
        });
      }
      result.push({ role: 'assistant', content });
      continue;
    }

    result.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
  }

  return result;
}

// Anthropic streaming event → ChatResponseChunk (returns null for events we ignore).
// Pass null for toolUseAccumulator only when the request has no tools — tool streaming events
// will be silently dropped if the accumulator is absent.
export function fromAnthropicChunk(
  event: Record<string, unknown>,
  messageId: string,
  toolUseAccumulator: Map<number, { id: string; name: string; input: string }> | null
): ChatResponseChunk | null {
  const makeChunk = (delta: ChatResponseChunk['choices'][0]['delta'], finishReason: string | null = null): ChatResponseChunk => ({
    id: messageId,
    choices: [{ delta, finish_reason: finishReason }],
  });

  if (event.type === 'content_block_delta') {
    const d = event.delta as Record<string, unknown>;
    if (d.type === 'text_delta') {
      return makeChunk({ content: d.text as string });
    }
    if (d.type === 'input_json_delta' && toolUseAccumulator) {
      const index = event.index as number;
      const acc = toolUseAccumulator.get(index);
      if (acc) acc.input += d.partial_json as string;
      return makeChunk({ tool_calls: [{ index, function: { arguments: d.partial_json as string } }] });
    }
  }

  if (event.type === 'content_block_start') {
    const block = event.content_block as Record<string, unknown>;
    if (block.type === 'tool_use' && toolUseAccumulator) {
      const index = event.index as number;
      toolUseAccumulator.set(index, { id: block.id as string, name: block.name as string, input: '' });
      return makeChunk({ tool_calls: [{ index, id: block.id as string, type: 'function', function: { name: block.name as string, arguments: '' } }] });
    }
  }

  if (event.type === 'message_delta') {
    const d = event.delta as Record<string, unknown>;
    const stopReason = d.stop_reason as string;
    const finishReason = stopReason === 'tool_use' ? 'tool_calls' : stopReason === 'end_turn' ? 'stop' : stopReason;
    return makeChunk({}, finishReason);
  }

  if (event.type === 'message_start') {
    const msg = event.message as Record<string, unknown>;
    const usage = msg.usage as Record<string, number> | undefined;
    if (usage) {
      return {
        id: messageId,
        choices: [{ delta: {}, finish_reason: null }],
        usage: {
          prompt_tokens: usage.input_tokens ?? 0,
          completion_tokens: usage.output_tokens ?? 0,
          total_tokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0)
        }
      };
    }
  }

  return null;
}

// Static model list — Anthropic doesn't have a standard public /models endpoint
const ANTHROPIC_MODELS: ProviderModel[] = [
  { id: 'claude-opus-4-6',           name: 'Claude Opus 4.6',   contextLength: 200000, pricing: { prompt: '0.015',   completion: '0.075'   } },
  { id: 'claude-sonnet-4-6',         name: 'Claude Sonnet 4.6', contextLength: 200000, pricing: { prompt: '0.003',   completion: '0.015'   } },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5',  contextLength: 200000, pricing: { prompt: '0.00025', completion: '0.00125' } },
];

export class AnthropicProvider implements ILLMProvider {
  readonly id = 'anthropic';

  constructor(private readonly getApiKey: () => Promise<string | undefined>) {}

  async listModels(): Promise<ProviderModel[]> {
    return ANTHROPIC_MODELS;
  }

  async *chatStream(request: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatResponseChunk, void, unknown> {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new LLMError('auth', 'No Anthropic API key configured. Set lucentCode.providers.anthropic.apiKey in settings.');

    const client = new Anthropic({ apiKey });

    // Extract system message and format with cache_control for prompt caching
    const systemMsg = request.messages.find(m => m.role === 'system');
    const system = systemMsg ? [{
      type: 'text' as const,
      text: typeof systemMsg.content === 'string' ? systemMsg.content : JSON.stringify(systemMsg.content),
      cache_control: { type: 'ephemeral' as const },
    }] : undefined;

    const nonSystemMessages = request.messages.filter(m => m.role !== 'system');
    const anthropicMessages = toAnthropicMessages(nonSystemMessages);
    const tools = request.tools?.length ? toAnthropicTools(request.tools) : undefined;

    const toolUseAccumulator = new Map<number, { id: string; name: string; input: string }>();

    try {
      const stream = client.messages.stream({
        model: request.model,
        max_tokens: request.max_tokens ?? 4096,
        temperature: request.temperature,
        system,
        messages: anthropicMessages as Anthropic.MessageParam[],
        tools: tools as Anthropic.Tool[] | undefined,
      });

      if (signal) {
        signal.addEventListener('abort', () => stream.abort(), { once: true });
      }

      for await (const event of stream) {
        const chunk = fromAnthropicChunk(event as unknown as Record<string, unknown>, '', toolUseAccumulator);
        if (chunk) yield chunk;
      }
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw new LLMError('auth', err.message);
      if (err instanceof Anthropic.RateLimitError)      throw new LLMError('rate_limit', err.message);
      if (err instanceof Anthropic.APIConnectionError)  throw new LLMError('unavailable', err.message);
      if (err instanceof Anthropic.BadRequestError)     throw new LLMError('bad_request', err.message);
      throw err;
    }
  }
}
