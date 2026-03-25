import { describe, it, expect } from 'vitest';
import {
  toAnthropicTools,
  toAnthropicMessages,
  fromAnthropicChunk,
} from './anthropic-provider';

describe('toAnthropicTools', () => {
  it('converts OpenAI tool format to Anthropic format', () => {
    const tools = [{
      type: 'function' as const,
      function: {
        name: 'read_file',
        description: 'Read a file',
        parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      }
    }];

    const result = toAnthropicTools(tools);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('read_file');
    expect(result[0].description).toBe('Read a file');
    expect(result[0].input_schema).toEqual(tools[0].function.parameters);
    expect((result[0] as any).type).toBeUndefined();
    expect((result[0] as any).function).toBeUndefined();
  });
});

describe('toAnthropicMessages', () => {
  it('passes through user and assistant text messages', () => {
    const messages = [
      { role: 'user' as const, content: 'Hello' },
      { role: 'assistant' as const, content: 'Hi there' },
    ];
    const result = toAnthropicMessages(messages);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ role: 'user', content: 'Hello' });
  });

  it('converts tool result messages to Anthropic tool_result blocks', () => {
    const messages = [{
      role: 'tool' as const,
      tool_call_id: 'call_abc',
      content: '{"result": "file contents"}',
    }];
    // Tool results must be embedded in a user message in Anthropic format
    const result = toAnthropicMessages(messages);
    expect(result[0].role).toBe('user');
    const content = result[0].content as any[];
    expect(content[0].type).toBe('tool_result');
    expect(content[0].tool_use_id).toBe('call_abc');
    expect(content[0].content).toBe('{"result": "file contents"}');
  });

  it('converts assistant tool_calls to tool_use content blocks', () => {
    const messages = [{
      role: 'assistant' as const,
      content: '',
      tool_calls: [{
        id: 'call_abc',
        type: 'function' as const,
        function: { name: 'read_file', arguments: '{"path": "/foo.ts"}' },
      }],
    }];
    const result = toAnthropicMessages(messages);
    expect(result[0].role).toBe('assistant');
    const content = result[0].content as any[];
    expect(content[0].type).toBe('tool_use');
    expect(content[0].id).toBe('call_abc');
    expect(content[0].name).toBe('read_file');
    expect(content[0].input).toEqual({ path: '/foo.ts' });
  });
});

describe('fromAnthropicChunk', () => {
  it('converts text delta to ChatResponseChunk', () => {
    const event = { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } };
    const chunk = fromAnthropicChunk(event, 'msg_1', null);
    expect(chunk?.choices[0].delta.content).toBe('Hello');
  });

  it('converts tool_use stop to finish_reason tool_calls', () => {
    const event = { type: 'message_delta', delta: { stop_reason: 'tool_use' } };
    const chunk = fromAnthropicChunk(event, 'msg_1', null);
    expect(chunk?.choices[0].finish_reason).toBe('tool_calls');
  });

  it('converts end_turn stop to finish_reason stop', () => {
    const event = { type: 'message_delta', delta: { stop_reason: 'end_turn' } };
    const chunk = fromAnthropicChunk(event, 'msg_1', null);
    expect(chunk?.choices[0].finish_reason).toBe('stop');
  });
});
