import * as vscode from 'vscode';
import { AuthManager } from './core/auth';
import { Settings } from './core/settings';
import { OpenRouterClient } from './core/openrouter-client';
import { ContextBuilder } from './core/context-builder';
import { ChatViewProvider } from './chat/chat-provider';
import { MessageHandler } from './chat/message-handler';
import type { WebviewMessage } from './shared/types';
import { InlineCompletionProvider } from './completions/inline-provider';
import { CodeIntelligence } from './lsp/code-intelligence';
import { CapabilityDetector } from './lsp/capability-detector';
import { EditorToolExecutor } from './lsp/editor-tools';
import { ConversationHistory } from './chat/history';
import { NotificationService } from './core/notifications';

export function activate(context: vscode.ExtensionContext) {
  // Initialize core modules
  const auth = new AuthManager(context.secrets);
  const settings = new Settings();
  const client = new OpenRouterClient(() => auth.getApiKey());
  const contextBuilder = new ContextBuilder();

  // Set up code intelligence
  const codeIntelligence = new CodeIntelligence();
  const capabilityDetector = new CapabilityDetector();
  const toolExecutor = new EditorToolExecutor();
  contextBuilder.setCodeIntelligence(codeIntelligence, capabilityDetector);

  const history = new ConversationHistory(context.globalStorageUri);

  const notifications = new NotificationService();
  const messageHandler = new MessageHandler(client, contextBuilder, settings, toolExecutor, history, notifications);

  // Register chat webview
  const chatProvider = new ChatViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // Set up webview message handling
  const setupWebviewMessaging = () => {
    const webview = chatProvider.getWebview();
    if (!webview) return;

    webview.onDidReceiveMessage(async (message: WebviewMessage) => {
      const postMessage = (msg: unknown) => webview.postMessage(msg);
      await messageHandler.handleMessage(message, postMessage);
    });
  };

  // Re-setup messaging when webview becomes available
  const originalResolve = chatProvider.resolveWebviewView.bind(chatProvider);
  chatProvider.resolveWebviewView = function (
    webviewView: vscode.WebviewView,
    resolveContext: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
  ) {
    originalResolve(webviewView, resolveContext, token);
    setupWebviewMessaging();
  };

  // Register inline completion provider
  const completionProvider = new InlineCompletionProvider(client, settings);
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      { pattern: '**' },
      completionProvider
    )
  );

  // Register manual trigger command
  context.subscriptions.push(
    vscode.commands.registerCommand('openRouterChat.triggerCompletion', () => {
      vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
    })
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('openRouterChat.setApiKey', () => {
      auth.promptForApiKey();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('openRouterChat.newChat', () => {
      messageHandler.handleMessage({ type: 'newChat' }, () => {});
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('openRouterChat.focusChat', () => {
      vscode.commands.executeCommand('openRouterChat.chatView.focus');
    })
  );

  // Prompt for API key on first activation if not set
  auth.getApiKey().then((key) => {
    if (!key) {
      vscode.window
        .showInformationMessage(
          'Welcome to OpenRouter Chat! Set your API key to get started.',
          'Set API Key'
        )
        .then((selection) => {
          if (selection === 'Set API Key') {
            auth.promptForApiKey();
          }
        });
    }
  });

  // Detect capabilities when active editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      contextBuilder.detectCapabilities();
    })
  );

  // Initial capability detection
  contextBuilder.detectCapabilities();

  // Cleanup
  context.subscriptions.push({
    dispose: () => {
      auth.dispose();
      completionProvider.dispose();
    },
  });
}

export function deactivate() {}
