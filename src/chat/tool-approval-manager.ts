import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

interface ApprovalConfig {
  approvedTools: string[];
}

export class ToolApprovalManager {
  private readonly sessionApprovals = new Set<string>();

  constructor(private readonly workspaceRoot?: string) {}

  async isApproved(toolName: string): Promise<boolean> {
    if (this.sessionApprovals.has(toolName)) return true;
    if (this.workspaceRoot && await this.isInConfig(this.workspaceConfigPath()!, toolName)) return true;
    if (await this.isInConfig(this.globalConfigPath(), toolName)) return true;
    return false;
  }

  approveForSession(toolName: string): void {
    this.sessionApprovals.add(toolName);
  }

  async approveForWorkspace(toolName: string): Promise<void> {
    if (!this.workspaceRoot) return;
    await this.addToConfig(this.workspaceConfigPath()!, toolName);
    await this.ensureGitignore();
  }

  async approveGlobally(toolName: string): Promise<void> {
    await this.addToConfig(this.globalConfigPath(), toolName);
  }

  private workspaceConfigPath(): string | null {
    return this.workspaceRoot
      ? path.join(this.workspaceRoot, '.lucent', 'config.json')
      : null;
  }

  private globalConfigPath(): string {
    return path.join(os.homedir(), '.lucent', 'config.json');
  }

  private async isInConfig(configPath: string, toolName: string): Promise<boolean> {
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const config: ApprovalConfig = JSON.parse(content as string);
      return Array.isArray(config.approvedTools) && config.approvedTools.includes(toolName);
    } catch {
      return false;
    }
  }

  private async addToConfig(configPath: string, toolName: string): Promise<void> {
    let config: ApprovalConfig = { approvedTools: [] };
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const parsed: ApprovalConfig = JSON.parse(content as string);
      config = { approvedTools: Array.isArray(parsed.approvedTools) ? parsed.approvedTools : [] };
    } catch { /* file does not exist yet */ }
    if (config.approvedTools.includes(toolName)) return;
    config.approvedTools.push(toolName);
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  private async ensureGitignore(): Promise<void> {
    if (!this.workspaceRoot) return;
    const gitignorePath = path.join(this.workspaceRoot, '.gitignore');
    try {
      const content = await fs.readFile(gitignorePath, 'utf-8') as string;
      const lines = content.split('\n').map((l) => l.trim());
      if (lines.includes('.lucent')) return;
      await fs.appendFile(gitignorePath, '\n.lucent\n');
    } catch {
      await fs.writeFile(gitignorePath, '.lucent\n', 'utf-8');
    }
  }
}
