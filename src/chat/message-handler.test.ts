import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock vscode module
vi.mock('fs', () => ({
  writeFileSync: vi.fn(),
}));

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn(),
      update: vi.fn(),
    })),
    onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
    openTextDocument: vi.fn().mockResolvedValue({
      lineCount: 10,
      uri: { toString: () => 'file:///workspace/src/foo.ts', fsPath: '/workspace/src/foo.ts' },
    }),
    workspaceFolders: [{ uri: { fsPath: '/workspace', toString: () => 'file:///workspace', path: '/workspace' } }],
    applyEdit: vi.fn().mockResolvedValue(true),
    fs: {
      readFile: vi.fn(),
      stat: vi.fn(),
    },
  },
  window: {
    showTextDocument: vi.fn().mockResolvedValue(undefined),
    showErrorMessage: vi.fn().mockResolvedValue(undefined),
    showWarningMessage: vi.fn().mockResolvedValue(undefined),
    showInformationMessage: vi.fn().mockResolvedValue(undefined),
    showOpenDialog: vi.fn(),
  },
  commands: {
    executeCommand: vi.fn(),
  },
  ConfigurationTarget: { Global: 1 },
  WorkspaceEdit: class {
    replace = vi.fn();
    createFile = vi.fn();
    insert = vi.fn();
  },
  Position: class { constructor(public line: number, public character: number) {} },
  Range: class { constructor(public start: any, public end: any) {} },
  Uri: {
    parse: (s: string) => ({ toString: () => s, fsPath: s, path: s }),
    joinPath: (base: any, ...p: string[]) => ({
      toString: () => base.toString() + '/' + p.join('/'),
      fsPath: base.fsPath + '/' + p.join('/'),
      path: base.path + '/' + p.join('/'),
    }),
  },
}));

import * as vscode from 'vscode';
import { MessageHandler } from './message-handler';
import type { OpenRouterClient } from '../core/openrouter-client';
import type { ContextBuilder } from '../core/context-builder';
import type { Settings } from '../core/settings';
import type { ExtensionMessage, CodeContext, OpenRouterModel, Conversation, ConversationSummary } from '../shared/types';
import type { ConversationHistory } from './history';
import type { EditorToolExecutor } from '../lsp/editor-tools';
import type { NotificationService } from '../core/notifications';

// Helper to create an async generator from chunks
async function* createMockStream(chunks: Array<{ choices: Array<{ delta: { content?: string }; finish_reason: string | null }> }>) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

async function* createToolCallStream(
  toolCalls: Array<{ id: string; name: string; arguments: string }>
) {
  // Chunk with tool_call metadata
  yield {
    choices: [{
      delta: {
        tool_calls: toolCalls.map((tc, i) => ({
          index: i,
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: '' },
        })),
      },
      finish_reason: null,
    }],
  };
  // Chunk with arguments
  yield {
    choices: [{
      delta: {
        tool_calls: toolCalls.map((tc, i) => ({
          index: i,
          function: { arguments: tc.arguments },
        })),
      },
      finish_reason: null,
    }],
  };
  // Final chunk
  yield {
    choices: [{
      delta: {},
      finish_reason: 'tool_calls',
    }],
  };
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
    getCustomInstructions: ReturnType<typeof vi.fn>;
  };
  let mockSettings: {
    setChatModel: ReturnType<typeof vi.fn>;
    temperature: number;
    maxTokens: number;
  };
  let postMessage: ReturnType<typeof vi.fn>;
  let mockContext: CodeContext;
  let mockEnrichedContext: CodeContext;
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

    mockEnrichedContext = {
      activeFile: {
        uri: 'file:///test.ts',
        languageId: 'typescript',
        content: 'const x = 1;',
        cursorLine: 0,
        cursorCharacter: 0,
      },
      definitions: [],
      diagnostics: [],
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
      buildEnrichedContext: vi.fn().mockResolvedValue(mockEnrichedContext),
      formatEnrichedPrompt: vi.fn(() => 'formatted context'),
      getCapabilities: vi.fn(() => undefined),
      getCustomInstructions: vi.fn(() => undefined),
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
    it('should call getModels and post contextUpdate with enriched context', async () => {
      await handler.handleMessage({ type: 'ready' }, postMessage);

      expect(mockClient.listModels).toHaveBeenCalledOnce();
      expect(postMessage).toHaveBeenCalledWith({
        type: 'modelsLoaded',
        models: mockModels,
      });
      expect(mockContextBuilder.buildEnrichedContext).toHaveBeenCalled();
      expect(postMessage).toHaveBeenCalledWith({
        type: 'contextUpdate',
        context: mockEnrichedContext,
      });
    });

    it('should fall back to basic context when buildEnrichedContext throws', async () => {
      mockContextBuilder.buildEnrichedContext.mockRejectedValueOnce(new Error('LSP unavailable'));
      await handler.handleMessage({ type: 'ready' }, postMessage);
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'contextUpdate' })
      );
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

    it('should include Project Instructions section in system message when custom instructions are set', async () => {
      mockContextBuilder.getCustomInstructions.mockReturnValue('# My Rules');
      mockClient.chatStream.mockReturnValue(
        createMockStream([
          { choices: [{ delta: { content: 'OK' }, finish_reason: 'stop' }] },
        ])
      );

      await handler.handleMessage(
        { type: 'sendMessage', content: 'Hello', model: 'test-model' },
        postMessage
      );

      const callArgs = mockClient.chatStream.mock.calls[0][0];
      const systemMessage = callArgs.messages.find((m: { role: string }) => m.role === 'system');
      expect(systemMessage).toBeDefined();
      expect(systemMessage.content).toContain('## Project Instructions:\n# My Rules');
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

  describe('conversation persistence', () => {
    let mockHistory: {
      create: ReturnType<typeof vi.fn>;
      save: ReturnType<typeof vi.fn>;
      load: ReturnType<typeof vi.fn>;
      list: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
      exportAsJson: ReturnType<typeof vi.fn>;
      exportAsMarkdown: ReturnType<typeof vi.fn>;
    };
    let handlerWithHistory: MessageHandler;
    let mockConversation: Conversation;
    let mockSummaries: ConversationSummary[];

    beforeEach(() => {
      mockConversation = {
        id: 'conv-123',
        title: 'New conversation',
        model: 'test-model',
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there' },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };

      mockSummaries = [
        {
          id: 'conv-123',
          title: 'New conversation',
          model: 'test-model',
          messageCount: 2,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ];

      mockHistory = {
        create: vi.fn().mockResolvedValue({ ...mockConversation, messages: [] }),
        save: vi.fn().mockResolvedValue(undefined),
        load: vi.fn().mockResolvedValue(mockConversation),
        list: vi.fn().mockResolvedValue(mockSummaries),
        delete: vi.fn().mockResolvedValue(undefined),
        exportAsJson: vi.fn().mockResolvedValue('{"id":"conv-123"}'),
        exportAsMarkdown: vi.fn().mockResolvedValue('# New conversation'),
      };

      handlerWithHistory = new MessageHandler(
        mockClient as unknown as OpenRouterClient,
        mockContextBuilder as unknown as ContextBuilder,
        mockSettings as unknown as Settings,
        undefined,
        mockHistory as unknown as ConversationHistory
      );
    });

    it('listConversations should post conversationList', async () => {
      await handlerWithHistory.handleMessage({ type: 'listConversations' }, postMessage);

      expect(mockHistory.list).toHaveBeenCalledOnce();
      expect(postMessage).toHaveBeenCalledWith({
        type: 'conversationList',
        conversations: mockSummaries,
      });
    });

    it('loadConversation should restore messages and post conversationLoaded', async () => {
      await handlerWithHistory.handleMessage({ type: 'loadConversation', id: 'conv-123' }, postMessage);

      expect(mockHistory.load).toHaveBeenCalledWith('conv-123');
      expect(postMessage).toHaveBeenCalledWith({
        type: 'conversationLoaded',
        conversation: mockConversation,
      });

      // After loading, sending a message should include loaded history
      mockClient.chatStream.mockReturnValue(
        createMockStream([
          { choices: [{ delta: { content: 'Response' }, finish_reason: 'stop' }] },
        ])
      );
      await handlerWithHistory.handleMessage(
        { type: 'sendMessage', content: 'Follow up', model: 'test-model' },
        postMessage
      );

      const callArgs = mockClient.chatStream.mock.calls[0][0];
      // system + loaded user + loaded assistant + new user = 4
      expect(callArgs.messages).toHaveLength(4);
      expect(callArgs.messages[1]).toEqual({ role: 'user', content: 'Hello' });
      expect(callArgs.messages[2]).toEqual({ role: 'assistant', content: 'Hi there' });
      expect(callArgs.messages[3]).toEqual({ role: 'user', content: 'Follow up' });
    });

    it('deleteConversation should delete and refresh list', async () => {
      // First load a conversation to set currentConversation
      await handlerWithHistory.handleMessage({ type: 'loadConversation', id: 'conv-123' }, postMessage);
      postMessage.mockClear();

      // Delete the loaded conversation
      mockHistory.list.mockResolvedValue([]);
      await handlerWithHistory.handleMessage({ type: 'deleteConversation', id: 'conv-123' }, postMessage);

      expect(mockHistory.delete).toHaveBeenCalledWith('conv-123');
      expect(mockHistory.list).toHaveBeenCalled();
      expect(postMessage).toHaveBeenCalledWith({
        type: 'conversationList',
        conversations: [],
      });
    });

    it('newChat should clear currentConversation', async () => {
      // Load a conversation first
      await handlerWithHistory.handleMessage({ type: 'loadConversation', id: 'conv-123' }, postMessage);
      postMessage.mockClear();

      // New chat
      await handlerWithHistory.handleMessage({ type: 'newChat' }, postMessage);

      // Send a message - should create a new conversation, not reuse the old one
      mockClient.chatStream.mockReturnValue(
        createMockStream([
          { choices: [{ delta: { content: 'Fresh' }, finish_reason: 'stop' }] },
        ])
      );
      await handlerWithHistory.handleMessage(
        { type: 'sendMessage', content: 'New start', model: 'test-model' },
        postMessage
      );

      // Should have called create (new conversation)
      expect(mockHistory.create).toHaveBeenCalledWith('test-model');
      const callArgs = mockClient.chatStream.mock.calls[0][0];
      // system + new user only = 2
      expect(callArgs.messages).toHaveLength(2);
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

  describe('applyToFile', () => {
    let applyHandler: MessageHandler;
    let postMessage: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      postMessage = vi.fn();
      applyHandler = new MessageHandler(
        mockClient as unknown as OpenRouterClient,
        mockContextBuilder as unknown as ContextBuilder,
        mockSettings as unknown as Settings,
      );
      (vscode.workspace.fs.readFile as any).mockResolvedValue(
        new TextEncoder().encode('const x = 1;\n')
      );
      (vscode.workspace.fs.stat as any).mockResolvedValue({});
      (vscode.workspace.openTextDocument as any).mockResolvedValue({
        lineCount: 1,
        uri: { toString: () => 'file:///workspace/src/foo.ts', fsPath: '/workspace/src/foo.ts' },
      });
    });

    it('should post showDiff for a single-hunk change when filename provided', async () => {
      await applyHandler.handleMessage(
        { type: 'applyToFile', code: 'const x = 2;\n', language: 'ts', filename: 'src/foo.ts' },
        postMessage
      );

      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'showDiff' })
      );
      const call = postMessage.mock.calls.find((c: any[]) => c[0].type === 'showDiff');
      expect(call[0].lines).toBeInstanceOf(Array);
      expect(call[0].filename).toContain('foo.ts');
      expect(call[0].fileUri).toBeDefined();
    });

    it('should open file picker when no filename is provided', async () => {
      (vscode.window.showOpenDialog as any).mockResolvedValue(undefined);

      await applyHandler.handleMessage(
        { type: 'applyToFile', code: 'const x = 2;', language: 'ts' },
        postMessage
      );

      expect(vscode.window.showOpenDialog).toHaveBeenCalled();
      expect(postMessage).not.toHaveBeenCalled();
    });

    it('should apply file on confirmApply', async () => {
      // First trigger apply to put code in pendingApply
      await applyHandler.handleMessage(
        { type: 'applyToFile', code: 'const x = 2;\n', language: 'ts', filename: 'src/foo.ts' },
        postMessage
      );

      const diffMsg = postMessage.mock.calls.find((c: any[]) => c[0].type === 'showDiff');
      const fileUri = diffMsg[0].fileUri;

      // Then confirm
      await applyHandler.handleMessage(
        { type: 'confirmApply', fileUri },
        postMessage
      );

      expect(vscode.workspace.applyEdit).toHaveBeenCalled();
    });
  });

  describe('abort', () => {
    it('should call abortController.abort() when a controller is active', async () => {
      // Start a stream that hangs so abortController is set
      let rejectStream!: (err: Error) => void;
      mockClient.chatStream.mockReturnValue(
        (async function* () {
          yield { choices: [{ delta: { content: 'partial' }, finish_reason: null }] };
          await new Promise<void>((_resolve, reject) => { rejectStream = reject; });
        })()
      );

      const sendPromise = handler.handleMessage(
        { type: 'sendMessage', content: 'Hi', model: 'test-model' },
        postMessage
      );

      // Wait for stream to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Call abort() — should abort the controller
      handler.abort();

      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      rejectStream(abortError);

      await sendPromise;

      expect(postMessage).toHaveBeenCalledWith({ type: 'streamEnd' });
      const errorMessages = postMessage.mock.calls.filter(
        (call: [ExtensionMessage]) => call[0].type === 'streamError'
      );
      expect(errorMessages).toHaveLength(0);
    });

    it('should do nothing when no controller is active', () => {
      expect(() => handler.abort()).not.toThrow();
    });
  });

  describe('onStreamEnd callback', () => {
    it('calls onStreamEnd after a successful stream', async () => {
      const mockChunks = [
        { choices: [{ delta: { content: 'hello' }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
      ];
      mockClient.chatStream.mockReturnValueOnce(createMockStream(mockChunks));

      const onStreamEnd = vi.fn();
      handler.onStreamEnd = onStreamEnd;

      await handler.handleMessage({ type: 'sendMessage', content: 'hi', model: 'gpt-4' }, postMessage);

      expect(onStreamEnd).toHaveBeenCalledTimes(1);
    });

    it('does not call onStreamEnd when the request is aborted', async () => {
      let rejectStream!: (err: Error) => void;
      mockClient.chatStream.mockReturnValue(
        (async function* () {
          yield { choices: [{ delta: { content: 'partial' }, finish_reason: null }] };
          await new Promise<void>((_resolve, reject) => {
            rejectStream = reject;
          });
        })()
      );

      const onStreamEnd = vi.fn();
      handler.onStreamEnd = onStreamEnd;

      const sendPromise = handler.handleMessage(
        { type: 'sendMessage', content: 'hi', model: 'gpt-4' },
        postMessage
      );

      // Wait for the stream to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Abort mid-stream
      handler.abort();

      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      rejectStream(abortError);

      await sendPromise;

      expect(onStreamEnd).not.toHaveBeenCalled();
    });
  });

  describe('large output offloading', () => {
    let mockToolExecutor: { execute: ReturnType<typeof vi.fn> };
    let handler: MessageHandler;

    beforeEach(() => {
      mockToolExecutor = { execute: vi.fn() };
      handler = new MessageHandler(
        mockClient as unknown as OpenRouterClient,
        mockContextBuilder as unknown as ContextBuilder,
        mockSettings as unknown as Settings,
        mockToolExecutor as unknown as EditorToolExecutor,
      );
    });

    it('truncates tool output longer than 8000 chars', async () => {
      const longOutput = 'x'.repeat(9000);
      const toolStream = createToolCallStream([
        { id: 'call_1', name: 'search_files', arguments: '{"pattern":"**/*.ts"}' },
      ]);
      const stopStream = createMockStream([
        { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] },
      ]);
      mockClient.chatStream
        .mockReturnValueOnce(toolStream)
        .mockReturnValueOnce(stopStream);
      mockToolExecutor.execute.mockResolvedValue({ success: true, message: longOutput });

      await handler.handleMessage(
        { type: 'sendMessage', content: 'find ts files', model: 'gpt-4' },
        () => {}
      );

      // The second chatStream call receives the tool result — check it was truncated
      const secondCallMessages = mockClient.chatStream.mock.calls[1][0].messages;
      const toolResultMsg = secondCallMessages.find((m: any) => m.role === 'tool');
      expect(toolResultMsg.content).toContain('[Output truncated');
      expect(toolResultMsg.content.length).toBeLessThan(longOutput.length);
    });

    it('does not truncate output under 8000 chars', async () => {
      const shortOutput = 'x'.repeat(100);
      const toolStream = createToolCallStream([
        { id: 'call_1', name: 'search_files', arguments: '{"pattern":"**/*.ts"}' },
      ]);
      const stopStream = createMockStream([
        { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] },
      ]);
      mockClient.chatStream
        .mockReturnValueOnce(toolStream)
        .mockReturnValueOnce(stopStream);
      mockToolExecutor.execute.mockResolvedValue({ success: true, message: shortOutput });

      await handler.handleMessage(
        { type: 'sendMessage', content: 'find ts files', model: 'gpt-4' },
        () => {}
      );

      const secondCallMessages = mockClient.chatStream.mock.calls[1][0].messages;
      const toolResultMsg = secondCallMessages.find((m: any) => m.role === 'tool');
      expect(toolResultMsg.content).toBe(shortOutput);
    });
  });

  describe('HITL tool approval', () => {
    let mockToolExecutor: { execute: ReturnType<typeof vi.fn> };
    let handler: MessageHandler;

    beforeEach(() => {
      mockToolExecutor = { execute: vi.fn() };
      handler = new MessageHandler(
        mockClient as unknown as OpenRouterClient,
        mockContextBuilder as unknown as ContextBuilder,
        mockSettings as unknown as Settings,
        mockToolExecutor as unknown as EditorToolExecutor,
      );
    });

    it('posts toolApprovalRequest for gated tools and executes on approval', async () => {
      const toolStream = createToolCallStream([
        { id: 'call_1', name: 'rename_symbol', arguments: '{"uri":"file:///test.ts","line":0,"character":0,"newName":"foo"}' },
      ]);
      const stopStream = createMockStream([
        { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] },
      ]);
      mockClient.chatStream
        .mockReturnValueOnce(toolStream)
        .mockReturnValueOnce(stopStream);
      mockToolExecutor.execute.mockResolvedValue({ success: true, message: 'Renamed' });

      const postMessages: ExtensionMessage[] = [];

      // Start without awaiting — we need to interject with the approval response
      const sendPromise = handler.handleMessage(
        { type: 'sendMessage', content: 'rename foo', model: 'gpt-4' },
        (msg) => postMessages.push(msg)
      );

      // Poll until approval request is posted
      await vi.waitFor(() => {
        expect(postMessages.some((m) => m.type === 'toolApprovalRequest')).toBe(true);
      }, { timeout: 1000 });

      const req = postMessages.find((m) => m.type === 'toolApprovalRequest') as Extract<ExtensionMessage, { type: 'toolApprovalRequest' }>;

      // Respond with approval
      await handler.handleMessage(
        { type: 'toolApprovalResponse', requestId: req.requestId, approved: true },
        () => {}
      );

      await sendPromise;

      expect(mockToolExecutor.execute).toHaveBeenCalledWith('rename_symbol', expect.any(Object));
    });

    it('skips execution and sends "User denied" when denied', async () => {
      const toolStream = createToolCallStream([
        { id: 'call_1', name: 'insert_code', arguments: '{"uri":"file:///test.ts","line":0,"character":0,"code":"// hello"}' },
      ]);
      const stopStream = createMockStream([
        { choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] },
      ]);
      mockClient.chatStream
        .mockReturnValueOnce(toolStream)
        .mockReturnValueOnce(stopStream);

      const postMessages: ExtensionMessage[] = [];

      const sendPromise = handler.handleMessage(
        { type: 'sendMessage', content: 'insert comment', model: 'gpt-4' },
        (msg) => postMessages.push(msg)
      );

      await vi.waitFor(() => {
        expect(postMessages.some((m) => m.type === 'toolApprovalRequest')).toBe(true);
      }, { timeout: 1000 });

      const req = postMessages.find((m) => m.type === 'toolApprovalRequest') as Extract<ExtensionMessage, { type: 'toolApprovalRequest' }>;

      await handler.handleMessage(
        { type: 'toolApprovalResponse', requestId: req.requestId, approved: false },
        () => {}
      );

      await sendPromise;

      expect(mockToolExecutor.execute).not.toHaveBeenCalled();
      // Verify the tool result sent to LLM says denied
      const secondCallMessages = mockClient.chatStream.mock.calls[1][0].messages;
      const toolResultMsg = secondCallMessages.find((m: any) => m.role === 'tool');
      expect(toolResultMsg.content).toContain('denied');
    });

    it('does not require approval for non-gated tools (format_document)', async () => {
      const toolStream = createToolCallStream([
        { id: 'call_1', name: 'format_document', arguments: '{"uri":"file:///test.ts"}' },
      ]);
      const stopStream = createMockStream([
        { choices: [{ delta: { content: 'formatted' }, finish_reason: 'stop' }] },
      ]);
      mockClient.chatStream
        .mockReturnValueOnce(toolStream)
        .mockReturnValueOnce(stopStream);
      mockToolExecutor.execute.mockResolvedValue({ success: true, message: 'Formatted' });

      const postMessages: ExtensionMessage[] = [];
      await handler.handleMessage(
        { type: 'sendMessage', content: 'format file', model: 'gpt-4' },
        (msg) => postMessages.push(msg)
      );

      expect(postMessages.some((m) => m.type === 'toolApprovalRequest')).toBe(false);
      expect(mockToolExecutor.execute).toHaveBeenCalledWith('format_document', expect.any(Object));
    });

    it('clears pending approvals when abort() is called', () => {
      const resolved: boolean[] = [];
      const requestId = 'test-id';
      (handler as any).pendingApprovals.set(requestId, (v: boolean) => resolved.push(v));

      handler.abort();

      expect(resolved).toEqual([false]);
      expect((handler as any).pendingApprovals.size).toBe(0);
    });
  });

  describe('handleSendMessage with images', () => {
    let handler: MessageHandler;
    let mockClient: any;
    let mockContextBuilder: any;
    let mockSettings: any;
    let messages: ExtensionMessage[];

    beforeEach(() => {
      messages = [];

      mockContextBuilder = {
        buildEnrichedContext: vi.fn().mockResolvedValue({}),
        getCapabilities: vi.fn().mockReturnValue({}),
        formatEnrichedPrompt: vi.fn().mockReturnValue(''),
        getCustomInstructions: vi.fn().mockReturnValue(''),
      };
      mockSettings = { temperature: 0.7, maxTokens: 4096, setChatModel: vi.fn() };

      mockClient = {
        chatStream: vi.fn().mockImplementation(async function* () {
          yield { choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] };
        }),
        listModels: vi.fn().mockResolvedValue([]),
      };

      handler = new MessageHandler(mockClient, mockContextBuilder, mockSettings);
    });

    it('builds string content when no images', async () => {
      await handler.handleMessage(
        { type: 'sendMessage', content: 'hello', images: [], model: 'gpt-4o' },
        (m) => messages.push(m)
      );
      const call = mockClient.chatStream.mock.calls[0][0];
      const userMsg = call.messages.find((m: any) => m.role === 'user');
      expect(userMsg.content).toBe('hello');
    });

    it('builds ContentPart[] content when images present', async () => {
      const imgUrl = 'data:image/png;base64,abc123';
      await handler.handleMessage(
        { type: 'sendMessage', content: 'what is this?', images: [imgUrl], model: 'gpt-4o' },
        (m) => messages.push(m)
      );
      const call = mockClient.chatStream.mock.calls[0][0];
      const userMsg = call.messages.find((m: any) => m.role === 'user');
      expect(Array.isArray(userMsg.content)).toBe(true);
      expect(userMsg.content[0]).toEqual({ type: 'text', text: 'what is this?' });
      expect(userMsg.content[1]).toEqual({ type: 'image_url', image_url: { url: imgUrl } });
    });
  });

  describe('tool-use agentic loop', () => {
    let mockToolExecutor: { execute: ReturnType<typeof vi.fn> };
    let mockNotifications: { handleError: ReturnType<typeof vi.fn> };
    let toolHandler: MessageHandler;

    beforeEach(() => {
      mockToolExecutor = { execute: vi.fn().mockResolvedValue({ success: true, message: 'formatted' }) };
      mockNotifications = { handleError: vi.fn() };
      toolHandler = new MessageHandler(
        mockClient as unknown as OpenRouterClient,
        mockContextBuilder as unknown as ContextBuilder,
        mockSettings as unknown as Settings,
        mockToolExecutor as unknown as EditorToolExecutor,
        undefined,
        mockNotifications as unknown as NotificationService
      );
    });

    it('should execute tool_calls and continue the conversation', async () => {
      mockClient.chatStream
        .mockReturnValueOnce(
          createToolCallStream([{ id: 'call_1', name: 'format_document', arguments: '{"uri":"file:///test.ts"}' }])
        )
        .mockReturnValueOnce(
          createMockStream([
            { choices: [{ delta: { content: 'Done! I formatted the file.' }, finish_reason: null }] },
            { choices: [{ delta: {}, finish_reason: 'stop' }] },
          ])
        );

      await toolHandler.handleMessage(
        { type: 'sendMessage', content: 'format this file', model: 'test-model' },
        postMessage
      );

      expect(mockToolExecutor.execute).toHaveBeenCalledWith(
        'format_document',
        { uri: 'file:///test.ts' }
      );

      const chunks = postMessage.mock.calls
        .filter((c: any[]) => c[0].type === 'streamChunk')
        .map((c: any[]) => c[0].content);
      expect(chunks.join('')).toBe('Done! I formatted the file.');

      expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'streamEnd' }));
      expect(mockClient.chatStream).toHaveBeenCalledTimes(2);
    });

    it('should post streamError after exceeding max tool iterations', async () => {
      // Always return tool_calls — never resolves with 'stop'
      // Use mockImplementation so each call gets a fresh async generator instance
      mockClient.chatStream.mockImplementation(() =>
        createToolCallStream([{ id: 'call_1', name: 'format_document', arguments: '{"uri":"file:///test.ts"}' }])
      );

      await toolHandler.handleMessage(
        { type: 'sendMessage', content: 'loop forever', model: 'test-model' },
        postMessage
      );

      expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'streamError' }));
      expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'streamEnd' }));
      // 5 iterations max
      expect(mockClient.chatStream).toHaveBeenCalledTimes(5);
    });

    it('should pass TOOL_DEFINITIONS in the API request when toolExecutor is provided', async () => {
      mockClient.chatStream.mockReturnValue(
        createMockStream([
          { choices: [{ delta: { content: 'answer' }, finish_reason: null }] },
          { choices: [{ delta: {}, finish_reason: 'stop' }] },
        ])
      );

      await toolHandler.handleMessage(
        { type: 'sendMessage', content: 'hello', model: 'test-model' },
        postMessage
      );

      const firstCall = mockClient.chatStream.mock.calls[0][0];
      expect(firstCall.tools).toBeDefined();
      expect(firstCall.tools.length).toBeGreaterThan(0);
    });
  });
});
