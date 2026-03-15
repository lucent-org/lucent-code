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
import { InstructionsLoader } from './core/instructions-loader';

export async function activate(context: vscode.ExtensionContext) {
  // Initialize core modules
  const auth = new AuthManager(context.secrets);
  const settings = new Settings();
  const client = new OpenRouterClient(() => auth.getApiKey());
  const contextBuilder = new ContextBuilder();

  // Set up instructions loader
  const instructionsLoader = new InstructionsLoader();
  await instructionsLoader.load();
  instructionsLoader.watch();
  contextBuilder.setInstructionsLoader(instructionsLoader);

  // Set up code intelligence
  const codeIntelligence = new CodeIntelligence();
  const capabilityDetector = new CapabilityDetector();
  const toolExecutor = new EditorToolExecutor();
  contextBuilder.setCodeIntelligence(codeIntelligence, capabilityDetector);

  const history = new ConversationHistory(context.globalStorageUri);

  const notifications = new NotificationService();
  const messageHandler = new MessageHandler(client, contextBuilder, settings, toolExecutor, history, notifications);

  // Set up webview message handling
  const setupWebviewMessaging = () => {
    const webview = chatProvider.getWebview();
    if (!webview) return;

    webview.onDidReceiveMessage(async (message: WebviewMessage) => {
      const postMessage = (msg: unknown) => webview.postMessage(msg);
      await messageHandler.handleMessage(message, postMessage);
    });
  };

  // Register chat webview
  const chatProvider = new ChatViewProvider(context.extensionUri);
  chatProvider.onResolve = setupWebviewMessaging;
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

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

  // Context menu actions
  const makeContextAction = (
    action: 'explain' | 'fix' | 'improve',
    newChat: boolean
  ) => async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) return;

    const selection = editor.document.getText(editor.selection);
    const lang = editor.document.languageId;
    const labels = { explain: 'Explain', fix: 'Fix', improve: 'Improve' } as const;
    const content = `${labels[action]} this code:\n\`\`\`${lang}\n${selection}\n\`\`\``;

    await vscode.commands.executeCommand('openRouterChat.chatView.focus');
    chatProvider.postMessageToWebview({ type: 'triggerSend', content, newChat });
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('openRouterChat.explainCode', makeContextAction('explain', false)),
    vscode.commands.registerCommand('openRouterChat.explainCodeNew', makeContextAction('explain', true)),
    vscode.commands.registerCommand('openRouterChat.fixCode', makeContextAction('fix', false)),
    vscode.commands.registerCommand('openRouterChat.fixCodeNew', makeContextAction('fix', true)),
    vscode.commands.registerCommand('openRouterChat.improveCode', makeContextAction('improve', false)),
    vscode.commands.registerCommand('openRouterChat.improveCodeNew', makeContextAction('improve', true)),
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
      instructionsLoader.dispose();
    },
  });
}

export function deactivate() {}
