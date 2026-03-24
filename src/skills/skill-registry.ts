import { parseFrontmatter } from './skill-parser';

export interface SkillEntry {
  name: string;
  description: string;
  content: string;
  source: string;
}

export interface PreloadedSource {
  type: 'local';
  label?: string;
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

  getSummaries(): { name: string; description: string; source: string }[] {
    return this.getAll().map(({ name, description, source }) => ({ name, description, source }));
  }

  clear(): void {
    this.skills.clear();
  }

  async load(sources: PreloadedSource[]): Promise<void> {
    this.skills.clear();

    for (const source of sources) {
      for (const [, markdown] of source.content) {
        this.ingest(markdown, source.label ?? source.type);
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

}
