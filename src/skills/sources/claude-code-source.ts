import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const CLAUDE_SKILLS_DIR = path.join(os.homedir(), '.claude', 'skills');
const MAX_BYTES = 50 * 1024;

export async function fetchClaudeCodeSkills(): Promise<string[]> {
  try {
    const entries = await fs.readdir(CLAUDE_SKILLS_DIR, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory());
    const results: string[] = [];
    for (const dir of dirs) {
      const skillPath = path.join(CLAUDE_SKILLS_DIR, dir.name, 'SKILL.md');
      try {
        const content = await fs.readFile(skillPath, 'utf8');
        if (content.length <= MAX_BYTES) results.push(content);
      } catch {
        // SKILL.md missing — skip
      }
    }
    return results;
  } catch {
    return [];
  }
}
