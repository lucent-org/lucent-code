import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const MAX_BYTES = 50 * 1024;
const CLAUDE_DIR = path.join(os.homedir(), '.claude');

async function readSkillMd(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const results: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.join(dir, entry.name, 'SKILL.md');
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

async function scanPluginCache(cacheDir: string, depth = 0): Promise<string[]> {
  if (depth > 4) return [];
  try {
    const entries = await fs.readdir(cacheDir, { withFileTypes: true });
    const results: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(cacheDir, entry.name);
      if (entry.name === 'skills') {
        // Found a skills directory — read SKILL.md files inside subdirs
        results.push(...await readSkillMd(fullPath));
      } else {
        results.push(...await scanPluginCache(fullPath, depth + 1));
      }
    }
    return results;
  } catch {
    return [];
  }
}

export async function fetchClaudeCodeSkills(): Promise<string[]> {
  const [userSkills, pluginSkills] = await Promise.all([
    readSkillMd(path.join(CLAUDE_DIR, 'skills')),
    scanPluginCache(path.join(CLAUDE_DIR, 'plugins', 'cache')),
  ]);
  return [...userSkills, ...pluginSkills];
}
