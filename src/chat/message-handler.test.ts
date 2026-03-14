import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock vscode module
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn(),
      update: vi.fn(),
    })),
    onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
  },
  ConfigurationTarget: { Global: 1 },
}));

import { MessageHandler } from './message-handler';
import type { OpenRouterClient } from '../core/openrouter-client';
import type { ContextBuilder } from '../core/context-builder';
import type { Settings } from '../core/settings';
import type { ExtensionMessage, CodeContext, OpenRouterModel } from '../shared/types';

// Helper to create an async generator from chunks
async function* createMockStream(chunks: Array<{ choices: Array<{ delta: { content?: string }; finish_reason: string | null }> }>) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

describe('MessageHandler', () => {
  let handler: MessageHandler;
  let mockClient: {
    chatStream: ReturnType<typeof vi.fn>;
    listModels: ReturnType<typeof vi.fn>;
  };
  let mockContextBuilder: {
    buildContext: ReturnType<typeof vi.fn>;
    formatForPrompt: ReturnType<typeof vi.fn>;
    buildEnrichedContext: ReturnType<typeof vi.fn>;
    formatEnrichedPrompt: ReturnType<typeof vi.fn>;
    getCapabilities: ReturnType<typeof vi.fn>;
  };
  let mockSettings: {
    setChatModel: ReturnType<typeof vi.fn>;
    temperature: number;
    maxTokens: number;
  };
  let postMessage: ReturnType<typeof vi.fn>;
  let mockContext: CodeContext;
  let mockModels: OpenRouterModel[];

  beforeEach(() => {
    vi.clearAllMocks();

    mockContext = {
      activeFile: {
        uri: 'file:///test.ts',
        languageId: 'typescript',
        content: 'const x = 1;',
        cursorLine: 0,
        cursorCharacter: 0,
      },
    };

    mockModels = [
      {
        id: 'anthropic/claude-sonnet-4',
        name: 'Claude Sonnet 4',
        context_length: 200000,
        pricing: { prompt: '0.000003', completion: '0.000015' },
      },
    ];

    mockClient = {
      chatStream: vi.fn(),
      listModels: vi.fn().mockResolvedValue(mockModels),
    };

    mockContextBuilder = {
      buildContext: vi.fn().mockReturnValue(mockContext),
      formatForPrompt: vi.fn().mockReturnValue('formatted context'),
      buildEnrichedContext: vi.fn(() => Promise.resolve(mockContext)),
      formatEnrichedPrompt: vi.fn(() => 'formatted context'),
      getCapabilities: vi.fn(() => undefined),
    };

    mockSettings = {
      setChatModel: vi.fn().mockResolvedValue(undefined),
      temperature: 0.7,
      maxTokens: 4096,
    };

    postMessage = vi.fn();

    handler = new MessageHandler(
      mockClient as unknown as OpenRouterClient,
      mockContextBuilder as unknown as ContextBuilder,
      mockSettings as unknown as Settings
    );
  });

  describe('newChat', () => {
    it('should clear conversation history', async () => {
      // First, send a message to build up history
      mockClient.chatStream.mockReturnValue(
        createMockStream([
          { choices: [{ delta: { content: 'Hi' }, finish_reason: null }] },
        ])
      );
      await handler.handleMessage(
        { type: 'sendMessage', content: 'Hello', model: 'test-model' },
        postMessage
      );

      // Clear conversation
      await handler.handleMessage({ type: 'newChat' }, postMessage);

      // Send another message - should only have system + the new user message
      mockClient.chatStream.mockReturnValue(
        createMockStream([
          { choices: [{ delta: { content: 'World' }, finish_reason: null }] },
        ])
      );
      await handler.handleMessage(
        { type: 'sendMessage', content: 'New conversation', model: 'test-model' },
        postMessage
      );

      // The second call should only have system message + 1 user message (no history from first call)
      const secondCallArgs = mockClient.chatStream.mock.calls[1][0];
      // messages: [systemMessage, userMessage]
      expect(secondCallArgs.messages).toHaveLength(2);
      expect(secondCallArgs.messages[0].role).toBe('system');
      expect(secondCallArgs.messages[1].role).toBe('user');
      expect(secondCallArgs.messages[1].content).toBe('New conversation');
    });
  });

  describe('getModels', () => {
    it('should call listModels and post modelsLoaded', async () => {
      await handler.handleMessage({ type: 'getModels' }, postMessage);

      expect(mockClient.listModels).toHaveBeenCalledOnce();
      expect(postMessage).toHaveBeenCalledWith({
        type: 'modelsLoaded',
        models: mockModels,
      });
    });

    it('should post streamError if listModels throws', async () => {
      mockClient.listModels.mockRejectedValue(new Error('Network error'));

      await handler.handleMessage({ type: 'getModels' }, postMessage);

      expect(postMessage).toHaveBeenCalledWith({
        type: 'streamError',
        error: 'Network error',
      });
    });
  });

  describe('setModel', () => {
    it('should call setChatModel and post modelChanged', async () => {
      await handler.handleMessage(
        { type: 'setModel', modelId: 'anthropic/claude-sonnet-4' },
        postMessage
      );

      expect(mockSettings.setChatModel).toHaveBeenCalledWith('anthropic/claude-sonnet-4');
      expect(postMessage).toHaveBeenCalledWith({
        type: 'modelChanged',
        modelId: 'anthropic/claude-sonnet-4',
      });
    });
  });

  describe('ready', () => {
    it('should call getModels and post contextUpdate', async () => {
      await handler.handleMessage({ type: 'ready' }, postMessage);

      expect(mockClient.listModels).toHaveBeenCalledOnce();
      expect(postMessage).toHaveBeenCalledWith({
        type: 'modelsLoaded',
        models: mockModels,
      });
      expect(mockContextBuilder.buildContext).toHaveBeenCalled();
      expect(postMessage).toHaveBeenCalledWith({
        type: 'contextUpdate',
        context: mockContext,
      });
    });
  });

  describe('sendMessage', () => {
    it('should stream chunks and post streamEnd', async () => {
      mockClient.chatStream.mockReturnValue(
        createMockStream([
          { choices: [{ delta: { content: 'Hello' }, finish_reason: null }] },
          { choices: [{ delta: { content: ' world' }, finish_reason: null }] },
          { choices: [{ delta: { content: '!' }, finish_reason: 'stop' }] },
        ])
      );

      await handler.handleMessage(
        { type: 'sendMessage', content: 'Hi', model: 'test-model' },
        postMessage
      );

      expect(mockContextBuilder.buildEnrichedContext).toHaveBeenCalled();
      expect(mockContextBuilder.formatEnrichedPrompt).toHaveBeenCalled();
      expect(mockClient.chatStream).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'test-model',
          temperature: 0.7,
          max_tokens: 4096,
          stream: true,
        }),
        expect.any(AbortSignal)
      );

      // Verify stream chunks were posted
      expect(postMessage).toHaveBeenCalledWith({ type: 'streamChunk', content: 'Hello' });
      expect(postMessage).toHaveBeenCalledWith({ type: 'streamChunk', content: ' world' });
      expect(postMessage).toHaveBeenCalledWith({ type: 'streamChunk', content: '!' });
      expect(postMessage).toHaveBeenCalledWith({ type: 'streamEnd' });
    });

    it('should post streamError on failure', async () => {
      mockClient.chatStream.mockReturnValue(
        (async function* () {
          throw new Error('API rate limit exceeded');
        })()
      );

      await handler.handleMessage(
        { type: 'sendMessage', content: 'Hi', model: 'test-model' },
        postMessage
      );

      expect(postMessage).toHaveBeenCalledWith({
        type: 'streamError',
        error: 'API rate limit exceeded',
      });
    });

    it('should handle chunks with no delta content', async () => {
      mockClient.chatStream.mockReturnValue(
        createMockStream([
          { choices: [{ delta: {}, finish_reason: null }] },
          { choices: [{ delta: { content: 'data' }, finish_reason: null }] },
          { choices: [{ delta: { content: undefined }, finish_reason: 'stop' }] },
        ])
      );

      await handler.handleMessage(
        { type: 'sendMessage', content: 'Hi', model: 'test-model' },
        postMessage
      );

      // Only one streamChunk should be posted (the one with actual content)
      const chunkMessages = postMessage.mock.calls.filter(
        (call: [ExtensionMessage]) => call[0].type === 'streamChunk'
      );
      expect(chunkMessages).toHaveLength(1);
      expect(chunkMessages[0][0]).toEqual({ type: 'streamChunk', content: 'data' });
      expect(postMessage).toHaveBeenCalledWith({ type: 'streamEnd' });
    });
  });

  describe('cancelRequest', () => {
    it('should abort the stream and send streamEnd', async () => {
      // Create a stream that will hang until aborted
      let rejectStream!: (err: Error) => void;
      mockClient.chatStream.mockReturnValue(
        (async function* () {
          yield { choices: [{ delta: { content: 'partial' }, finish_reason: null }] };
          // Wait forever (will be aborted)
          await new Promise<void>((_resolve, reject) => {
            rejectStream = reject;
          });
        })()
      );

      // Start the send in the background
      const sendPromise = handler.handleMessage(
        { type: 'sendMessage', content: 'Hi', model: 'test-model' },
        postMessage
      );

      // Wait a tick for the stream to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Cancel the request
      await handler.handleMessage({ type: 'cancelRequest' }, postMessage);

      // Simulate the abort causing the stream to reject
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      rejectStream(abortError);

      await sendPromise;

      // Should have gotten the partial chunk and then streamEnd (not streamError)
      expect(postMessage).toHaveBeenCalledWith({ type: 'streamChunk', content: 'partial' });
      expect(postMessage).toHaveBeenCalledWith({ type: 'streamEnd' });
      // Should NOT have posted a streamError
      const errorMessages = postMessage.mock.calls.filter(
        (call: [ExtensionMessage]) => call[0].type === 'streamError'
      );
      expect(errorMessages).toHaveLength(0);
    });
  });

  describe('conversation history', () => {
    it('should accumulate messages across multiple sendMessage calls', async () => {
      // First message
      mockClient.chatStream.mockReturnValue(
        createMockStream([
          { choices: [{ delta: { content: 'Response 1' }, finish_reason: 'stop' }] },
        ])
      );
      await handler.handleMessage(
        { type: 'sendMessage', content: 'Question 1', model: 'test-model' },
        postMessage
      );

      // Second message
      mockClient.chatStream.mockReturnValue(
        createMockStream([
          { choices: [{ delta: { content: 'Response 2' }, finish_reason: 'stop' }] },
        ])
      );
      await handler.handleMessage(
        { type: 'sendMessage', content: 'Question 2', model: 'test-model' },
        postMessage
      );

      // Verify the second call includes the full conversation history
      const secondCallArgs = mockClient.chatStream.mock.calls[1][0];
      // messages: [system, user1, assistant1, user2]
      expect(secondCallArgs.messages).toHaveLength(4);
      expect(secondCallArgs.messages[0].role).toBe('system');
      expect(secondCallArgs.messages[1]).toEqual({ role: 'user', content: 'Question 1' });
      expect(secondCallArgs.messages[2]).toEqual({ role: 'assistant', content: 'Response 1' });
      expect(secondCallArgs.messages[3]).toEqual({ role: 'user', content: 'Question 2' });
    });
  });
});
