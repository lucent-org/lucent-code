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

  const home = os.homedir().replace(/\\/g, '/');
  const configFiles = [
    `${home}/.claude/settings.json`,
    `${home}/.lucentcode/settings.json`,
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
