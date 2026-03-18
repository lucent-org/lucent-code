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
    this.serverStatus = {};
  }
}
