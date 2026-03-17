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
import { TerminalBuffer } from './core/terminal-buffer';
import { messageText } from './core/message-text';

interface GitExtension {
  getAPI(version: 1): GitAPI;
}
interface GitAPI {
  repositories: Array<{
    diff(staged: boolean): Promise<string>;
    inputBox: { value: string };
  }>;
}

let messageHandler: MessageHandler | undefined;

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
  const toolExecutor = new EditorToolExecutor(() => auth.getTavilyApiKey());
  contextBuilder.setCodeIntelligence(codeIntelligence, capabilityDetector);

  const history = new ConversationHistory(context.globalStorageUri);

  const notifications = new NotificationService();
  const terminalBuffer = new TerminalBuffer();

  // Auth status bar item
  const authStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
  authStatusBar.command = 'lucentCode.authMenu';
  context.subscriptions.push(authStatusBar);

  const updateAuthStatus = async () => {
    const isAuthed = await auth.isAuthenticated();
    if (isAuthed) {
      authStatusBar.text = '$(key) OpenRouter';
      authStatusBar.tooltip = 'OpenRouter: Signed in — click to manage';
      authStatusBar.backgroundColor = undefined;
    } else {
      authStatusBar.text = '$(warning) OpenRouter: No API key';
      authStatusBar.tooltip = 'OpenRouter: Not signed in — click to set up';
      authStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
    authStatusBar.show();
  };

  // Update status bar on auth changes
  context.subscriptions.push(
    auth.onDidChangeAuth(() => updateAuthStatus())
  );

  // Set initial state
  void updateAuthStatus();

  messageHandler = new MessageHandler(client, contextBuilder, settings, toolExecutor, history, notifications, terminalBuffer);
  const handler = messageHandler;
  handler.onStreamEnd = () => {
    if (!chatProvider.isVisible) {
      vscode.window.showInformationMessage('Response ready');
    }
  };

  // Set up webview message handling
  const setupWebviewMessaging = () => {
    const webview = chatProvider.getWebview();
    if (!webview) return;

    webview.onDidReceiveMessage(async (message: WebviewMessage) => {
      const postMessage = (msg: unknown) => webview.postMessage(msg);
      await handler.handleMessage(message, postMessage);
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
    vscode.commands.registerCommand('lucentCode.triggerCompletion', () => {
      vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
    })
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('lucentCode.setApiKey', () => {
      auth.promptForApiKey();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('lucentCode.setTavilyApiKey', () => {
      auth.promptForTavilyApiKey();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('lucentCode.newChat', () => {
      handler.handleMessage({ type: 'newChat' }, () => {});
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('lucentCode.importConversation', async () => {
      const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'JSON': ['json'] },
        openLabel: 'Import Conversation',
      });
      if (!picked || picked.length === 0) return;

      try {
        const bytes = await vscode.workspace.fs.readFile(picked[0]);
        const json = new TextDecoder().decode(bytes);
        const imported = await history.importFromJson(json);
        vscode.window.showInformationMessage(`Conversation imported: "${imported.title}"`);
        // Refresh conversation list in webview if it's open
        const conversations = await history.list();
        chatProvider.postMessageToWebview({ type: 'conversationList', conversations });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Import failed: ${msg}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('lucentCode.focusChat', () => {
      vscode.commands.executeCommand('lucentCode.chatView.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('lucentCode.signOut', async () => {
      await auth.signOut();
      vscode.window.showInformationMessage('Signed out of OpenRouter.');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('lucentCode.authMenu', async () => {
      const isAuthed = await auth.isAuthenticated();
      const options = isAuthed
        ? ['Set API Key', 'Sign in with OAuth', 'Sign out']
        : ['Set API Key', 'Sign in with OAuth'];

      const choice = await vscode.window.showQuickPick(options, {
        placeHolder: isAuthed ? 'OpenRouter: Signed in' : 'OpenRouter: Not signed in',
      });

      if (choice === 'Set API Key') auth.promptForApiKey();
      else if (choice === 'Sign in with OAuth') auth.startOAuth();
      else if (choice === 'Sign out') {
        await auth.signOut();
        vscode.window.showInformationMessage('Signed out of OpenRouter.');
      }
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

    await vscode.commands.executeCommand('lucentCode.chatView.focus');
    chatProvider.postMessageToWebview({ type: 'triggerSend', content, newChat });
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('lucentCode.explainCode', makeContextAction('explain', false)),
    vscode.commands.registerCommand('lucentCode.explainCodeNew', makeContextAction('explain', true)),
    vscode.commands.registerCommand('lucentCode.fixCode', makeContextAction('fix', false)),
    vscode.commands.registerCommand('lucentCode.fixCodeNew', makeContextAction('fix', true)),
    vscode.commands.registerCommand('lucentCode.improveCode', makeContextAction('improve', false)),
    vscode.commands.registerCommand('lucentCode.improveCodeNew', makeContextAction('improve', true)),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('lucentCode.generateCommitMessage', async () => {
      const gitExt = vscode.extensions.getExtension<GitExtension>('vscode.git');
      if (!gitExt) {
        vscode.window.showInformationMessage('Git extension not found.');
        return;
      }
      const git = gitExt.exports.getAPI(1);
      const repo = git.repositories[0];
      if (!repo) {
        vscode.window.showInformationMessage('No Git repository found.');
        return;
      }
      const diff = await repo.diff(true);
      if (!diff.trim()) {
        vscode.window.showInformationMessage('No staged changes to generate a message from.');
        return;
      }
      const key = await auth.ensureAuthenticated();
      if (!key) return;
      const model = settings.chatModel || 'anthropic/claude-haiku-4-5-20251001';
      try {
        const response = await client.chat({
          model,
          messages: [{
            role: 'user',
            content: `Write a concise conventional commit message for this staged diff. Return only the commit message line, no explanation, no markdown.\n\n${diff}`,
          }],
          temperature: 0.3,
          max_tokens: 100,
        });
        const message = messageText(response.choices[0]?.message?.content ?? '').trim();
        if (message) repo.inputBox.value = message;
      } catch (error) {
        await notifications.handleError(error instanceof Error ? error.message : String(error));
      }
    })
  );

  // Prompt for API key on first activation if not set
  auth.getApiKey().then((key) => {
    if (!key) {
      vscode.window
        .showInformationMessage(
          'Welcome to Lucent Code! Set your API key to get started.',
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
      terminalBuffer.dispose();
    },
  });
}

export function deactivate() {
  messageHandler?.abort();
}
