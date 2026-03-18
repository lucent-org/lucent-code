import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { parseFrontmatter } from './skill-parser';

export interface SkillEntry {
  name: string;
  description: string;
  content: string;
  source: string;
}

export interface PreloadedSource {
  type: 'local';
  content: Map<string, string>; // key → raw markdown
}

export class SkillRegistry {
  private skills = new Map<string, SkillEntry>();

  getAll(): SkillEntry[] {
    return Array.from(this.skills.values());
  }

  get(name: string): SkillEntry | undefined {
    return this.skills.get(name);
  }

  getSummaries(): { name: string; description: string }[] {
    return this.getAll().map(({ name, description }) => ({ name, description }));
  }

  async load(sources: PreloadedSource[]): Promise<void> {
    this.skills.clear();

    // 1. Claude Code cache — lowest priority (loaded first)
    await this.loadClaudeCodeCache();

    // 2. Own sources in order — later overwrites earlier
    for (const source of sources) {
      for (const [, markdown] of source.content) {
        this.ingest(markdown, 'local');
      }
    }
  }

  // Called by extension with raw markdown from remote sources
  ingestFromSource(markdown: string, sourceLabel: string): void {
    this.ingest(markdown, sourceLabel);
  }

  private ingest(markdown: string, source: string): void {
    if (markdown.length > 50 * 1024) return;
    const { name, description, body } = parseFrontmatter(markdown);
    if (!name) return;
    this.skills.set(name, { name, description: description ?? '', content: body, source });
  }

  private async loadClaudeCodeCache(): Promise<void> {
    const home = os.homedir();
    const cacheDir = path.join(home, '.claude', 'plugins', 'cache');
    const skillsDir = path.join(home, '.claude', 'skills');
    await this.walkForSkills(cacheDir, 'claude-code', 4);
    await this.walkForSkills(skillsDir, 'claude-code', 1);
  }

  private async walkForSkills(dir: string, source: string, maxDepth: number): Promise<void> {
    try {
      await fs.stat(dir);
    } catch {
      return;
    }
    await this.walkDir(dir, source, maxDepth);
  }

  private async walkDir(dir: string, source: string, remainingDepth: number): Promise<void> {
    if (remainingDepth < 0) return;
    let entries: Array<{ name: string; isDirectory: () => boolean }>;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.walkDir(fullPath, source, remainingDepth - 1);
      } else if (entry.name.endsWith('.md')) {
        try {
          const content = await fs.readFile(fullPath, 'utf8');
          this.ingest(content, source);
        } catch {
          // skip unreadable files
        }
      }
    }
  }
}
