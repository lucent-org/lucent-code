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
import { SkillRegistry } from './skills/skill-registry';
import { fetchGitHubSkills } from './skills/sources/github-source';
import { fetchNpmSkills } from './skills/sources/npm-source';
import { fetchMarketplaceSkills } from './skills/sources/marketplace-source';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as nodePath from 'path';
import { McpClientManager } from './mcp/mcp-client-manager';
import { loadMcpConfig } from './mcp/mcp-config-loader';
import { WorktreeManager } from './core/worktree-manager';
import { Indexer } from './search/indexer';

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

  // Initialize skill registry
  const skillRegistry = new SkillRegistry();

  async function loadSkills(): Promise<void> {
    const sources = settings.skillSources;
    const ownMarkdowns: string[] = [];

    for (const src of sources) {
      try {
        if (src.type === 'github' && src.url) {
          ownMarkdowns.push(...await fetchGitHubSkills(src.url));
        } else if (src.type === 'npm' && src.package) {
          ownMarkdowns.push(...await fetchNpmSkills(src.package));
        } else if (src.type === 'marketplace' && src.slug) {
          ownMarkdowns.push(...await fetchMarketplaceSkills(src.slug, src.version));
        } else if (src.type === 'local' && src.path) {
          const expandedPath = src.path.replace(/^~/, os.homedir());
          const files = await fs.readdir(expandedPath).catch(() => [] as string[]);
          for (const file of files) {
            if (typeof file === 'string' && file.endsWith('.md')) {
              const content = await fs.readFile(nodePath.join(expandedPath, file), 'utf8').catch(() => '');
              if (content) ownMarkdowns.push(content);
            }
          }
        }
      } catch {
        // skip failing source — registry still loads from other sources
      }
    }

    const preloaded = ownMarkdowns.length > 0
      ? [{ type: 'local' as const, content: new Map(ownMarkdowns.map((md, i) => [String(i), md])) }]
      : [];
    await skillRegistry.load(preloaded);
  }

  // Non-critical: don't let skill loading crash activation
  await loadSkills().catch((e: unknown) =>
    console.warn('[Lucent Code] Failed to load skills:', e instanceof Error ? e.message : String(e))
  );

  // Register chat webview
  const chatProvider = new ChatViewProvider(context.extensionUri);

  // Initialize MCP client
  const mcpClientManager = new McpClientManager();

  function postMcpStatus(): void {
    const status = mcpClientManager.getStatus();
    if (Object.keys(status).length > 0) {
      chatProvider.postMessageToWebview({ type: 'mcpStatus', servers: status });
    }
  }
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const indexer = new Indexer(() => auth.getApiKey());

  async function connectMcpServers(): Promise<void> {
    const servers = await loadMcpConfig(workspaceRoot);
    if (servers.size === 0) return;
    await mcpClientManager.connect(servers);
  }

  // Non-critical: don't let MCP connection crash activation
  await connectMcpServers().catch((e: unknown) =>
    console.warn('[Lucent Code] Failed to connect MCP servers:', e instanceof Error ? e.message : String(e))
  );

  if (workspaceRoot) {
    indexer.start(workspaceRoot)
      .then(() => { indexerStatusBar.text = '$(database) Indexed'; })
      .catch((e: Error) => {
        console.error('[Indexer] Failed to start:', e instanceof Error ? e.message : String(e));
        indexerStatusBar.text = '$(warning) Index failed';
      });
  }

  if (workspaceRoot) {
    const mcpWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(workspaceRoot, '.mcp.json')
    );
    let reconnecting = false;
    const reconnect = async () => {
      if (reconnecting) return;
      reconnecting = true;
      try {
        mcpClientManager.dispose();
        await connectMcpServers();
        postMcpStatus();
      } finally {
        reconnecting = false;
      }
    };
    context.subscriptions.push(
      mcpWatcher,
      mcpWatcher.onDidCreate(reconnect),
      mcpWatcher.onDidChange(reconnect),
      mcpWatcher.onDidDelete(reconnect),
    );
  }

  const contextBuilder = new ContextBuilder();

  // Set up instructions loader
  const instructionsLoader = new InstructionsLoader();
  await instructionsLoader.load().catch((e: unknown) =>
    console.warn('[Lucent Code] Failed to load instructions:', e instanceof Error ? e.message : String(e))
  );
  instructionsLoader.watch();
  contextBuilder.setInstructionsLoader(instructionsLoader);

  // Set up code intelligence
  const codeIntelligence = new CodeIntelligence();
  const capabilityDetector = new CapabilityDetector();
  const toolExecutor = new EditorToolExecutor(() => auth.getTavilyApiKey(), indexer);
  contextBuilder.setCodeIntelligence(codeIntelligence, capabilityDetector);

  const history = new ConversationHistory(context.globalStorageUri);

  const notifications = new NotificationService();
  const terminalBuffer = new TerminalBuffer();

  // Auth status bar item
  const authStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
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

  // Skills status bar
  const skillsStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 89);
  context.subscriptions.push(skillsStatusBar);

  function updateSkillsStatus(): void {
    const count = skillRegistry.getAll().length;
    if (count > 0) {
      skillsStatusBar.text = `$(book) ${count} skills`;
      skillsStatusBar.tooltip = `Lucent Code: ${count} skills loaded — click to browse`;
      skillsStatusBar.command = 'lucentCode.browseSkills';
      skillsStatusBar.show();
      setTimeout(() => skillsStatusBar.hide(), 5000);
    }
  }
  updateSkillsStatus();

  // Indexer status bar
  const indexerStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 88);
  indexerStatusBar.command = 'lucentCode.indexCodebase';
  indexerStatusBar.text = '$(loading~spin) Indexing…';
  indexerStatusBar.tooltip = 'Lucent Code: Codebase index — click to re-index';
  indexerStatusBar.show();
  context.subscriptions.push(indexerStatusBar);

  messageHandler = new MessageHandler(client, contextBuilder, settings, toolExecutor, history, notifications, terminalBuffer, skillRegistry, mcpClientManager, indexer);
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

    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (wsRoot) {
      const worktreeManager = new WorktreeManager(
        wsRoot,
        (msg) => chatProvider.postMessageToWebview(msg)
      );
      handler.setWorktreeManager(worktreeManager);
    }

    // Post MCP status to webview on setup
    postMcpStatus();
    chatProvider.postMessageToWebview({
      type: 'autonomousModeChanged',
      enabled: settings.autonomousMode,
    });
  };

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

  // Register URI handler for OAuth callback (vscode://lucentcode.lucent-code/oauth-callback)
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri(uri: vscode.Uri) {
        console.log('[Lucent Code] URI handler called:', uri.toString(), 'path:', uri.path, 'query:', uri.query);
        if (uri.path.startsWith('/oauth-callback')) {
          auth.handleOAuthCallback(uri).catch((e: unknown) => {
            const msg = e instanceof Error ? e.message : String(e);
            console.error('[Lucent Code] OAuth callback failed:', msg);
            vscode.window.showErrorMessage(`OpenRouter: OAuth callback failed — ${msg}`);
          });
        }
      },
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('lucentCode.authMenu', async () => {
      const isAuthed = await auth.isAuthenticated();
      const options = isAuthed
        ? ['Sign out', 'Set API Key manually']
        : ['Sign in with OpenRouter (OAuth)', 'Set API Key manually'];

      const choice = await vscode.window.showQuickPick(options, {
        placeHolder: isAuthed ? 'OpenRouter: Signed in' : 'OpenRouter: Not signed in',
      });

      if (choice === 'Sign in with OpenRouter (OAuth)') auth.startOAuth();
      else if (choice === 'Set API Key manually') auth.promptForApiKey();
      else if (choice === 'Sign out') {
        await auth.signOut();
        vscode.window.showInformationMessage('Signed out of OpenRouter.');
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('lucentCode.indexCodebase', () => {
      indexerStatusBar.text = '$(loading~spin) Indexing…';
      indexer.indexAll()
        .then(() => { indexerStatusBar.text = '$(database) Indexed'; })
        .catch(() => { indexerStatusBar.text = '$(warning) Index failed'; });
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

  context.subscriptions.push(
    vscode.commands.registerCommand('lucentCode.browseSkills', async () => {
      const summaries = skillRegistry.getSummaries();
      if (summaries.length === 0) {
        vscode.window.showInformationMessage('No skills loaded. Add sources via "Lucent Code: Add Skill Source".');
        return;
      }
      const items = summaries.map((s) => ({
        label: s.name,
        description: s.description,
      }));
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a skill to insert into chat',
      });
      if (picked) {
        const skill = skillRegistry.get(picked.label);
        if (skill) {
          await vscode.commands.executeCommand('lucentCode.chatView.focus');
          chatProvider.postMessageToWebview({ type: 'insertSkillChip', name: skill.name, content: skill.content });
        }
      }
    }),

    vscode.commands.registerCommand('lucentCode.addSkillSource', async () => {
      const typeItem = await vscode.window.showQuickPick(
        [
          { label: 'github', description: 'GitHub repository URL' },
          { label: 'npm', description: 'npm package name' },
          { label: 'marketplace', description: 'Superpowers marketplace slug' },
          { label: 'local', description: 'Local directory path' },
        ],
        { placeHolder: 'Select source type' }
      );
      if (!typeItem) return;

      const newSource: Record<string, string> = { type: typeItem.label };

      if (typeItem.label === 'github') {
        const url = await vscode.window.showInputBox({ prompt: 'GitHub repository URL (e.g. https://github.com/gsd-build/get-shit-done)' });
        if (!url) return;
        newSource.url = url;
      } else if (typeItem.label === 'npm') {
        const pkg = await vscode.window.showInputBox({ prompt: 'npm package name (e.g. @obra/superpowers-skills)' });
        if (!pkg) return;
        newSource.package = pkg;
      } else if (typeItem.label === 'marketplace') {
        const slug = await vscode.window.showInputBox({ prompt: 'Marketplace slug (e.g. superpowers)' });
        if (!slug) return;
        const version = await vscode.window.showInputBox({ prompt: 'Version (leave blank for latest)', value: 'latest' });
        newSource.slug = slug;
        newSource.version = version ?? 'latest';
      } else if (typeItem.label === 'local') {
        const dirPath = await vscode.window.showInputBox({ prompt: 'Local directory path (e.g. ~/my-skills)' });
        if (!dirPath) return;
        newSource.path = dirPath;
      }

      const config = vscode.workspace.getConfiguration('lucentCode');
      const existing = config.get<unknown[]>('skills.sources', []);
      await config.update('skills.sources', [...existing, newSource], vscode.ConfigurationTarget.Global);
      await loadSkills();
      updateSkillsStatus();
      chatProvider.postMessageToWebview({ type: 'skillsLoaded', skills: skillRegistry.getSummaries() });
      vscode.window.showInformationMessage(`Skill source added. ${skillRegistry.getAll().length} skills loaded.`);
    }),

    vscode.commands.registerCommand('lucentCode.refreshSkills', async () => {
      await loadSkills();
      updateSkillsStatus();
      chatProvider.postMessageToWebview({ type: 'skillsLoaded', skills: skillRegistry.getSummaries() });
      vscode.window.showInformationMessage(`Skills refreshed: ${skillRegistry.getAll().length} skills loaded.`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('openRouterChat.startWorktree', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        vscode.window.showErrorMessage('No workspace folder open.');
        return;
      }
      // Reuse the existing manager if available, otherwise create one
      let worktreeManager = messageHandler?.worktreeManager;
      if (!worktreeManager) {
        worktreeManager = new WorktreeManager(workspaceRoot, (msg) => chatProvider.postMessageToWebview(msg));
        messageHandler?.setWorktreeManager(worktreeManager);
      }
      const convId = messageHandler?.currentConversationId ?? Date.now().toString();
      try {
        await worktreeManager.create(convId);
        vscode.window.showInformationMessage(`Worktree active on branch lucent/${convId}`);
      } catch (e: any) {
        vscode.window.showErrorMessage(`Failed to create worktree: ${e.message}`);
      }
    })
  );

  // The webview empty state and status bar already prompt for API key —
  // no extra notification needed on activation.

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
      mcpClientManager.dispose();
    },
  });
  context.subscriptions.push({ dispose: () => indexer.dispose() });
}

export function deactivate() {
  messageHandler?.abort();
}
