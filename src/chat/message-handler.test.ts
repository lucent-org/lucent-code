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
    findFiles: vi.fn().mockResolvedValue([]),
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
import type { SkillRegistry } from '../skills/skill-registry';
import type { McpClientManager } from '../mcp/mcp-client-manager';

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
    chat: ReturnType<typeof vi.fn>;
    listModels: ReturnType<typeof vi.fn>;
  };
  let mockContextBuilder: {
    buildContext: ReturnType<typeof vi.fn>;
    formatForPrompt: ReturnType<typeof vi.fn>;
    buildEnrichedContext: ReturnType<typeof vi.fn>;
    formatEnrichedPrompt: ReturnType<typeof vi.fn>;
    getCapabilities: ReturnType<typeof vi.fn>;
    getCustomInstructions: ReturnType<typeof vi.fn>;
    getActivatedSkills: ReturnType<typeof vi.fn>;
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
      chat: vi.fn(),
      listModels: vi.fn().mockResolvedValue(mockModels),
    };

    mockContextBuilder = {
      buildContext: vi.fn().mockReturnValue(mockContext),
      formatForPrompt: vi.fn().mockReturnValue('formatted context'),
      buildEnrichedContext: vi.fn().mockResolvedValue(mockEnrichedContext),
      formatEnrichedPrompt: vi.fn(() => 'formatted context'),
      getCapabilities: vi.fn(() => undefined),
      getCustomInstructions: vi.fn(() => undefined),
      getActivatedSkills: vi.fn(() => []),
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

    it('strips ContentPart[] to plain text when auto-titling', async () => {
      // Arrange: chatStream returns stop so the stream completes and triggers autoTitle
      mockClient.chatStream.mockImplementation(async function* () {
        yield { choices: [{ delta: { content: 'response' }, finish_reason: 'stop' }] };
      });
      mockClient.chat.mockResolvedValue({
        choices: [{ message: { content: 'A title', role: 'assistant' }, finish_reason: 'stop' }],
      });

      const imgUrl = 'data:image/png;base64,abc123';

      // Act: send a message with an image (triggers autoTitle after 2nd save — user + assistant)
      await handlerWithHistory.handleMessage(
        { type: 'sendMessage', content: 'describe this image', images: [imgUrl], model: 'gpt-4o' },
        postMessage
      );

      // Assert: autoTitle was called (client.chat was called)
      expect(mockClient.chat).toHaveBeenCalled();
      const autoTitleCall = mockClient.chat.mock.calls[0][0];
      const userMsg = autoTitleCall.messages.find((m: any) => m.role === 'user');
      expect(typeof userMsg.content).toBe('string');
      expect(userMsg.content).toBe('describe this image');
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
      const resolved: { approved: boolean; scope: string }[] = [];
      const requestId = 'test-id';
      (handler as any).pendingApprovals.set(requestId, (v: { approved: boolean; scope: string }) => resolved.push(v));

      handler.abort();

      expect(resolved).toEqual([{ approved: false, scope: 'once' }]);
      expect((handler as any).pendingApprovals.size).toBe(0);
    });

    it('toolApprovalRequest for replace_range includes a diff field', async () => {
      const toolStream = createToolCallStream([
        {
          id: 'call_1',
          name: 'replace_range',
          arguments: JSON.stringify({
            uri: 'file:///test.ts',
            startLine: 0, startCharacter: 0,
            endLine: 0, endCharacter: 5,
            code: 'hello',
          }),
        },
      ]);
      const stopStream = createMockStream([
        { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] },
      ]);
      mockClient.chatStream
        .mockReturnValueOnce(toolStream)
        .mockReturnValueOnce(stopStream);
      mockToolExecutor.execute.mockResolvedValue({ success: true, message: 'OK' });

      const postMessages: ExtensionMessage[] = [];
      const sendPromise = handler.handleMessage(
        { type: 'sendMessage', content: 'replace', model: 'gpt-4' },
        (msg) => postMessages.push(msg)
      );

      await vi.waitFor(() => {
        expect(postMessages.some((m) => m.type === 'toolApprovalRequest')).toBe(true);
      }, { timeout: 1000 });

      const req = postMessages.find((m) => m.type === 'toolApprovalRequest') as Extract<ExtensionMessage, { type: 'toolApprovalRequest' }>;
      // After the type change, this line must typecheck (no TS error):
      const _diff: import('../shared/types').DiffLine[] | undefined = req.diff;
      // readFile mock returns content (default mock), so computeToolDiff produces a real diff
      expect(_diff).toBeDefined();

      await handler.handleMessage({ type: 'toolApprovalResponse', requestId: req.requestId, approved: true }, () => {});
      await sendPromise;
    });

    describe('computeToolDiff', () => {
      it('replace_range approval request includes non-empty diff', async () => {
        vi.mocked(vscode.workspace.fs.readFile).mockResolvedValueOnce(
          new TextEncoder().encode('line0\nline1\nline2\n') as unknown as Uint8Array
        );
        const toolStream = createToolCallStream([
          {
            id: 'call_1',
            name: 'replace_range',
            arguments: JSON.stringify({
              uri: 'file:///test.ts',
              startLine: 1, startCharacter: 0,
              endLine: 1, endCharacter: 5,
              code: 'REPLACED',
            }),
          },
        ]);
        const stopStream = createMockStream([
          { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] },
        ]);
        mockClient.chatStream
          .mockReturnValueOnce(toolStream)
          .mockReturnValueOnce(stopStream);
        mockToolExecutor.execute.mockResolvedValue({ success: true, message: 'OK' });

        const postMessages: ExtensionMessage[] = [];
        const sendPromise = handler.handleMessage(
          { type: 'sendMessage', content: 'replace', model: 'gpt-4' },
          (msg) => postMessages.push(msg)
        );

        await vi.waitFor(() => {
          expect(postMessages.some((m) => m.type === 'toolApprovalRequest')).toBe(true);
        }, { timeout: 1000 });

        const req = postMessages.find((m) => m.type === 'toolApprovalRequest') as Extract<ExtensionMessage, { type: 'toolApprovalRequest' }>;
        expect(req.diff).toBeDefined();
        expect(req.diff!.length).toBeGreaterThan(0);
        expect(req.diff!.some((l) => l.type === 'added')).toBe(true);
        expect(req.diff!.some((l) => l.type === 'removed')).toBe(true);

        await handler.handleMessage({ type: 'toolApprovalResponse', requestId: req.requestId, approved: true }, () => {});
        await sendPromise;
      });

      it('insert_code approval request includes non-empty diff', async () => {
        vi.mocked(vscode.workspace.fs.readFile).mockResolvedValueOnce(
          new TextEncoder().encode('line0\nline1\nline2\n') as unknown as Uint8Array
        );
        const toolStream = createToolCallStream([
          {
            id: 'call_1',
            name: 'insert_code',
            arguments: JSON.stringify({
              uri: 'file:///test.ts',
              line: 1, character: 0,
              code: '// inserted\n',
            }),
          },
        ]);
        const stopStream = createMockStream([
          { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] },
        ]);
        mockClient.chatStream
          .mockReturnValueOnce(toolStream)
          .mockReturnValueOnce(stopStream);
        mockToolExecutor.execute.mockResolvedValue({ success: true, message: 'OK' });

        const postMessages: ExtensionMessage[] = [];
        const sendPromise = handler.handleMessage(
          { type: 'sendMessage', content: 'insert', model: 'gpt-4' },
          (msg) => postMessages.push(msg)
        );

        await vi.waitFor(() => {
          expect(postMessages.some((m) => m.type === 'toolApprovalRequest')).toBe(true);
        }, { timeout: 1000 });

        const req = postMessages.find((m) => m.type === 'toolApprovalRequest') as Extract<ExtensionMessage, { type: 'toolApprovalRequest' }>;
        expect(req.diff).toBeDefined();
        expect(req.diff!.some((l) => l.type === 'added')).toBe(true);

        await handler.handleMessage({ type: 'toolApprovalResponse', requestId: req.requestId, approved: true }, () => {});
        await sendPromise;
      });

      it('file read failure → diff is undefined in approval request', async () => {
        vi.mocked(vscode.workspace.fs.readFile).mockRejectedValueOnce(new Error('File not found'));

        const toolStream = createToolCallStream([
          {
            id: 'call_1',
            name: 'replace_range',
            arguments: JSON.stringify({
              uri: 'file:///missing.ts',
              startLine: 0, startCharacter: 0,
              endLine: 0, endCharacter: 3,
              code: 'new',
            }),
          },
        ]);
        const stopStream = createMockStream([
          { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] },
        ]);
        mockClient.chatStream
          .mockReturnValueOnce(toolStream)
          .mockReturnValueOnce(stopStream);
        mockToolExecutor.execute.mockResolvedValue({ success: true, message: 'OK' });

        const postMessages: ExtensionMessage[] = [];
        const sendPromise = handler.handleMessage(
          { type: 'sendMessage', content: 'replace', model: 'gpt-4' },
          (msg) => postMessages.push(msg)
        );

        await vi.waitFor(() => {
          expect(postMessages.some((m) => m.type === 'toolApprovalRequest')).toBe(true);
        }, { timeout: 1000 });

        const req = postMessages.find((m) => m.type === 'toolApprovalRequest') as Extract<ExtensionMessage, { type: 'toolApprovalRequest' }>;
        expect(req.diff).toBeUndefined();

        await handler.handleMessage({ type: 'toolApprovalResponse', requestId: req.requestId, approved: true }, () => {});
        await sendPromise;
      });

      it('rename_symbol approval request does NOT include diff', async () => {
        const toolStream = createToolCallStream([
          {
            id: 'call_1',
            name: 'rename_symbol',
            arguments: JSON.stringify({ uri: 'file:///test.ts', line: 0, character: 0, newName: 'foo' }),
          },
        ]);
        const stopStream = createMockStream([
          { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] },
        ]);
        mockClient.chatStream
          .mockReturnValueOnce(toolStream)
          .mockReturnValueOnce(stopStream);
        mockToolExecutor.execute.mockResolvedValue({ success: true, message: 'OK' });

        const postMessages: ExtensionMessage[] = [];
        const sendPromise = handler.handleMessage(
          { type: 'sendMessage', content: 'rename', model: 'gpt-4' },
          (msg) => postMessages.push(msg)
        );

        await vi.waitFor(() => {
          expect(postMessages.some((m) => m.type === 'toolApprovalRequest')).toBe(true);
        }, { timeout: 1000 });

        const req = postMessages.find((m) => m.type === 'toolApprovalRequest') as Extract<ExtensionMessage, { type: 'toolApprovalRequest' }>;
        expect(req.diff).toBeUndefined();

        await handler.handleMessage({ type: 'toolApprovalResponse', requestId: req.requestId, approved: true }, () => {});
        await sendPromise;
      });

      it('apply_code_action approval request does NOT include diff', async () => {
        const toolStream = createToolCallStream([
          {
            id: 'call_1',
            name: 'apply_code_action',
            arguments: JSON.stringify({ uri: 'file:///test.ts', action: 'some-action' }),
          },
        ]);
        const stopStream = createMockStream([
          { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] },
        ]);
        mockClient.chatStream
          .mockReturnValueOnce(toolStream)
          .mockReturnValueOnce(stopStream);
        mockToolExecutor.execute.mockResolvedValue({ success: true, message: 'OK' });

        const postMessages: ExtensionMessage[] = [];
        const sendPromise = handler.handleMessage(
          { type: 'sendMessage', content: 'apply action', model: 'gpt-4' },
          (msg) => postMessages.push(msg)
        );

        await vi.waitFor(() => {
          expect(postMessages.some((m) => m.type === 'toolApprovalRequest')).toBe(true);
        }, { timeout: 1000 });

        const req = postMessages.find((m) => m.type === 'toolApprovalRequest') as Extract<ExtensionMessage, { type: 'toolApprovalRequest' }>;
        expect(req.diff).toBeUndefined();

        await handler.handleMessage({ type: 'toolApprovalResponse', requestId: req.requestId, approved: true }, () => {});
        await sendPromise;
      });
    });

    describe('scope persistence', () => {
      it('calls approveForWorkspace when scope is workspace', async () => {
        const toolStream = createToolCallStream([
          { id: 'call_1', name: 'run_terminal_command', arguments: '{"command":"echo hi"}' },
        ]);
        const stopStream = createMockStream([
          { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] },
        ]);
        mockClient.chatStream
          .mockReturnValueOnce(toolStream)
          .mockReturnValueOnce(stopStream);
        mockToolExecutor.execute.mockResolvedValue({ success: true, message: 'OK' });

        const postMessages: ExtensionMessage[] = [];
        const sendPromise = handler.handleMessage(
          { type: 'sendMessage', content: 'run command', model: 'gpt-4' },
          (msg) => postMessages.push(msg)
        );

        await vi.waitFor(() => {
          expect(postMessages.some((m) => m.type === 'toolApprovalRequest')).toBe(true);
        }, { timeout: 1000 });

        const req = postMessages.find((m) => m.type === 'toolApprovalRequest') as Extract<ExtensionMessage, { type: 'toolApprovalRequest' }>;

        const approvalManager = (handler as any).approvalManager;
        const approveForWorkspaceSpy = vi.spyOn(approvalManager, 'approveForWorkspace').mockResolvedValue(undefined);

        await handler.handleMessage(
          { type: 'toolApprovalResponse', requestId: req.requestId, approved: true, scope: 'workspace' },
          () => {}
        );

        await sendPromise;

        expect(approveForWorkspaceSpy).toHaveBeenCalledWith('run_terminal_command');
      });

      it('calls approveGlobally when scope is global', async () => {
        const toolStream = createToolCallStream([
          { id: 'call_1', name: 'run_terminal_command', arguments: '{"command":"echo hi"}' },
        ]);
        const stopStream = createMockStream([
          { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] },
        ]);
        mockClient.chatStream
          .mockReturnValueOnce(toolStream)
          .mockReturnValueOnce(stopStream);
        mockToolExecutor.execute.mockResolvedValue({ success: true, message: 'OK' });

        const postMessages: ExtensionMessage[] = [];
        const sendPromise = handler.handleMessage(
          { type: 'sendMessage', content: 'run command', model: 'gpt-4' },
          (msg) => postMessages.push(msg)
        );

        await vi.waitFor(() => {
          expect(postMessages.some((m) => m.type === 'toolApprovalRequest')).toBe(true);
        }, { timeout: 1000 });

        const req = postMessages.find((m) => m.type === 'toolApprovalRequest') as Extract<ExtensionMessage, { type: 'toolApprovalRequest' }>;

        const approvalManager = (handler as any).approvalManager;
        const approveGloballySpy = vi.spyOn(approvalManager, 'approveGlobally').mockResolvedValue(undefined);

        await handler.handleMessage(
          { type: 'toolApprovalResponse', requestId: req.requestId, approved: true, scope: 'global' },
          () => {}
        );

        await sendPromise;

        expect(approveGloballySpy).toHaveBeenCalledWith('run_terminal_command');
      });

      it('does not call persist methods when scope is once or absent', async () => {
        const toolStream = createToolCallStream([
          { id: 'call_1', name: 'run_terminal_command', arguments: '{"command":"echo hi"}' },
        ]);
        const stopStream = createMockStream([
          { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] },
        ]);
        mockClient.chatStream
          .mockReturnValueOnce(toolStream)
          .mockReturnValueOnce(stopStream);
        mockToolExecutor.execute.mockResolvedValue({ success: true, message: 'OK' });

        const postMessages: ExtensionMessage[] = [];
        const sendPromise = handler.handleMessage(
          { type: 'sendMessage', content: 'run command', model: 'gpt-4' },
          (msg) => postMessages.push(msg)
        );

        await vi.waitFor(() => {
          expect(postMessages.some((m) => m.type === 'toolApprovalRequest')).toBe(true);
        }, { timeout: 1000 });

        const req = postMessages.find((m) => m.type === 'toolApprovalRequest') as Extract<ExtensionMessage, { type: 'toolApprovalRequest' }>;

        const approvalManager = (handler as any).approvalManager;
        const approveForWorkspaceSpy = vi.spyOn(approvalManager, 'approveForWorkspace').mockResolvedValue(undefined);
        const approveGloballySpy = vi.spyOn(approvalManager, 'approveGlobally').mockResolvedValue(undefined);

        await handler.handleMessage(
          { type: 'toolApprovalResponse', requestId: req.requestId, approved: true, scope: 'once' },
          () => {}
        );

        await sendPromise;

        expect(approveForWorkspaceSpy).not.toHaveBeenCalled();
        expect(approveGloballySpy).not.toHaveBeenCalled();
      });

      it('approves for session when scope is once so second call skips approval card', async () => {
        const toolStreamFirst = createToolCallStream([
          { id: 'call_1', name: 'write_file', arguments: '{"path":"src/foo.ts","content":"a"}' },
        ]);
        const stopStreamFirst = createMockStream([
          { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] },
        ]);
        const toolStreamSecond = createToolCallStream([
          { id: 'call_2', name: 'write_file', arguments: '{"path":"src/bar.ts","content":"b"}' },
        ]);
        const stopStreamSecond = createMockStream([
          { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] },
        ]);
        mockClient.chatStream
          .mockReturnValueOnce(toolStreamFirst)
          .mockReturnValueOnce(stopStreamFirst)
          .mockReturnValueOnce(toolStreamSecond)
          .mockReturnValueOnce(stopStreamSecond);
        mockToolExecutor.execute.mockResolvedValue({ success: true, message: 'OK' });

        // First send — approval required
        const postMessages1: ExtensionMessage[] = [];
        const sendPromise1 = handler.handleMessage(
          { type: 'sendMessage', content: 'write first file', model: 'gpt-4' },
          (msg) => postMessages1.push(msg)
        );

        await vi.waitFor(() => {
          expect(postMessages1.some((m) => m.type === 'toolApprovalRequest')).toBe(true);
        }, { timeout: 1000 });

        const req1 = postMessages1.find((m) => m.type === 'toolApprovalRequest') as Extract<ExtensionMessage, { type: 'toolApprovalRequest' }>;

        // Approve with 'once' scope
        await handler.handleMessage(
          { type: 'toolApprovalResponse', requestId: req1.requestId, approved: true, scope: 'once' },
          () => {}
        );
        await sendPromise1;

        // Second send — write_file should execute without another approval card
        const postMessages2: ExtensionMessage[] = [];
        await handler.handleMessage(
          { type: 'sendMessage', content: 'write second file', model: 'gpt-4' },
          (msg) => postMessages2.push(msg)
        );

        expect(postMessages2.some((m) => m.type === 'toolApprovalRequest')).toBe(false);
        expect(mockToolExecutor.execute).toHaveBeenCalledTimes(2);
      });
    });

    it('use_model: posts toolApprovalRequest and emits modelChanged after approval', async () => {
      mockToolExecutor.execute.mockResolvedValue({ success: true, message: 'Switched to model: anthropic/claude-opus-4-6' });

      const toolStream = createToolCallStream([
        { id: 'call_1', name: 'use_model', arguments: '{"model_id":"anthropic/claude-opus-4-6","reason":"Needs stronger reasoning"}' },
      ]);
      const stopStream = createMockStream([
        { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] },
      ]);
      mockClient.chatStream
        .mockReturnValueOnce(toolStream)
        .mockReturnValueOnce(stopStream);

      const postMessages: ExtensionMessage[] = [];
      const sendPromise = handler.handleMessage(
        { type: 'sendMessage', content: 'switch model', model: 'gpt-4' },
        (msg) => postMessages.push(msg)
      );

      await vi.waitFor(() => {
        expect(postMessages.some((m) => m.type === 'toolApprovalRequest')).toBe(true);
      }, { timeout: 1000 });

      const req = postMessages.find((m) => m.type === 'toolApprovalRequest') as Extract<ExtensionMessage, { type: 'toolApprovalRequest' }>;
      expect(req.toolName).toBe('use_model');
      expect(req.currentModel).toBe('gpt-4');

      await handler.handleMessage(
        { type: 'toolApprovalResponse', requestId: req.requestId, approved: true },
        (msg) => postMessages.push(msg)
      );

      await sendPromise;

      expect(postMessages.some((m) => m.type === 'modelChanged' && (m as any).modelId === 'anthropic/claude-opus-4-6')).toBe(true);
    });

    it('use_model: denied → no modelChanged posted', async () => {
      const toolStream = createToolCallStream([
        { id: 'call_1', name: 'use_model', arguments: '{"model_id":"anthropic/claude-opus-4-6"}' },
      ]);
      const stopStream = createMockStream([
        { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] },
      ]);
      mockClient.chatStream
        .mockReturnValueOnce(toolStream)
        .mockReturnValueOnce(stopStream);

      const postMessages: ExtensionMessage[] = [];
      const sendPromise = handler.handleMessage(
        { type: 'sendMessage', content: 'switch model', model: 'gpt-4' },
        (msg) => postMessages.push(msg)
      );

      await vi.waitFor(() => {
        expect(postMessages.some((m) => m.type === 'toolApprovalRequest')).toBe(true);
      }, { timeout: 1000 });

      const req = postMessages.find((m) => m.type === 'toolApprovalRequest') as Extract<ExtensionMessage, { type: 'toolApprovalRequest' }>;

      await handler.handleMessage(
        { type: 'toolApprovalResponse', requestId: req.requestId, approved: false },
        (msg) => postMessages.push(msg)
      );

      await sendPromise;

      expect(postMessages.some((m) => m.type === 'modelChanged')).toBe(false);
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

    it('strips tools on the final iteration and produces a text response instead of an error', async () => {
      // First 14 calls return tool_calls; the 15th (final) must return a stop response
      // because tools are stripped on the last iteration.
      const toolStream = () =>
        createToolCallStream([{ id: 'call_1', name: 'format_document', arguments: '{"uri":"file:///test.ts"}' }]);
      const finalStream = createMockStream([
        { choices: [{ delta: { content: 'Here is a summary of what I did.' }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
      ]);

      let callCount = 0;
      mockClient.chatStream.mockImplementation(() => {
        callCount++;
        return callCount < 15 ? toolStream() : finalStream;
      });

      await toolHandler.handleMessage(
        { type: 'sendMessage', content: 'loop forever', model: 'test-model' },
        postMessage
      );

      // Should resolve cleanly with streamEnd, not streamError
      expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'streamEnd' }));
      expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'streamError' }));
      // 15 iterations max
      expect(mockClient.chatStream).toHaveBeenCalledTimes(15);
      // Final call must NOT include tools (forces text response)
      const lastCallArgs = mockClient.chatStream.mock.calls[14][0];
      expect(lastCallArgs.tools).toBeUndefined();
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

  describe('MessageHandler — skill integration', () => {
    let mockSkillRegistry: {
      get: ReturnType<typeof vi.fn>;
      getSummaries: ReturnType<typeof vi.fn>;
      getAll: ReturnType<typeof vi.fn>;
    };
    let skillHandler: MessageHandler;

    beforeEach(() => {
      mockSkillRegistry = {
        get: vi.fn(),
        getSummaries: vi.fn().mockReturnValue([
          { name: 'tdd', description: 'Test-driven development approach' },
        ]),
        getAll: vi.fn().mockReturnValue([]),
      };

      skillHandler = new MessageHandler(
        mockClient as unknown as OpenRouterClient,
        mockContextBuilder as unknown as ContextBuilder,
        mockSettings as unknown as Settings,
        undefined,
        undefined,
        undefined,
        undefined,
        mockSkillRegistry as unknown as SkillRegistry
      );
    });

    it('handles use_skill tool call by returning skill content', async () => {
      const skillContent = 'Write tests first, then implementation.';
      mockSkillRegistry.get.mockImplementation((name: string) => {
        if (name === 'tdd') {
          return { name: 'tdd', description: 'Test-driven development approach', content: skillContent, source: 'local' };
        }
        return undefined;
      });

      const toolStream = createToolCallStream([
        { id: 'call_skill_1', name: 'use_skill', arguments: '{"name":"tdd"}' },
      ]);
      const stopStream = createMockStream([
        { choices: [{ delta: { content: 'Here is my tdd approach.' }, finish_reason: 'stop' }] },
      ]);
      mockClient.chatStream
        .mockReturnValueOnce(toolStream)
        .mockReturnValueOnce(stopStream);

      await skillHandler.handleMessage(
        { type: 'sendMessage', content: 'help me write tests', model: 'test-model' },
        postMessage
      );

      // The second chatStream call should include the tool result with skill content
      const secondCallMessages = mockClient.chatStream.mock.calls[1][0].messages;
      const toolResultMsg = secondCallMessages.find((m: any) => m.role === 'tool');
      expect(toolResultMsg).toBeDefined();
      expect(toolResultMsg.content).toBe(skillContent);
    });

    it('returns error message for unknown skill name', async () => {
      mockSkillRegistry.get.mockReturnValue(undefined);

      const toolStream = createToolCallStream([
        { id: 'call_skill_2', name: 'use_skill', arguments: '{"name":"unknown"}' },
      ]);
      const stopStream = createMockStream([
        { choices: [{ delta: { content: 'Skill not found.' }, finish_reason: 'stop' }] },
      ]);
      mockClient.chatStream
        .mockReturnValueOnce(toolStream)
        .mockReturnValueOnce(stopStream);

      await skillHandler.handleMessage(
        { type: 'sendMessage', content: 'use unknown skill', model: 'test-model' },
        postMessage
      );

      const secondCallMessages = mockClient.chatStream.mock.calls[1][0].messages;
      const toolResultMsg = secondCallMessages.find((m: any) => m.role === 'tool');
      expect(toolResultMsg).toBeDefined();
      expect(toolResultMsg.content).toContain('Skill not found: unknown');
    });

    it('includes skill advertisement in system message when registry has skills', async () => {
      mockSkillRegistry.get.mockReturnValue(undefined);
      mockClient.chatStream.mockReturnValue(
        createMockStream([
          { choices: [{ delta: { content: 'OK' }, finish_reason: 'stop' }] },
        ])
      );

      await skillHandler.handleMessage(
        { type: 'sendMessage', content: 'hello', model: 'test-model' },
        postMessage
      );

      const callArgs = mockClient.chatStream.mock.calls[0][0];
      const systemMessage = callArgs.messages.find((m: { role: string }) => m.role === 'system');
      expect(systemMessage).toBeDefined();
      expect(systemMessage.content).toContain('Available Skills');
      expect(systemMessage.content).toContain('tdd');
      expect(systemMessage.content).toContain('use_skill');
    });

    it('shows project-activated skills note in system prompt when getActivatedSkills returns names', async () => {
      mockContextBuilder.getActivatedSkills.mockReturnValue(['tdd']);
      mockClient.chatStream.mockReturnValue(
        createMockStream([
          { choices: [{ delta: { content: 'OK' }, finish_reason: 'stop' }] },
        ])
      );

      await skillHandler.handleMessage(
        { type: 'sendMessage', content: 'hello', model: 'test-model' },
        postMessage
      );

      const callArgs = mockClient.chatStream.mock.calls[0][0];
      const systemMessage = callArgs.messages.find((m: { role: string }) => m.role === 'system');
      expect(systemMessage).toBeDefined();
      expect(systemMessage.content).toContain('Project-activated skills');
      expect(systemMessage.content).toContain('tdd');
    });

    it('does not pre-inject skill content into user message content', async () => {
      const skillContent = 'Write tests first, then implementation.';
      mockSkillRegistry.get.mockImplementation((name: string) => {
        if (name === 'tdd') return { name: 'tdd', description: 'Test-driven development approach', content: skillContent, source: 'local' };
        return undefined;
      });
      mockClient.chatStream.mockReturnValue(
        createMockStream([
          { choices: [{ delta: { content: 'OK' }, finish_reason: 'stop' }] },
        ])
      );

      await skillHandler.handleMessage(
        { type: 'sendMessage', content: 'write some tdd tests', model: 'test-model' },
        postMessage
      );

      const callArgs = mockClient.chatStream.mock.calls[0][0];
      const userMsg = callArgs.messages.find((m: { role: string }) => m.role === 'user');
      expect(userMsg).toBeDefined();
      // Skill content must NOT be pre-injected — baseContent is just the raw user message
      expect(userMsg.content).not.toContain('<skill name="tdd">');
      expect(userMsg.content).not.toContain(skillContent);
      expect(userMsg.content).toContain('write some tdd tests');
    });

    it('posts skillsLoaded when registry has skills on ready', async () => {
      mockContextBuilder.buildEnrichedContext.mockResolvedValue(mockEnrichedContext);
      mockClient.listModels.mockResolvedValue(mockModels);

      await skillHandler.handleMessage({ type: 'ready' }, postMessage);

      expect(postMessage).toHaveBeenCalledWith({
        type: 'skillsLoaded',
        skills: [{ name: 'tdd', description: 'Test-driven development approach' }],
      });
    });

    it('does not post skillsLoaded when registry has no skills on ready', async () => {
      mockSkillRegistry.getSummaries.mockReturnValue([]);
      mockContextBuilder.buildEnrichedContext.mockResolvedValue(mockEnrichedContext);
      mockClient.listModels.mockResolvedValue(mockModels);

      await skillHandler.handleMessage({ type: 'ready' }, postMessage);

      const skillsLoadedCalls = (postMessage as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call: any[]) => call[0]?.type === 'skillsLoaded'
      );
      expect(skillsLoadedCalls).toHaveLength(0);
    });

    it('responds to getSkillContent with skill content when found', async () => {
      const skillContent = 'TDD workflow content.';
      mockSkillRegistry.get.mockImplementation((name: string) => {
        if (name === 'tdd') return { name: 'tdd', description: 'TDD', content: skillContent, source: 'local' };
        return undefined;
      });

      await skillHandler.handleMessage({ type: 'getSkillContent', name: 'tdd' }, postMessage);

      expect(postMessage).toHaveBeenCalledWith({
        type: 'skillContent',
        name: 'tdd',
        content: skillContent,
      });
    });

    it('responds to getSkillContent with null content when skill not found', async () => {
      mockSkillRegistry.get.mockReturnValue(undefined);

      await skillHandler.handleMessage({ type: 'getSkillContent', name: 'nonexistent' }, postMessage);

      expect(postMessage).toHaveBeenCalledWith({
        type: 'skillContent',
        name: 'nonexistent',
        content: null,
      });
    });
  });
});

describe('MessageHandler — MCP tool routing', () => {
  const postMessages: ExtensionMessage[] = [];
  const postMessage = (msg: ExtensionMessage) => postMessages.push(msg);

  function makeMcpManager(overrides: Partial<McpClientManager> = {}): McpClientManager {
    return {
      getTools: vi.fn().mockReturnValue([{
        type: 'function' as const,
        function: {
          name: 'mcp__filesystem__read_file',
          description: '[filesystem] Read a file',
          parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
        },
      }]),
      callTool: vi.fn().mockResolvedValue({ content: 'file contents', isError: false }),
      connect: vi.fn(),
      getStatus: vi.fn().mockReturnValue({ filesystem: 'connected' }),
      dispose: vi.fn(),
      ...overrides,
    } as unknown as McpClientManager;
  }

  function makeStreamWithToolCall(toolName: string, toolArgs: string): AsyncIterable<any> {
    const chunks = [
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_mcp_1', function: { name: toolName, arguments: toolArgs } }] }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
    ];
    let i = 0;
    return {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            if (i >= chunks.length) return { done: true as const, value: undefined };
            return { done: false as const, value: chunks[i++] };
          },
        };
      },
    };
  }

  beforeEach(() => { postMessages.length = 0; });

  it('includes MCP tools in the tool array sent to the model', async () => {
    const mcpManager = makeMcpManager();
    const mockClient = {
      chatStream: vi.fn().mockReturnValue((async function* () {
        yield { choices: [{ delta: { content: 'Hello' }, finish_reason: null }] };
        yield { choices: [{ delta: {}, finish_reason: 'stop' }] };
      })()),
      listModels: vi.fn().mockResolvedValue([]),
    } as unknown as OpenRouterClient;

    const mockContext = {
      buildEnrichedContext: vi.fn().mockResolvedValue({}),
      buildContext: vi.fn().mockReturnValue({}),
      formatEnrichedPrompt: vi.fn().mockReturnValue(''),
      getCapabilities: vi.fn().mockReturnValue({}),
      getCustomInstructions: vi.fn().mockReturnValue(''),
    } as unknown as ContextBuilder;
    const mockSettings = { temperature: 0.7, maxTokens: 4096, setChatModel: vi.fn() } as unknown as Settings;

    const handler = new MessageHandler(mockClient, mockContext, mockSettings, undefined, undefined, undefined, undefined, undefined, mcpManager);
    await handler.handleMessage({ type: 'sendMessage', content: 'Hello', model: 'claude-sonnet-4-6', images: [] }, postMessage);

    const callArgs = (mockClient.chatStream as any).mock.calls[0][0];
    expect(callArgs.tools).toBeDefined();
    expect(callArgs.tools.some((t: any) => t.function.name === 'mcp__filesystem__read_file')).toBe(true);
  });

  it('routes mcp__ tool calls to McpClientManager', async () => {
    const mcpManager = makeMcpManager();
    let streamCallCount = 0;
    const mockClient = {
      chatStream: vi.fn().mockImplementation(() => {
        streamCallCount++;
        if (streamCallCount === 1) {
          return makeStreamWithToolCall('mcp__filesystem__read_file', '{"path":"/tmp/test.txt"}');
        }
        return (async function* () {
          yield { choices: [{ delta: { content: 'Here is the file.' }, finish_reason: null }] };
          yield { choices: [{ delta: {}, finish_reason: 'stop' }] };
        })();
      }),
      listModels: vi.fn().mockResolvedValue([]),
    } as unknown as OpenRouterClient;

    const mockContext = {
      buildEnrichedContext: vi.fn().mockResolvedValue({}),
      buildContext: vi.fn().mockReturnValue({}),
      formatEnrichedPrompt: vi.fn().mockReturnValue(''),
      getCapabilities: vi.fn().mockReturnValue({}),
      getCustomInstructions: vi.fn().mockReturnValue(''),
    } as unknown as ContextBuilder;
    const mockSettings = { temperature: 0.7, maxTokens: 4096, setChatModel: vi.fn() } as unknown as Settings;

    const handler = new MessageHandler(mockClient, mockContext, mockSettings, undefined, undefined, undefined, undefined, undefined, mcpManager);
    await handler.handleMessage({ type: 'setAutonomousMode', enabled: true }, postMessage);
    await handler.handleMessage({ type: 'sendMessage', content: 'Read the file', model: 'claude-sonnet-4-6', images: [] }, postMessage);

    expect(mcpManager.callTool).toHaveBeenCalledWith('mcp__filesystem__read_file', { path: '/tmp/test.txt' });
    expect(postMessages.some((m) => m.type === 'streamEnd')).toBe(true);
  });

  it('includes error content in tool result when callTool returns isError:true', async () => {
    const mcpManager = makeMcpManager({
      callTool: vi.fn().mockResolvedValue({ content: 'Error: Permission denied', isError: true }),
    });
    let streamCallCount = 0;
    const mockClient = {
      chatStream: vi.fn().mockImplementation(() => {
        streamCallCount++;
        if (streamCallCount === 1) {
          return makeStreamWithToolCall('mcp__filesystem__read_file', '{}');
        }
        return (async function* () {
          yield { choices: [{ delta: { content: 'I could not read the file.' }, finish_reason: null }] };
          yield { choices: [{ delta: {}, finish_reason: 'stop' }] };
        })();
      }),
      listModels: vi.fn().mockResolvedValue([]),
    } as unknown as OpenRouterClient;

    const mockContext = {
      buildEnrichedContext: vi.fn().mockResolvedValue({}),
      buildContext: vi.fn().mockReturnValue({}),
      formatEnrichedPrompt: vi.fn().mockReturnValue(''),
      getCapabilities: vi.fn().mockReturnValue({}),
      getCustomInstructions: vi.fn().mockReturnValue(''),
    } as unknown as ContextBuilder;
    const mockSettings = { temperature: 0.7, maxTokens: 4096, setChatModel: vi.fn() } as unknown as Settings;

    const handler = new MessageHandler(mockClient, mockContext, mockSettings, undefined, undefined, undefined, undefined, undefined, mcpManager);
    await handler.handleMessage({ type: 'setAutonomousMode', enabled: true }, postMessage);
    await handler.handleMessage({ type: 'sendMessage', content: 'Read file', model: 'claude-sonnet-4-6', images: [] }, postMessage);

    // The error content should NOT have a double "Error: Error:" prefix
    const chatStreamSecondCall = (mockClient.chatStream as any).mock.calls[1][0];
    const toolResultMsg = chatStreamSecondCall.messages.find((m: any) => m.role === 'tool');
    expect(toolResultMsg).toBeDefined();
    expect(toolResultMsg.content).toBe('Error: Permission denied');
    expect(toolResultMsg.content).not.toMatch(/^Error: Error:/);
  });
});

describe('worktree integration', () => {
  let mockToolExecutor: { execute: ReturnType<typeof vi.fn> };
  let postMessages: ExtensionMessage[];

  const mockClient = {
    chatStream: vi.fn(),
    chat: vi.fn(),
    listModels: vi.fn().mockResolvedValue([]),
  };

  const mockContextBuilder = {
    buildContext: vi.fn().mockReturnValue({}),
    formatForPrompt: vi.fn().mockReturnValue(''),
    buildEnrichedContext: vi.fn().mockResolvedValue({}),
    formatEnrichedPrompt: vi.fn(() => ''),
    getCapabilities: vi.fn(() => undefined),
    getCustomInstructions: vi.fn(() => undefined),
  };

  const mockSettings = {
    setChatModel: vi.fn().mockResolvedValue(undefined),
    temperature: 0.7,
    maxTokens: 4096,
    autonomousMode: false,
  };

  const mockWorktreeManager = {
    create: vi.fn().mockResolvedValue(undefined),
    remapUri: vi.fn((u: string) => u),
    state: 'idle' as 'idle' | 'creating' | 'active' | 'finishing',
    finishSession: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.chatStream = vi.fn();
    mockClient.listModels = vi.fn().mockResolvedValue([]);
    mockContextBuilder.buildEnrichedContext = vi.fn().mockResolvedValue({});
    mockContextBuilder.formatEnrichedPrompt = vi.fn(() => '');
    mockContextBuilder.getCapabilities = vi.fn(() => undefined);
    mockContextBuilder.getCustomInstructions = vi.fn(() => undefined);
    mockToolExecutor = { execute: vi.fn().mockResolvedValue({ success: true, message: 'Done' }) };
    postMessages = [];

    // Reset mockWorktreeManager
    mockWorktreeManager.create.mockReset().mockResolvedValue(undefined);
    mockWorktreeManager.remapUri.mockReset().mockImplementation((u: string) => u);
    mockWorktreeManager.state = 'idle';
    mockWorktreeManager.finishSession.mockReset();
  });

  it('start_worktree tool call invokes worktreeManager.create() without approval gate', async () => {
    const handler = new MessageHandler(
      mockClient as unknown as OpenRouterClient,
      mockContextBuilder as unknown as ContextBuilder,
      mockSettings as unknown as Settings,
      mockToolExecutor as unknown as EditorToolExecutor,
    );
    handler.setWorktreeManager(mockWorktreeManager as any);

    const toolStream = createToolCallStream([
      { id: 'call_wt_1', name: 'start_worktree', arguments: '{}' },
    ]);
    const stopStream = createMockStream([
      { choices: [{ delta: { content: 'Worktree ready.' }, finish_reason: 'stop' }] },
    ]);
    mockClient.chatStream
      .mockReturnValueOnce(toolStream)
      .mockReturnValueOnce(stopStream);

    const msgs: ExtensionMessage[] = [];
    await handler.handleMessage(
      { type: 'sendMessage', content: 'start worktree', model: 'gpt-4' },
      (m) => msgs.push(m)
    );

    expect(mockWorktreeManager.create).toHaveBeenCalledOnce();
    // No approval gate — no toolApprovalRequest posted
    expect(msgs.some((m) => m.type === 'toolApprovalRequest')).toBe(false);
    // Tool result pushed back to conversation
    const secondCallMessages = mockClient.chatStream.mock.calls[1][0].messages;
    const toolResultMsg = secondCallMessages.find((m: any) => m.role === 'tool');
    expect(toolResultMsg).toBeDefined();
    expect(toolResultMsg.content).toContain('Worktree created');
  });

  it('active worktree: replace_range uri arg is remapped before execution', async () => {
    mockWorktreeManager.state = 'active';
    mockWorktreeManager.remapUri.mockImplementation((u: string) => u.replace('file:///workspace', 'file:///workspace/.worktrees/lucent-123'));

    const handler = new MessageHandler(
      mockClient as unknown as OpenRouterClient,
      mockContextBuilder as unknown as ContextBuilder,
      mockSettings as unknown as Settings,
      mockToolExecutor as unknown as EditorToolExecutor,
    );
    handler.setWorktreeManager(mockWorktreeManager as any);
    // Put handler in autonomous mode so no approval gate blocks execution
    await handler.handleMessage({ type: 'setAutonomousMode', enabled: true }, () => {});

    const toolStream = createToolCallStream([
      {
        id: 'call_rr_1',
        name: 'replace_range',
        arguments: JSON.stringify({
          uri: 'file:///workspace/src/foo.ts',
          startLine: 0, startCharacter: 0,
          endLine: 0, endCharacter: 5,
          code: 'hello',
        }),
      },
    ]);
    const stopStream = createMockStream([
      { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] },
    ]);
    mockClient.chatStream
      .mockReturnValueOnce(toolStream)
      .mockReturnValueOnce(stopStream);

    await handler.handleMessage(
      { type: 'sendMessage', content: 'replace code', model: 'gpt-4' },
      (m) => postMessages.push(m)
    );

    // remapUri was called with the original uri
    expect(mockWorktreeManager.remapUri).toHaveBeenCalledWith('file:///workspace/src/foo.ts');
    // toolExecutor received the remapped uri
    const executedArgs = mockToolExecutor.execute.mock.calls[0][1];
    expect(executedArgs.uri).toContain('.worktrees');
  });

  it('no active worktree: uri args pass through unchanged', async () => {
    // state remains 'idle' — no remapping
    const handler = new MessageHandler(
      mockClient as unknown as OpenRouterClient,
      mockContextBuilder as unknown as ContextBuilder,
      mockSettings as unknown as Settings,
      mockToolExecutor as unknown as EditorToolExecutor,
    );
    handler.setWorktreeManager(mockWorktreeManager as any);
    await handler.handleMessage({ type: 'setAutonomousMode', enabled: true }, () => {});

    const toolStream = createToolCallStream([
      {
        id: 'call_rr_2',
        name: 'replace_range',
        arguments: JSON.stringify({
          uri: 'file:///workspace/src/bar.ts',
          startLine: 0, startCharacter: 0,
          endLine: 0, endCharacter: 3,
          code: 'new',
        }),
      },
    ]);
    const stopStream = createMockStream([
      { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] },
    ]);
    mockClient.chatStream
      .mockReturnValueOnce(toolStream)
      .mockReturnValueOnce(stopStream);

    await handler.handleMessage(
      { type: 'sendMessage', content: 'replace', model: 'gpt-4' },
      (m) => postMessages.push(m)
    );

    // remapUri should NOT have been called since state is 'idle'
    expect(mockWorktreeManager.remapUri).not.toHaveBeenCalled();
    // toolExecutor received the original uri
    const executedArgs = mockToolExecutor.execute.mock.calls[0][1];
    expect(executedArgs.uri).toBe('file:///workspace/src/bar.ts');
  });

  it('startWorktree WebviewMessage triggers worktreeManager.create()', async () => {
    const handler = new MessageHandler(
      mockClient as unknown as OpenRouterClient,
      mockContextBuilder as unknown as ContextBuilder,
      mockSettings as unknown as Settings,
    );
    handler.setWorktreeManager(mockWorktreeManager as any);

    await handler.handleMessage({ type: 'startWorktree' }, (m) => postMessages.push(m));

    expect(mockWorktreeManager.create).toHaveBeenCalledWith(expect.any(String));
  });

  it('newChat calls finishSession() when worktree is active', async () => {
    mockWorktreeManager.state = 'active';
    mockWorktreeManager.finishSession.mockResolvedValue(undefined);

    const handler = new MessageHandler(
      mockClient as unknown as OpenRouterClient,
      mockContextBuilder as unknown as ContextBuilder,
      mockSettings as unknown as Settings,
    );
    handler.setWorktreeManager(mockWorktreeManager as any);

    await handler.handleMessage({ type: 'newChat' }, (m) => postMessages.push(m));

    expect(mockWorktreeManager.finishSession).toHaveBeenCalled();
  });

  it('setAutonomousMode(true) triggers worktreeManager.create() when a current conversation exists', async () => {
    const mockHistory = {
      create: vi.fn().mockResolvedValue({ id: 'conv-auto-1', title: 'New conversation', model: 'gpt-4', messages: [], createdAt: '', updatedAt: '' }),
      save: vi.fn().mockResolvedValue(undefined),
      load: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      delete: vi.fn(),
      exportAsJson: vi.fn(),
      exportAsMarkdown: vi.fn(),
    };

    const handler = new MessageHandler(
      mockClient as unknown as OpenRouterClient,
      mockContextBuilder as unknown as ContextBuilder,
      mockSettings as unknown as Settings,
      undefined,
      mockHistory as unknown as import('./history').ConversationHistory,
    );
    handler.setWorktreeManager(mockWorktreeManager as any);

    // Send a message first so currentConversation gets set
    mockClient.chatStream.mockReturnValueOnce(
      createMockStream([
        { choices: [{ delta: { content: 'hi' }, finish_reason: 'stop' }] },
      ])
    );
    await handler.handleMessage(
      { type: 'sendMessage', content: 'hello', model: 'gpt-4' },
      () => {}
    );

    // Now enable autonomous mode — should trigger create() because currentConversation is set
    await handler.handleMessage({ type: 'setAutonomousMode', enabled: true }, () => {});

    expect(mockWorktreeManager.create).toHaveBeenCalledOnce();
  });
});

describe('autonomous mode', () => {
  let mcpManager: McpClientManager;
  let mockToolExecutor: { execute: ReturnType<typeof vi.fn> };
  let postMessages: ExtensionMessage[];

  const mockClient = {
    chatStream: vi.fn(),
    chat: vi.fn(),
    listModels: vi.fn().mockResolvedValue([]),
  };

  const mockContextBuilder = {
    buildContext: vi.fn().mockReturnValue({}),
    formatForPrompt: vi.fn().mockReturnValue(''),
    buildEnrichedContext: vi.fn().mockResolvedValue({}),
    formatEnrichedPrompt: vi.fn(() => ''),
    getCapabilities: vi.fn(() => undefined),
    getCustomInstructions: vi.fn(() => undefined),
  };

  const mockSettings = {
    setChatModel: vi.fn().mockResolvedValue(undefined),
    temperature: 0.7,
    maxTokens: 4096,
    autonomousMode: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.chatStream = vi.fn();
    mockClient.listModels = vi.fn().mockResolvedValue([]);
    mockContextBuilder.buildEnrichedContext = vi.fn().mockResolvedValue({});
    mockContextBuilder.formatEnrichedPrompt = vi.fn(() => '');
    mockContextBuilder.getCapabilities = vi.fn(() => undefined);
    mockContextBuilder.getCustomInstructions = vi.fn(() => undefined);
    mcpManager = {
      getTools: vi.fn().mockReturnValue([]),
      callTool: vi.fn().mockResolvedValue({ content: 'mcp result', isError: false }),
      getStatus: vi.fn().mockReturnValue({}),
      dispose: vi.fn(),
    } as unknown as McpClientManager;
    mockToolExecutor = { execute: vi.fn().mockResolvedValue({ success: true, message: 'Done' }) };
    postMessages = [];
  });

  it('setAutonomousMode message updates _autonomousMode', async () => {
    const handler = new MessageHandler(
      mockClient as unknown as OpenRouterClient,
      mockContextBuilder as unknown as ContextBuilder,
      mockSettings as unknown as Settings,
      undefined, undefined, undefined, undefined, undefined,
      mcpManager,
    );
    await handler.handleMessage({ type: 'setAutonomousMode', enabled: true }, (m) => postMessages.push(m));
    expect(postMessages.length).toBe(0);
  });

  it('MCP tool call, autonomous mode off → requestToolApproval called', async () => {
    const handler = new MessageHandler(
      mockClient as unknown as OpenRouterClient,
      mockContextBuilder as unknown as ContextBuilder,
      mockSettings as unknown as Settings,
      undefined, undefined, undefined, undefined, undefined,
      mcpManager,
    );

    mockClient.chatStream.mockReturnValue(
      createToolCallStream([{ id: 'call_1', name: 'mcp__fs__read', arguments: '{}' }])
    );

    const sendPromise = handler.handleMessage(
      { type: 'sendMessage', content: 'go', model: 'gpt-4' },
      (m) => postMessages.push(m)
    );

    await vi.waitFor(() => {
      expect(postMessages.some((m) => m.type === 'toolApprovalRequest')).toBe(true);
    }, { timeout: 1000 });

    const req = postMessages.find((m) => m.type === 'toolApprovalRequest') as Extract<ExtensionMessage, { type: 'toolApprovalRequest' }>;
    await handler.handleMessage({ type: 'toolApprovalResponse', requestId: req.requestId, approved: true }, () => {});
    await sendPromise;

    expect(mcpManager.callTool).toHaveBeenCalledWith('mcp__fs__read', {});
  });

  it('MCP tool call, autonomous mode on → callTool runs directly, no approval', async () => {
    const handler = new MessageHandler(
      mockClient as unknown as OpenRouterClient,
      mockContextBuilder as unknown as ContextBuilder,
      mockSettings as unknown as Settings,
      undefined, undefined, undefined, undefined, undefined,
      mcpManager,
    );

    await handler.handleMessage({ type: 'setAutonomousMode', enabled: true }, () => {});

    mockClient.chatStream.mockReturnValue(
      createToolCallStream([{ id: 'call_1', name: 'mcp__fs__read', arguments: '{}' }])
    );

    await handler.handleMessage(
      { type: 'sendMessage', content: 'go', model: 'gpt-4' },
      (m) => postMessages.push(m)
    );

    expect(postMessages.some((m) => m.type === 'toolApprovalRequest')).toBe(false);
    expect(mcpManager.callTool).toHaveBeenCalledWith('mcp__fs__read', {});
  });

  it('gated editor tool, autonomous mode on → executes directly, no approval', async () => {
    const handler = new MessageHandler(
      mockClient as unknown as OpenRouterClient,
      mockContextBuilder as unknown as ContextBuilder,
      mockSettings as unknown as Settings,
      mockToolExecutor as unknown as EditorToolExecutor,
      undefined, undefined, undefined, undefined,
      mcpManager,
    );

    await handler.handleMessage({ type: 'setAutonomousMode', enabled: true }, () => {});

    mockClient.chatStream.mockReturnValue(
      createToolCallStream([{ id: 'call_1', name: 'rename_symbol', arguments: '{"uri":"file:///test.ts","line":0,"character":0,"newName":"foo"}' }])
    );

    await handler.handleMessage(
      { type: 'sendMessage', content: 'rename it', model: 'gpt-4' },
      (m) => postMessages.push(m)
    );

    expect(postMessages.some((m) => m.type === 'toolApprovalRequest')).toBe(false);
    expect(mockToolExecutor.execute).toHaveBeenCalledWith('rename_symbol', expect.any(Object));
  });

  it('approval-gated editor tool (write_file), autonomous mode on → executes directly, no approval', async () => {
    const handler = new MessageHandler(
      mockClient as unknown as OpenRouterClient,
      mockContextBuilder as unknown as ContextBuilder,
      mockSettings as unknown as Settings,
      mockToolExecutor as unknown as EditorToolExecutor,
      undefined, undefined, undefined, undefined,
      mcpManager,
    );

    await handler.handleMessage({ type: 'setAutonomousMode', enabled: true }, () => {});

    mockClient.chatStream.mockReturnValue(
      createToolCallStream([{ id: 'call_1', name: 'write_file', arguments: '{"path":"src/foo.ts","content":"export {}"}' }])
    );

    await handler.handleMessage(
      { type: 'sendMessage', content: 'write a file', model: 'gpt-4' },
      (m) => postMessages.push(m)
    );

    expect(postMessages.some((m) => m.type === 'toolApprovalRequest')).toBe(false);
    expect(mockToolExecutor.execute).toHaveBeenCalledWith('write_file', expect.any(Object));
  });
});

describe('@codebase mention', () => {
  const mockClient = {
    chatStream: vi.fn(),
    chat: vi.fn(),
    listModels: vi.fn().mockResolvedValue([]),
  };

  const mockContextBuilder = {
    buildContext: vi.fn().mockReturnValue({}),
    formatForPrompt: vi.fn().mockReturnValue(''),
    buildEnrichedContext: vi.fn().mockResolvedValue({}),
    formatEnrichedPrompt: vi.fn(() => ''),
    getCapabilities: vi.fn(() => undefined),
    getCustomInstructions: vi.fn(() => undefined),
  };

  const mockSettings = {
    setChatModel: vi.fn().mockResolvedValue(undefined),
    temperature: 0.7,
    maxTokens: 4096,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.chatStream = vi.fn().mockImplementation(async function* () {
      yield { choices: [{ delta: { content: 'result' }, finish_reason: 'stop' }] };
    });
    mockContextBuilder.buildEnrichedContext = vi.fn().mockResolvedValue({});
    mockContextBuilder.formatEnrichedPrompt = vi.fn(() => '');
    mockContextBuilder.getCapabilities = vi.fn(() => undefined);
    mockContextBuilder.getCustomInstructions = vi.fn(() => undefined);
  });

  it('injects codebase-context into system message when indexer returns results', async () => {
    const mockIndexer = {
      searchAsync: vi.fn(() =>
        Promise.resolve([
          { filePath: 'src/auth.ts', startLine: 0, endLine: 10, content: 'export class AuthManager {}', score: 0.9 },
        ])
      ),
    };

    const handler = new MessageHandler(
      mockClient as unknown as OpenRouterClient,
      mockContextBuilder as unknown as ContextBuilder,
      mockSettings as unknown as Settings,
      undefined, undefined, undefined, undefined, undefined, undefined,
      mockIndexer as any
    );

    await handler.handleMessage(
      { type: 'sendMessage', content: '@codebase find auth logic', images: [], model: 'gpt-4o' },
      vi.fn()
    );

    expect(mockIndexer.searchAsync).toHaveBeenCalledWith('find auth logic', 8);

    const callArgs = mockClient.chatStream.mock.calls[0][0];
    const systemMessage = callArgs.messages.find((m: any) => m.role === 'system');
    expect(systemMessage).toBeDefined();
    expect(systemMessage.content).toContain('<codebase-context');
    expect(systemMessage.content).toContain('src/auth.ts');
  });

  it('sends query as user message content (strips @codebase prefix)', async () => {
    const mockIndexer = {
      searchAsync: vi.fn(() => Promise.resolve([])),
    };

    const handler = new MessageHandler(
      mockClient as unknown as OpenRouterClient,
      mockContextBuilder as unknown as ContextBuilder,
      mockSettings as unknown as Settings,
      undefined, undefined, undefined, undefined, undefined, undefined,
      mockIndexer as any
    );

    await handler.handleMessage(
      { type: 'sendMessage', content: '@codebase find auth logic', images: [], model: 'gpt-4o' },
      vi.fn()
    );

    const callArgs = mockClient.chatStream.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: any) => m.role === 'user');
    expect(userMessage.content).toBe('find auth logic');
  });

  it('does not crash when indexer is undefined', async () => {
    const handler = new MessageHandler(
      mockClient as unknown as OpenRouterClient,
      mockContextBuilder as unknown as ContextBuilder,
      mockSettings as unknown as Settings,
    );

    await expect(
      handler.handleMessage(
        { type: 'sendMessage', content: '@codebase find something', images: [], model: 'gpt-4o' },
        vi.fn()
      )
    ).resolves.not.toThrow();

    const callArgs = mockClient.chatStream.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: any) => m.role === 'user');
    // Without indexer, processedContent stays as original content
    expect(userMessage.content).toBe('@codebase find something');
  });
});

describe('compactConversation', () => {
  let handler: MessageHandler;
  let mockClient: {
    chatStream: ReturnType<typeof vi.fn>;
    chat: ReturnType<typeof vi.fn>;
    listModels: ReturnType<typeof vi.fn>;
  };
  let mockContextBuilder: {
    buildContext: ReturnType<typeof vi.fn>;
    formatForPrompt: ReturnType<typeof vi.fn>;
    buildEnrichedContext: ReturnType<typeof vi.fn>;
    formatEnrichedPrompt: ReturnType<typeof vi.fn>;
    getCapabilities: ReturnType<typeof vi.fn>;
    getCustomInstructions: ReturnType<typeof vi.fn>;
    getActivatedSkills: ReturnType<typeof vi.fn>;
  };
  let mockSettings: {
    setChatModel: ReturnType<typeof vi.fn>;
    temperature: number;
    maxTokens: number;
  };
  let postMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockClient = {
      chatStream: vi.fn(),
      chat: vi.fn(),
      listModels: vi.fn().mockResolvedValue([]),
    };

    mockContextBuilder = {
      buildContext: vi.fn().mockReturnValue({}),
      formatForPrompt: vi.fn().mockReturnValue(''),
      buildEnrichedContext: vi.fn().mockResolvedValue({}),
      formatEnrichedPrompt: vi.fn(() => ''),
      getCapabilities: vi.fn(() => undefined),
      getCustomInstructions: vi.fn(() => undefined),
      getActivatedSkills: vi.fn(() => []),
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

  it('calls client.chat with a summarization prompt and replaces conversation, then posts conversationCompacted', async () => {
    // Populate conversationMessages with one turn
    mockClient.chatStream.mockReturnValue(
      (async function* () {
        yield { choices: [{ delta: { content: 'Hello' } }] };
      })()
    );
    await handler.handleMessage(
      { type: 'sendMessage', content: 'What is 2+2?', model: 'test-model' },
      postMessage
    );
    postMessage.mockClear();

    // Now compact
    mockClient.chat = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'We discussed basic arithmetic.' } }],
    });

    await handler.handleMessage(
      { type: 'compactConversation', model: 'test-model' },
      postMessage
    );

    expect(mockClient.chat).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'conversationCompacted', summary: 'We discussed basic arithmetic.' })
    );

    // Verify conversationMessages was replaced: a subsequent sendMessage should
    // call chatStream with only the compacted summary entry (+ system message),
    // not the original multi-turn history.
    mockClient.chatStream.mockClear();
    mockClient.chatStream.mockReturnValue(
      (async function* () {
        yield { choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] };
      })()
    );
    postMessage.mockClear();
    await handler.handleMessage(
      { type: 'sendMessage', content: 'follow-up', model: 'test-model' },
      postMessage
    );
    const streamCall = mockClient.chatStream.mock.calls[0][0] as { messages: { role: string; content: string }[] };
    // messages = [system, compacted-user, new-user] — compacted entry is index 1
    const compactedEntry = streamCall.messages[1];
    expect(compactedEntry.role).toBe('user');
    expect(compactedEntry.content).toContain('We discussed basic arithmetic.');
    // The history must not include the original pre-compact messages (only 3 entries total)
    expect(streamCall.messages).toHaveLength(3);
  });

  it('posts conversationCompacted with fallback message if chat call fails', async () => {
    mockClient.chat = vi.fn().mockRejectedValue(new Error('API error'));

    await handler.handleMessage(
      { type: 'compactConversation', model: 'test-model' },
      postMessage
    );

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'conversationCompacted',
        summary: expect.stringContaining('[Compaction failed'),
      })
    );
  });

  describe('listFiles', () => {
    it('returns matching workspace files', async () => {
      const mockUri = { fsPath: '/workspace/src/foo.ts' };
      vi.mocked(vscode.workspace.findFiles).mockResolvedValueOnce([mockUri as any]);
      Object.defineProperty(vscode.workspace, 'workspaceFolders', {
        value: [{ uri: { fsPath: '/workspace' } }],
        configurable: true,
      });

      await handler.handleMessage({ type: 'listFiles', query: 'foo' }, postMessage);

      expect(postMessage).toHaveBeenCalledWith({
        type: 'fileList',
        files: [{ name: 'foo.ts', relativePath: 'src/foo.ts' }],
      });
    });

    it('returns empty array when no workspace folder', async () => {
      Object.defineProperty(vscode.workspace, 'workspaceFolders', {
        value: undefined,
        configurable: true,
      });

      await handler.handleMessage({ type: 'listFiles', query: 'anything' }, postMessage);

      expect(postMessage).toHaveBeenCalledWith({ type: 'fileList', files: [] });
    });
  });

  describe('readFileForAttachment', () => {
    it('returns file content', async () => {
      const content = 'export const foo = 1;';
      Object.defineProperty(vscode.workspace, 'workspaceFolders', {
        value: [{ uri: { fsPath: '/workspace', toString: () => 'file:///workspace' } }],
        configurable: true,
      });
      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValueOnce(
        new TextEncoder().encode(content) as any
      );

      await handler.handleMessage({ type: 'readFileForAttachment', relativePath: 'src/foo.ts' }, postMessage);

      expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: 'fileAttachment',
        name: 'foo.ts',
        relativePath: 'src/foo.ts',
        content,
      }));
    });

    it('returns error when no workspace', async () => {
      Object.defineProperty(vscode.workspace, 'workspaceFolders', {
        value: undefined,
        configurable: true,
      });

      await handler.handleMessage({ type: 'readFileForAttachment', relativePath: 'src/foo.ts' }, postMessage);

      expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: 'fileAttachment',
        error: expect.any(String),
      }));
    });
  });
});
