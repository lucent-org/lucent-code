# MCP Client Support — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Connect Lucent Code to external MCP servers so their tools are available to the model in every chat turn.

**Architecture:** A `McpClientManager` singleton spawns each configured MCP server as a stdio subprocess, exposes their tools alongside editor tools in the OpenRouter request, and routes `mcp__`-prefixed tool calls back through the subprocess. Config is read from three files in priority order (`~/.claude/settings.json` → `~/.lucentcode/settings.json` → `.mcp.json` in workspace root), with later sources winning on name collisions.

**Tech Stack:** `@modelcontextprotocol/sdk` (official TypeScript MCP SDK), Node.js `child_process` via the SDK's `StdioClientTransport`, Vitest for tests, esbuild (already configured to bundle everything except `vscode`).

**Design doc:** `docs/plans/2026-03-18-mcp-client-design.md`

---

### Task 1: Install the MCP SDK

**Files:**
- Modify: `package.json`

**Step 1: Install the package**

```bash
npm install @modelcontextprotocol/sdk
```

Expected: `@modelcontextprotocol/sdk` appears in `dependencies` in `package.json`.

**Step 2: Verify tests still pass**

```bash
npm test
```

Expected: all existing tests pass (no new failures from the new dep).

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @modelcontextprotocol/sdk dependency"
```

---

### Task 2: McpConfigLoader — read and merge three config files

**Files:**
- Create: `src/mcp/mcp-config-loader.ts`
- Create: `src/mcp/mcp-config-loader.test.ts`

**Step 1: Write the failing tests**

Create `src/mcp/mcp-config-loader.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockReadFile } = vi.hoisted(() => ({ mockReadFile: vi.fn() }));

vi.mock('fs/promises', () => ({ readFile: mockReadFile }));
vi.mock('os', () => ({ homedir: () => '/home/user' }));

import { loadMcpConfig } from './mcp-config-loader';

const FS_CFG = JSON.stringify({
  mcpServers: { filesystem: { command: 'npx', args: ['-y', '@mcp/fs', '/tmp'] } },
});

describe('loadMcpConfig', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty map when no config files exist', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    expect((await loadMcpConfig()).size).toBe(0);
  });

  it('loads servers from ~/.claude/settings.json', async () => {
    mockReadFile.mockImplementation((p: string) => {
      if ((p as string).includes('.claude')) return Promise.resolve(FS_CFG);
      return Promise.reject(new Error('ENOENT'));
    });
    const result = await loadMcpConfig();
    expect(result.get('filesystem')?.command).toBe('npx');
  });

  it('workspace .mcp.json overrides global on name collision', async () => {
    const globalCfg = JSON.stringify({ mcpServers: { srv: { command: 'old' } } });
    const localCfg  = JSON.stringify({ mcpServers: { srv: { command: 'new' } } });
    mockReadFile.mockImplementation((p: string) => {
      if ((p as string).endsWith('.mcp.json')) return Promise.resolve(localCfg);
      if ((p as string).includes('.claude'))   return Promise.resolve(globalCfg);
      return Promise.reject(new Error('ENOENT'));
    });
    expect((await loadMcpConfig('/workspace')).get('srv')?.command).toBe('new');
  });

  it('skips malformed JSON without throwing', async () => {
    mockReadFile.mockImplementation((p: string) => {
      if ((p as string).includes('.claude'))   return Promise.resolve('not json');
      if ((p as string).endsWith('.mcp.json')) return Promise.resolve(FS_CFG);
      return Promise.reject(new Error('ENOENT'));
    });
    expect((await loadMcpConfig('/workspace')).get('filesystem')?.command).toBe('npx');
  });

  it('skips entries missing command field', async () => {
    const bad = JSON.stringify({ mcpServers: { bad: { args: ['x'] } } });
    mockReadFile.mockImplementation((p: string) => {
      if ((p as string).includes('.claude')) return Promise.resolve(bad);
      return Promise.reject(new Error('ENOENT'));
    });
    expect((await loadMcpConfig()).size).toBe(0);
  });

  it('merges servers from all three config files', async () => {
    const claude = JSON.stringify({ mcpServers: { a: { command: 'cmd-a' } } });
    const lucent = JSON.stringify({ mcpServers: { b: { command: 'cmd-b' } } });
    const local  = JSON.stringify({ mcpServers: { c: { command: 'cmd-c' } } });
    mockReadFile.mockImplementation((p: string) => {
      if ((p as string).includes('.claude/settings'))  return Promise.resolve(claude);
      if ((p as string).includes('.lucentcode'))       return Promise.resolve(lucent);
      if ((p as string).endsWith('.mcp.json'))         return Promise.resolve(local);
      return Promise.reject(new Error('ENOENT'));
    });
    const result = await loadMcpConfig('/workspace');
    expect(result.size).toBe(3);
    expect(result.get('a')?.command).toBe('cmd-a');
    expect(result.get('b')?.command).toBe('cmd-b');
    expect(result.get('c')?.command).toBe('cmd-c');
  });
});
```

**Step 2: Run tests — verify they fail**

```bash
npm test -- src/mcp/mcp-config-loader.test.ts
```

Expected: FAIL — `Cannot find module './mcp-config-loader'`

**Step 3: Implement**

Create `src/mcp/mcp-config-loader.ts`:

```typescript
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export async function loadMcpConfig(workspaceRoot?: string): Promise<Map<string, McpServerConfig>> {
  const merged = new Map<string, McpServerConfig>();

  const configFiles = [
    path.join(os.homedir(), '.claude', 'settings.json'),
    path.join(os.homedir(), '.lucentcode', 'settings.json'),
    workspaceRoot ? path.join(workspaceRoot, '.mcp.json') : null,
  ].filter((p): p is string => p !== null);

  for (const filePath of configFiles) {
    try {
      const text = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const servers = parsed.mcpServers as Record<string, unknown> | undefined;
      if (servers && typeof servers === 'object') {
        for (const [name, cfg] of Object.entries(servers)) {
          if (cfg && typeof cfg === 'object' && typeof (cfg as McpServerConfig).command === 'string') {
            merged.set(name, cfg as McpServerConfig);
          }
        }
      }
    } catch {
      // Missing file or malformed JSON — skip
    }
  }

  return merged;
}
```

**Step 4: Run tests — verify they pass**

```bash
npm test -- src/mcp/mcp-config-loader.test.ts
```

Expected: 6 passing, 0 failing.

**Step 5: Commit**

```bash
git add src/mcp/mcp-config-loader.ts src/mcp/mcp-config-loader.test.ts
git commit -m "feat: add MCP config loader (three-tier merge)"
```

---

### Task 3: McpClientManager — connect, tools, call, dispose

**Files:**
- Create: `src/mcp/mcp-client-manager.ts`
- Create: `src/mcp/mcp-client-manager.test.ts`

**Step 1: Write the failing tests**

Create `src/mcp/mcp-client-manager.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { MockClient, MockTransport } = vi.hoisted(() => {
  const MockTransport = vi.fn();
  const mockClient = {
    connect:   vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({ tools: [] }),
    callTool:  vi.fn(),
    close:     vi.fn().mockResolvedValue(undefined),
  };
  const MockClient = vi.fn(() => mockClient);
  return { MockClient, MockTransport };
});

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({ Client: MockClient }));
vi.mock('@modelcontextprotocol/sdk/client/stdio.js',  () => ({ StdioClientTransport: MockTransport }));

import { McpClientManager } from './mcp-client-manager';
import type { McpServerConfig } from './mcp-config-loader';

function makeServers(overrides: Record<string, McpServerConfig> = {}): Map<string, McpServerConfig> {
  return new Map(Object.entries({
    filesystem: { command: 'npx', args: ['-y', '@mcp/fs'] },
    ...overrides,
  }));
}

describe('McpClientManager', () => {
  let manager: McpClientManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new McpClientManager();
  });

  it('starts with no tools', () => {
    expect(manager.getTools()).toHaveLength(0);
  });

  it('connects to servers and exposes their tools', async () => {
    const mockClient = new MockClient();
    (mockClient.listTools as any).mockResolvedValue({
      tools: [
        { name: 'read_file', description: 'Read a file', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
      ],
    });
    (MockClient as any).mockReturnValue(mockClient);

    await manager.connect(makeServers());

    const tools = manager.getTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].function.name).toBe('mcp__filesystem__read_file');
    expect(tools[0].function.description).toContain('[filesystem]');
  });

  it('marks server as error when connect times out', async () => {
    vi.useFakeTimers();
    const mockClient = new MockClient();
    (mockClient.connect as any).mockReturnValue(new Promise(() => {})); // never resolves
    (MockClient as any).mockReturnValue(mockClient);

    const connectPromise = manager.connect(makeServers());
    vi.advanceTimersByTime(6000);
    await connectPromise;

    expect(manager.getStatus()['filesystem']).toBe('error');
    expect(manager.getTools()).toHaveLength(0);
    vi.useRealTimers();
  });

  it('marks server as error when listTools throws', async () => {
    const mockClient = new MockClient();
    (mockClient.listTools as any).mockRejectedValue(new Error('server error'));
    (MockClient as any).mockReturnValue(mockClient);

    await manager.connect(makeServers());

    expect(manager.getStatus()['filesystem']).toBe('error');
  });

  it('callTool routes to correct server and returns content', async () => {
    const mockClient = new MockClient();
    (mockClient.listTools as any).mockResolvedValue({
      tools: [{ name: 'read_file', description: 'Read', inputSchema: { type: 'object', properties: {} } }],
    });
    (mockClient.callTool as any).mockResolvedValue({
      content: [{ type: 'text', text: 'file contents here' }],
      isError: false,
    });
    (MockClient as any).mockReturnValue(mockClient);

    await manager.connect(makeServers());
    const result = await manager.callTool('mcp__filesystem__read_file', { path: '/tmp/test.txt' });

    expect(result.content).toBe('file contents here');
    expect(result.isError).toBe(false);
    expect(mockClient.callTool).toHaveBeenCalledWith({ name: 'read_file', arguments: { path: '/tmp/test.txt' } });
  });

  it('callTool returns isError:true when server returns error', async () => {
    const mockClient = new MockClient();
    (mockClient.listTools as any).mockResolvedValue({
      tools: [{ name: 'read_file', description: 'Read', inputSchema: { type: 'object', properties: {} } }],
    });
    (mockClient.callTool as any).mockResolvedValue({
      content: [{ type: 'text', text: 'Permission denied' }],
      isError: true,
    });
    (MockClient as any).mockReturnValue(mockClient);

    await manager.connect(makeServers());
    const result = await manager.callTool('mcp__filesystem__read_file', {});

    expect(result.isError).toBe(true);
  });

  it('callTool returns error for unknown server', async () => {
    const result = await manager.callTool('mcp__ghost__tool', {});
    expect(result.isError).toBe(true);
    expect(result.content).toContain('not connected');
  });

  it('callTool returns error for malformed tool name', async () => {
    const result = await manager.callTool('mcp__noDoubleUnderscore', {});
    expect(result.isError).toBe(true);
  });

  it('dispose closes all connections', async () => {
    const mockClient = new MockClient();
    (mockClient.listTools as any).mockResolvedValue({ tools: [] });
    (MockClient as any).mockReturnValue(mockClient);

    await manager.connect(makeServers());
    manager.dispose();

    expect(mockClient.close).toHaveBeenCalled();
    expect(manager.getTools()).toHaveLength(0);
  });
});
```

**Step 2: Run tests — verify they fail**

```bash
npm test -- src/mcp/mcp-client-manager.test.ts
```

Expected: FAIL — `Cannot find module './mcp-client-manager'`

**Step 3: Implement**

Create `src/mcp/mcp-client-manager.ts`:

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { ToolDefinition } from '../shared/types';
import type { McpServerConfig } from './mcp-config-loader';

export interface McpToolResult {
  content: string;
  isError: boolean;
}

interface ServerConnection {
  client: Client;
}

export class McpClientManager {
  private connections = new Map<string, ServerConnection>();
  private toolDefs: ToolDefinition[] = [];
  private serverStatus: Record<string, 'connected' | 'error'> = {};

  async connect(servers: Map<string, McpServerConfig>): Promise<void> {
    await Promise.allSettled(
      Array.from(servers.entries()).map(([name, cfg]) => this.connectServer(name, cfg))
    );
  }

  private async connectServer(name: string, cfg: McpServerConfig): Promise<void> {
    const transport = new StdioClientTransport({
      command: cfg.command,
      args: cfg.args,
      env: cfg.env ? { ...process.env as Record<string, string>, ...cfg.env } : undefined,
    });

    const client = new Client({ name: 'lucent-code', version: '0.1.0' });

    const timeoutMs = 5000;
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Initialize timeout')), timeoutMs)
    );

    try {
      await Promise.race([client.connect(transport), timeout]);
      const { tools } = await client.listTools();

      for (const tool of tools) {
        this.toolDefs.push({
          type: 'function',
          function: {
            name: `mcp__${name}__${tool.name}`,
            description: `[${name}] ${tool.description ?? tool.name}`,
            parameters: (tool.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
          },
        });
      }

      this.connections.set(name, { client });
      this.serverStatus[name] = 'connected';
    } catch {
      this.serverStatus[name] = 'error';
    }
  }

  getTools(): ToolDefinition[] {
    return this.toolDefs;
  }

  getStatus(): Record<string, 'connected' | 'error'> {
    return { ...this.serverStatus };
  }

  async callTool(mcpToolName: string, args: Record<string, unknown>): Promise<McpToolResult> {
    const withoutPrefix = mcpToolName.slice('mcp__'.length);
    const sep = withoutPrefix.indexOf('__');
    if (sep === -1) {
      return { content: `Error: malformed MCP tool name: ${mcpToolName}`, isError: true };
    }
    const serverName = withoutPrefix.slice(0, sep);
    const toolName = withoutPrefix.slice(sep + 2);

    const conn = this.connections.get(serverName);
    if (!conn) {
      return { content: `Error: MCP server "${serverName}" not connected`, isError: true };
    }

    try {
      const result = await conn.client.callTool({ name: toolName, arguments: args });
      const text = (result.content as Array<{ type: string; text?: string }>)
        .map((c) => (c.type === 'text' ? (c.text ?? '') : JSON.stringify(c)))
        .join('\n');
      return { content: text, isError: result.isError === true };
    } catch (err) {
      return { content: `Error: ${err instanceof Error ? err.message : String(err)}`, isError: true };
    }
  }

  dispose(): void {
    for (const conn of this.connections.values()) {
      conn.client.close().catch(() => {});
    }
    this.connections.clear();
    this.toolDefs = [];
  }
}
```

**Step 4: Run tests — verify they pass**

```bash
npm test -- src/mcp/mcp-client-manager.test.ts
```

Expected: 8 passing, 0 failing.

**Step 5: Run full suite**

```bash
npm test
```

Expected: all existing tests + 14 new tests passing.

**Step 6: Commit**

```bash
git add src/mcp/mcp-client-manager.ts src/mcp/mcp-client-manager.test.ts
git commit -m "feat: add McpClientManager (connect, tools, callTool, dispose)"
```

---

### Task 4: Wire McpClientManager into MessageHandler

**Files:**
- Modify: `src/chat/message-handler.ts` (lines 36–45, 166–169, 233–270)
- Modify: `src/chat/message-handler.test.ts`

The `MessageHandler` constructor currently accepts 8 params (all optional after `settings`). Add `mcpClientManager` as the 9th optional param.

**Step 1: Write the failing tests**

Open `src/chat/message-handler.test.ts`. After the existing imports, add these tests at the end of the file (inside the existing `describe` block or in a new one):

```typescript
// Near existing imports at top of the test file, add:
import type { McpClientManager } from '../mcp/mcp-client-manager';

// Add these tests in a new describe block at the end of the file:
describe('MessageHandler — MCP tool routing', () => {
  const postMessages: ExtensionMessage[] = [];
  const postMessage = (msg: ExtensionMessage) => postMessages.push(msg);

  function makeMcpManager(overrides: Partial<McpClientManager> = {}): McpClientManager {
    return {
      getTools: vi.fn().mockReturnValue([{
        type: 'function',
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

  function makeStreamWithToolCall(toolName: string, toolArgs: string): AsyncGenerator<any> {
    const chunks = [
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_mcp_1', function: { name: toolName, arguments: toolArgs } }] }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
      { choices: [{ delta: { content: 'Done.' }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
    ];
    let i = 0;
    return {
      [Symbol.asyncIterator]() { return this; },
      async next() {
        if (i >= chunks.length) return { done: true, value: undefined };
        return { done: false, value: chunks[i++] };
      },
    } as unknown as AsyncGenerator<any>;
  }

  beforeEach(() => postMessages.length = 0);

  it('includes MCP tools in the tool array sent to the model', async () => {
    const mcpManager = makeMcpManager();
    const mockClient = {
      chatStream: vi.fn().mockReturnValue((async function* () {
        yield { choices: [{ delta: { content: 'Hello' }, finish_reason: null }] };
        yield { choices: [{ delta: {}, finish_reason: 'stop' }] };
      })()),
      listModels: vi.fn().mockResolvedValue([]),
    } as unknown as OpenRouterClient;

    const mockContext = { buildEnrichedContext: vi.fn().mockResolvedValue({}), buildContext: vi.fn().mockReturnValue({}), formatEnrichedPrompt: vi.fn().mockReturnValue(''), getCapabilities: vi.fn().mockReturnValue({}), getCustomInstructions: vi.fn().mockReturnValue('') } as unknown as ContextBuilder;
    const mockSettings = { temperature: 0.7, maxTokens: 4096, setChatModel: vi.fn() } as unknown as Settings;

    const handler = new MessageHandler(mockClient, mockContext, mockSettings, undefined, undefined, undefined, undefined, undefined, mcpManager);
    await handler.handleMessage({ type: 'sendMessage', content: 'Hello', model: 'claude-opus-4-6', images: [] }, postMessage);

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

    const mockContext = { buildEnrichedContext: vi.fn().mockResolvedValue({}), buildContext: vi.fn().mockReturnValue({}), formatEnrichedPrompt: vi.fn().mockReturnValue(''), getCapabilities: vi.fn().mockReturnValue({}), getCustomInstructions: vi.fn().mockReturnValue('') } as unknown as ContextBuilder;
    const mockSettings = { temperature: 0.7, maxTokens: 4096, setChatModel: vi.fn() } as unknown as Settings;

    const handler = new MessageHandler(mockClient, mockContext, mockSettings, undefined, undefined, undefined, undefined, undefined, mcpManager);
    await handler.handleMessage({ type: 'sendMessage', content: 'Read the file', model: 'claude-opus-4-6', images: [] }, postMessage);

    expect(mcpManager.callTool).toHaveBeenCalledWith('mcp__filesystem__read_file', { path: '/tmp/test.txt' });
    expect(postMessages.some((m) => m.type === 'streamEnd')).toBe(true);
  });
});
```

**Step 2: Run tests — verify new tests fail**

```bash
npm test -- src/chat/message-handler.test.ts
```

Expected: new tests fail — constructor doesn't accept 9th param yet.

**Step 3: Modify MessageHandler**

In `src/chat/message-handler.ts`:

**3a.** Add the import at the top (after existing imports):

```typescript
import type { McpClientManager } from '../mcp/mcp-client-manager';
```

**3b.** Add `mcpClientManager` to the constructor (line 36–45). Change:

```typescript
  constructor(
    private readonly client: OpenRouterClient,
    private readonly contextBuilder: ContextBuilder,
    private readonly settings: Settings,
    private readonly toolExecutor?: EditorToolExecutor,
    private readonly history?: ConversationHistory,
    private readonly notifications: NotificationService = new NotificationService(),
    private readonly terminalBuffer?: TerminalBuffer,
    private readonly skillRegistry?: SkillRegistry
  ) {}
```

To:

```typescript
  constructor(
    private readonly client: OpenRouterClient,
    private readonly contextBuilder: ContextBuilder,
    private readonly settings: Settings,
    private readonly toolExecutor?: EditorToolExecutor,
    private readonly history?: ConversationHistory,
    private readonly notifications: NotificationService = new NotificationService(),
    private readonly terminalBuffer?: TerminalBuffer,
    private readonly skillRegistry?: SkillRegistry,
    private readonly mcpClientManager?: McpClientManager
  ) {}
```

**3c.** Merge MCP tools into the tool array (around line 166–169). Change:

```typescript
    const skillTools = this.skillRegistry ? [USE_SKILL_TOOL_DEFINITION] : [];
    const editorTools = this.toolExecutor ? TOOL_DEFINITIONS : [];
    const allTools = [...skillTools, ...editorTools];
    const tools = allTools.length > 0 ? allTools : undefined;
```

To:

```typescript
    const skillTools  = this.skillRegistry      ? [USE_SKILL_TOOL_DEFINITION]             : [];
    const editorTools = this.toolExecutor        ? TOOL_DEFINITIONS                        : [];
    const mcpTools    = this.mcpClientManager?.getTools() ?? [];
    const allTools    = [...skillTools, ...editorTools, ...mcpTools];
    const tools       = allTools.length > 0 ? allTools : undefined;
```

**3d.** Route `mcp__` tool calls. In the tool execution loop (after the `use_skill` block at line ~233 and before the `toolExecutor` check), add:

```typescript
            if (tc.function.name.startsWith('mcp__') && this.mcpClientManager) {
              const mcpResult = await this.mcpClientManager.callTool(tc.function.name, args);
              this.conversationMessages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: this.truncateToolOutput(mcpResult.isError ? `Error: ${mcpResult.content}` : mcpResult.content),
              });
              continue;
            }
```

Place this block immediately after the `use_skill` block (after the `continue;` on line ~241) and before the `if (!this.toolExecutor)` check.

**Step 4: Run tests — verify they pass**

```bash
npm test -- src/chat/message-handler.test.ts
```

Expected: all existing + new tests passing.

**Step 5: Run full suite**

```bash
npm test
```

Expected: all tests passing.

**Step 6: Commit**

```bash
git add src/chat/message-handler.ts src/chat/message-handler.test.ts
git commit -m "feat: merge MCP tools into chat and route mcp__ tool calls"
```

---

### Task 5: Wire McpClientManager into extension.ts

**Files:**
- Modify: `src/extension.ts`
- Modify: `src/shared/types.ts`

**Step 1: Add mcpStatus message type to shared/types.ts**

In `src/shared/types.ts`, add to the `ExtensionMessage` union (after the `skillContent` line):

```typescript
  | { type: 'mcpStatus'; servers: Record<string, 'connected' | 'error'> }
```

**Step 2: Modify extension.ts**

**2a.** Add imports at the top of `src/extension.ts` (after existing imports):

```typescript
import { McpClientManager } from './mcp/mcp-client-manager';
import { loadMcpConfig } from './mcp/mcp-config-loader';
```

**2b.** After the `await loadSkills();` line (around line 80), add MCP initialization:

```typescript
  // Initialize MCP client
  const mcpClientManager = new McpClientManager();
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  async function connectMcpServers(): Promise<void> {
    const servers = await loadMcpConfig(workspaceRoot);
    if (servers.size === 0) return;
    await mcpClientManager.connect(servers);
  }

  await connectMcpServers();
```

**2c.** Pass `mcpClientManager` as the 9th argument to `MessageHandler` (around line 143). Change:

```typescript
  messageHandler = new MessageHandler(client, contextBuilder, settings, toolExecutor, history, notifications, terminalBuffer, skillRegistry);
```

To:

```typescript
  messageHandler = new MessageHandler(client, contextBuilder, settings, toolExecutor, history, notifications, terminalBuffer, skillRegistry, mcpClientManager);
```

**2d.** After `connectMcpServers()` call, add a file watcher for `.mcp.json` so config changes reconnect:

```typescript
  if (workspaceRoot) {
    const mcpWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(workspaceRoot, '.mcp.json')
    );
    const reconnect = async () => {
      mcpClientManager.dispose();
      Object.assign(mcpClientManager, new McpClientManager());
      await connectMcpServers();
    };
    context.subscriptions.push(
      mcpWatcher,
      mcpWatcher.onDidCreate(reconnect),
      mcpWatcher.onDidChange(reconnect),
      mcpWatcher.onDidDelete(reconnect),
    );
  }
```

**Note:** `Object.assign(mcpClientManager, new McpClientManager())` resets the instance's internal state (connections, toolDefs, serverStatus). This is the pattern to use since `messageHandler` holds a reference to the original `mcpClientManager` object.

Actually, a cleaner pattern is to just dispose and reconnect on the same instance. Update `McpClientManager.dispose()` to also reset `serverStatus` and `toolDefs` (check the implementation from Task 3 — it already resets `toolDefs` in dispose, but not `serverStatus`). Add `this.serverStatus = {};` to `dispose()` in `src/mcp/mcp-client-manager.ts`, then the watcher can call:

```typescript
    const reconnect = async () => {
      mcpClientManager.dispose();
      await connectMcpServers();
    };
```

**2e.** Add `mcpClientManager.dispose()` to the cleanup block (around line 430):

```typescript
  context.subscriptions.push({
    dispose: () => {
      auth.dispose();
      completionProvider.dispose();
      instructionsLoader.dispose();
      terminalBuffer.dispose();
      mcpClientManager.dispose();
    },
  });
```

**Step 3: Fix McpClientManager.dispose() to reset serverStatus**

In `src/mcp/mcp-client-manager.ts`, update `dispose()`:

```typescript
  dispose(): void {
    for (const conn of this.connections.values()) {
      conn.client.close().catch(() => {});
    }
    this.connections.clear();
    this.toolDefs = [];
    this.serverStatus = {};
  }
```

Update the `dispose` test in `mcp-client-manager.test.ts` to also check `getStatus()` is empty after dispose:

```typescript
  it('dispose closes all connections', async () => {
    const mockClient = new MockClient();
    (mockClient.listTools as any).mockResolvedValue({ tools: [] });
    (MockClient as any).mockReturnValue(mockClient);

    await manager.connect(makeServers());
    manager.dispose();

    expect(mockClient.close).toHaveBeenCalled();
    expect(manager.getTools()).toHaveLength(0);
    expect(Object.keys(manager.getStatus())).toHaveLength(0);
  });
```

**Step 4: Build and verify**

```bash
npm test
```

Expected: all tests passing (extension.ts changes are not unit tested here — they wire up VS Code APIs that only run in the extension host).

```bash
npm run build:ext
```

Expected: build succeeds, no TypeScript errors.

**Step 5: Commit**

```bash
git add src/extension.ts src/shared/types.ts src/mcp/mcp-client-manager.ts src/mcp/mcp-client-manager.test.ts
git commit -m "feat: wire McpClientManager into extension — connects on activation, reconnects on .mcp.json change"
```

---

## Manual Smoke Test

To verify the feature end-to-end with a real MCP server:

1. Install the filesystem MCP server: `npm install -g @modelcontextprotocol/server-filesystem`
2. Create `.mcp.json` in the workspace root:
   ```json
   {
     "mcpServers": {
       "filesystem": {
         "command": "npx",
         "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
       }
     }
   }
   ```
3. Reload VS Code window (`Developer: Reload Window`)
4. Open Lucent Code chat
5. Ask: "List the files in /tmp"
6. Expected: model calls `mcp__filesystem__list_directory`, result appears in chat

---

## Summary

| Task | Files | Tests Added |
|---|---|---|
| 1 | `package.json` | 0 |
| 2 | `src/mcp/mcp-config-loader.ts` + test | 6 |
| 3 | `src/mcp/mcp-client-manager.ts` + test | 8 |
| 4 | `src/chat/message-handler.ts` + test | 2 |
| 5 | `src/extension.ts`, `src/shared/types.ts`, `mcp-client-manager.ts` | 1 (dispose update) |
