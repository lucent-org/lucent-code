# Skill Sets Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add support for Claude Code-style skill sets — markdown workflow files that are advertised to the model and injected on demand via semantic matching or explicit tool call.

**Architecture:** A `SkillRegistry` loads skills from the Claude Code cache (`~/.claude/`) and from user-configured sources (GitHub, npm/unpkg, superpowers marketplace, local directories). Skills are deduped by name (own sources win over Claude Code cache). At send time, a `SkillMatcher` scores the user message against skill descriptions and pre-injects the top matches; the model can also call a `use_skill` tool explicitly.

**Tech Stack:** TypeScript, Node.js `fs.promises` (extension-side file I/O), `fetch` (HTTP sources), SolidJS (webview), Vitest (tests), `vscode.workspace.getConfiguration` (settings).

---

## Task 1: Skill parser (pure utility)

**Files:**
- Create: `src/skills/skill-parser.ts`
- Create: `src/skills/skill-parser.test.ts`

### Step 1: Write the failing tests

```ts
// src/skills/skill-parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from './skill-parser';

describe('parseFrontmatter', () => {
  it('extracts name and description from YAML frontmatter', () => {
    const md = `---\nname: brainstorming\ndescription: Use before creative work\n---\n# Content here`;
    const result = parseFrontmatter(md);
    expect(result.name).toBe('brainstorming');
    expect(result.description).toBe('Use before creative work');
    expect(result.body).toContain('# Content here');
  });

  it('returns undefined name/description when no frontmatter', () => {
    const result = parseFrontmatter('# Just a markdown file');
    expect(result.name).toBeUndefined();
    expect(result.description).toBeUndefined();
    expect(result.body).toBe('# Just a markdown file');
  });

  it('handles multi-line description via first line only', () => {
    const md = `---\nname: tdd\ndescription: Test-driven development\ntype: rigid\n---\nbody`;
    const result = parseFrontmatter(md);
    expect(result.name).toBe('tdd');
    expect(result.description).toBe('Test-driven development');
  });

  it('returns undefined for missing name field', () => {
    const md = `---\ndescription: Some desc\n---\nbody`;
    const result = parseFrontmatter(md);
    expect(result.name).toBeUndefined();
    expect(result.description).toBe('Some desc');
  });
});
```

### Step 2: Run to verify failure

```
npx vitest run src/skills/skill-parser.test.ts
```
Expected: FAIL — "Cannot find module './skill-parser'"

### Step 3: Implement

```ts
// src/skills/skill-parser.ts
export interface FrontmatterResult {
  name?: string;
  description?: string;
  body: string;
}

export function parseFrontmatter(markdown: string): FrontmatterResult {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { body: markdown };
  const fm = match[1];
  const body = match[2];
  const name = fm.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = fm.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  return { name, description, body };
}
```

### Step 4: Run to verify pass

```
npx vitest run src/skills/skill-parser.test.ts
```
Expected: PASS (4 tests)

### Step 5: Commit

```bash
git add src/skills/skill-parser.ts src/skills/skill-parser.test.ts
git commit -m "feat: add skill frontmatter parser"
```

---

## Task 2: SkillRegistry with Claude Code + local sources

**Files:**
- Create: `src/skills/skill-registry.ts`
- Create: `src/skills/skill-registry.test.ts`

### Step 1: Write the failing tests

```ts
// src/skills/skill-registry.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockReaddir, mockReadFile, mockStat } = vi.hoisted(() => ({
  mockReaddir: vi.fn(),
  mockReadFile: vi.fn(),
  mockStat: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  readdir: mockReaddir,
  readFile: mockReadFile,
  stat: mockStat,
}));

vi.mock('os', () => ({ homedir: () => '/home/user' }));

import { SkillRegistry } from './skill-registry';

const SKILL_MD = `---\nname: brainstorming\ndescription: Use before creative work\n---\n# Brainstorming\nContent here.`;
const SKILL_MD2 = `---\nname: tdd\ndescription: Test-driven development\n---\n# TDD\nWrite tests first.`;

describe('SkillRegistry', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new SkillRegistry();
    // Default: no dirs found
    mockStat.mockRejectedValue(new Error('not found'));
    mockReaddir.mockResolvedValue([]);
  });

  it('starts empty', () => {
    expect(registry.getAll()).toHaveLength(0);
  });

  it('loads skills from Claude Code plugins cache when directory exists', async () => {
    mockStat.mockResolvedValueOnce({ isDirectory: () => true }); // plugins/cache dir exists
    mockReaddir
      .mockResolvedValueOnce([{ name: 'superpowers', isDirectory: () => true }]) // cache subdirs
      .mockResolvedValueOnce([{ name: '4.3.1', isDirectory: () => true }])       // version subdirs
      .mockResolvedValueOnce([{ name: 'skills', isDirectory: () => true }])       // skills dir
      .mockResolvedValueOnce([{ name: 'brainstorming.md', isDirectory: () => false }]); // skill files
    mockReadFile.mockResolvedValueOnce(SKILL_MD);

    await registry.load([]);

    expect(registry.getAll()).toHaveLength(1);
    expect(registry.get('brainstorming')?.description).toBe('Use before creative work');
    expect(registry.get('brainstorming')?.source).toBe('claude-code');
  });

  it('own-source skill with same name overrides Claude Code cache', async () => {
    // Claude Code has 'brainstorming'
    mockStat.mockResolvedValueOnce({ isDirectory: () => true });
    mockReaddir
      .mockResolvedValueOnce([{ name: 'sp', isDirectory: () => true }])
      .mockResolvedValueOnce([{ name: '1.0', isDirectory: () => true }])
      .mockResolvedValueOnce([{ name: 'skills', isDirectory: () => true }])
      .mockResolvedValueOnce([{ name: 'brainstorming.md', isDirectory: () => false }]);
    mockReadFile.mockResolvedValueOnce(SKILL_MD);

    // Local source also has 'brainstorming' with different content
    const overrideMd = `---\nname: brainstorming\ndescription: My custom brainstorming\n---\nCustom content`;
    await registry.load([{ type: 'local', content: new Map([['brainstorming', overrideMd]]) }]);

    expect(registry.get('brainstorming')?.description).toBe('My custom brainstorming');
    expect(registry.get('brainstorming')?.source).toBe('local');
  });

  it('returns skill summaries without content', () => {
    // Manually populate for this test
    (registry as any).skills.set('tdd', { name: 'tdd', description: 'TDD workflow', content: SKILL_MD2, source: 'local' });

    const summaries = registry.getSummaries();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toEqual({ name: 'tdd', description: 'TDD workflow' });
  });

  it('skips files with no name in frontmatter', async () => {
    mockStat.mockResolvedValueOnce({ isDirectory: () => true });
    mockReaddir
      .mockResolvedValueOnce([{ name: 'pkg', isDirectory: () => true }])
      .mockResolvedValueOnce([{ name: '1.0', isDirectory: () => true }])
      .mockResolvedValueOnce([{ name: 'skills', isDirectory: () => true }])
      .mockResolvedValueOnce([{ name: 'unnamed.md', isDirectory: () => false }]);
    mockReadFile.mockResolvedValueOnce('# No frontmatter at all');

    await registry.load([]);
    expect(registry.getAll()).toHaveLength(0);
  });
});
```

### Step 2: Run to verify failure

```
npx vitest run src/skills/skill-registry.test.ts
```
Expected: FAIL — "Cannot find module './skill-registry'"

### Step 3: Implement

```ts
// src/skills/skill-registry.ts
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

// Used only in tests to inject pre-loaded skill content without real file I/O
export interface PreloadedSource {
  type: 'local';
  content: Map<string, string>; // name → raw markdown
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

  // sources: array of loaded source results (own sources, higher priority than Claude Code cache)
  async load(sources: PreloadedSource[]): Promise<void> {
    this.skills.clear();

    // 1. Load Claude Code cache (lowest priority — loaded first, may be overwritten)
    await this.loadClaudeCodeCache();

    // 2. Apply own sources in order (later sources overwrite earlier ones)
    for (const source of sources) {
      for (const [, markdown] of source.content) {
        this.ingest(markdown, 'local');
      }
    }
  }

  // Called by extension.ts with real fetched content from configured sources
  ingestFromSource(markdown: string, sourceLabel: string): void {
    this.ingest(markdown, sourceLabel);
  }

  private ingest(markdown: string, source: string): void {
    if (markdown.length > 50 * 1024) return; // skip oversized files
    const { name, description, body } = parseFrontmatter(markdown);
    if (!name) return;
    this.skills.set(name, { name, description: description ?? '', content: body, source });
  }

  private async loadClaudeCodeCache(): Promise<void> {
    const home = os.homedir();
    const cacheDir = path.join(home, '.claude', 'plugins', 'cache');
    const skillsDir = path.join(home, '.claude', 'skills');

    await this.walkForSkills(cacheDir, 'claude-code', 4); // depth 4: cache/pkg/version/skills/file.md
    await this.walkForSkills(skillsDir, 'claude-code', 1); // depth 1: skills/file.md
  }

  private async walkForSkills(dir: string, source: string, maxDepth: number): Promise<void> {
    try {
      await fs.stat(dir);
    } catch {
      return; // directory does not exist
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
```

### Step 4: Run to verify pass

```
npx vitest run src/skills/skill-registry.test.ts
```
Expected: PASS (5 tests)

### Step 5: Commit

```bash
git add src/skills/skill-registry.ts src/skills/skill-registry.test.ts
git commit -m "feat: add SkillRegistry with Claude Code cache + local source loading"
```

---

## Task 3: GitHub source fetcher

**Files:**
- Create: `src/skills/sources/github-source.ts`
- Create: `src/skills/sources/github-source.test.ts`

### Step 1: Write the failing tests

```ts
// src/skills/sources/github-source.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { fetchGitHubSkills } from './github-source';

const SKILL_MD = `---\nname: brainstorming\ndescription: Use before creative work\n---\n# Content`;

describe('fetchGitHubSkills', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches and returns skill markdown files from a GitHub repo', async () => {
    // First call: GitHub API to list files
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([
          { name: 'brainstorming.md', type: 'file', download_url: 'https://raw.githubusercontent.com/test/repo/main/skills/brainstorming.md' },
          { name: 'README.md', type: 'file', download_url: 'https://raw.githubusercontent.com/test/repo/main/skills/README.md' },
        ]),
      })
      // Second call: download brainstorming.md
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(SKILL_MD) })
      // Third call: download README.md (no frontmatter name — filtered later by registry)
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('# README') });

    const results = await fetchGitHubSkills('https://github.com/test/repo');
    expect(results).toHaveLength(2);
    expect(results[0]).toBe(SKILL_MD);
  });

  it('searches common skill directories (skills/, .claude/skills/)', async () => {
    // First directory returns files, others 404
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 404 }) // skills/ not found
      .mockResolvedValueOnce({                           // .claude/skills/ found
        ok: true,
        json: () => Promise.resolve([
          { name: 'tdd.md', type: 'file', download_url: 'https://raw.githubusercontent.com/test/repo/main/.claude/skills/tdd.md' },
        ]),
      })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('---\nname: tdd\n---\n# TDD') });

    const results = await fetchGitHubSkills('https://github.com/test/repo');
    expect(results).toHaveLength(1);
  });

  it('returns empty array when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('network error'));
    const results = await fetchGitHubSkills('https://github.com/test/repo');
    expect(results).toHaveLength(0);
  });

  it('returns empty array when no skill directories found', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    const results = await fetchGitHubSkills('https://github.com/test/repo');
    expect(results).toHaveLength(0);
  });
});
```

### Step 2: Run to verify failure

```
npx vitest run src/skills/sources/github-source.test.ts
```
Expected: FAIL

### Step 3: Implement

```ts
// src/skills/sources/github-source.ts

const SKILL_DIRS = ['skills', '.claude/skills', 'src/skills'];

function toApiUrl(repoUrl: string, subpath: string): string {
  // https://github.com/owner/repo → https://api.github.com/repos/owner/repo/contents/subpath
  const match = repoUrl.match(/github\.com\/([^/]+\/[^/]+)/);
  if (!match) throw new Error(`Invalid GitHub URL: ${repoUrl}`);
  return `https://api.github.com/repos/${match[1]}/contents/${subpath}`;
}

export async function fetchGitHubSkills(repoUrl: string): Promise<string[]> {
  try {
    for (const dir of SKILL_DIRS) {
      const apiUrl = toApiUrl(repoUrl, dir);
      const listResp = await fetch(apiUrl, { headers: { Accept: 'application/vnd.github.v3+json' } });
      if (!listResp.ok) continue;

      const files = (await listResp.json()) as Array<{ name: string; type: string; download_url: string }>;
      const mdFiles = files.filter((f) => f.type === 'file' && f.name.endsWith('.md'));

      const contents = await Promise.all(
        mdFiles.map(async (f) => {
          const resp = await fetch(f.download_url);
          return resp.ok ? resp.text() : '';
        })
      );

      return contents.filter(Boolean);
    }
    return [];
  } catch {
    return [];
  }
}
```

### Step 4: Run to verify pass

```
npx vitest run src/skills/sources/github-source.test.ts
```
Expected: PASS (4 tests)

### Step 5: Commit

```bash
git add src/skills/sources/github-source.ts src/skills/sources/github-source.test.ts
git commit -m "feat: add GitHub skill source fetcher"
```

---

## Task 4: npm (unpkg) source fetcher

**Files:**
- Create: `src/skills/sources/npm-source.ts`
- Create: `src/skills/sources/npm-source.test.ts`

### Step 1: Write the failing tests

```ts
// src/skills/sources/npm-source.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { fetchNpmSkills } from './npm-source';

describe('fetchNpmSkills', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches skill files from unpkg for a package', async () => {
    // unpkg file listing
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          files: [
            { path: '/skills/brainstorming.md' },
            { path: '/README.md' },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('---\nname: brainstorming\n---\n# Content') })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('# README') });

    const results = await fetchNpmSkills('@obra/superpowers-skills');
    expect(results).toHaveLength(2);
  });

  it('returns empty array on fetch failure', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));
    const results = await fetchNpmSkills('some-package');
    expect(results).toHaveLength(0);
  });
});
```

### Step 2: Run to verify failure

```
npx vitest run src/skills/sources/npm-source.test.ts
```
Expected: FAIL

### Step 3: Implement

```ts
// src/skills/sources/npm-source.ts
export async function fetchNpmSkills(packageName: string): Promise<string[]> {
  try {
    const encodedPkg = encodeURIComponent(packageName);
    const listResp = await fetch(`https://unpkg.com/${encodedPkg}/?meta`);
    if (!listResp.ok) return [];

    const meta = (await listResp.json()) as { files?: Array<{ path: string }> };
    const mdPaths = (meta.files ?? []).filter((f) => f.path.endsWith('.md')).map((f) => f.path);

    const contents = await Promise.all(
      mdPaths.map(async (p) => {
        const resp = await fetch(`https://unpkg.com/${encodedPkg}${p}`);
        return resp.ok ? resp.text() : '';
      })
    );

    return contents.filter(Boolean);
  } catch {
    return [];
  }
}
```

### Step 4: Run to verify pass

```
npx vitest run src/skills/sources/npm-source.test.ts
```
Expected: PASS (2 tests)

### Step 5: Commit

```bash
git add src/skills/sources/npm-source.ts src/skills/sources/npm-source.test.ts
git commit -m "feat: add npm/unpkg skill source fetcher"
```

---

## Task 5: Superpowers marketplace source fetcher

**Files:**
- Create: `src/skills/sources/marketplace-source.ts`
- Create: `src/skills/sources/marketplace-source.test.ts`

### Step 1: Write the failing tests

```ts
// src/skills/sources/marketplace-source.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { fetchMarketplaceSkills } from './marketplace-source';

describe('fetchMarketplaceSkills', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches skills from the marketplace registry', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          skills: ['brainstorming', 'tdd'],
          baseUrl: 'https://registry.example.com/superpowers/4.3.1/skills',
        }),
      })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('---\nname: brainstorming\n---\n# Content') })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('---\nname: tdd\n---\n# TDD') });

    const results = await fetchMarketplaceSkills('superpowers', '4.3.1');
    expect(results).toHaveLength(2);
  });

  it('returns empty array on registry failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    const results = await fetchMarketplaceSkills('superpowers', '4.3.1');
    expect(results).toHaveLength(0);
  });

  it('returns empty array on network error', async () => {
    mockFetch.mockRejectedValue(new Error('timeout'));
    const results = await fetchMarketplaceSkills('superpowers', 'latest');
    expect(results).toHaveLength(0);
  });
});
```

### Step 2: Run to verify failure

```
npx vitest run src/skills/sources/marketplace-source.test.ts
```
Expected: FAIL

### Step 3: Implement

```ts
// src/skills/sources/marketplace-source.ts
const REGISTRY_BASE = 'https://registry.superpowers.ai';

export async function fetchMarketplaceSkills(slug: string, version = 'latest'): Promise<string[]> {
  try {
    const metaResp = await fetch(`${REGISTRY_BASE}/${slug}/${version}/manifest.json`);
    if (!metaResp.ok) return [];

    const meta = (await metaResp.json()) as { skills?: string[]; baseUrl?: string };
    const skillNames = meta.skills ?? [];
    const baseUrl = meta.baseUrl ?? `${REGISTRY_BASE}/${slug}/${version}/skills`;

    const contents = await Promise.all(
      skillNames.map(async (name) => {
        const resp = await fetch(`${baseUrl}/${name}.md`);
        return resp.ok ? resp.text() : '';
      })
    );

    return contents.filter(Boolean);
  } catch {
    return [];
  }
}
```

> **Note:** The marketplace registry URL (`registry.superpowers.ai`) is a placeholder. Update `REGISTRY_BASE` in `marketplace-source.ts` when the actual registry URL is known.

### Step 4: Run to verify pass

```
npx vitest run src/skills/sources/marketplace-source.test.ts
```
Expected: PASS (3 tests)

### Step 5: Commit

```bash
git add src/skills/sources/marketplace-source.ts src/skills/sources/marketplace-source.test.ts
git commit -m "feat: add superpowers marketplace skill source fetcher"
```

---

## Task 6: SkillMatcher

**Files:**
- Create: `src/skills/skill-matcher.ts`
- Create: `src/skills/skill-matcher.test.ts`

### Step 1: Write the failing tests

```ts
// src/skills/skill-matcher.test.ts
import { describe, it, expect } from 'vitest';
import { SkillMatcher } from './skill-matcher';

const SKILLS = [
  { name: 'brainstorming', description: 'Use before creative work — explore requirements and design before implementation' },
  { name: 'systematic-debugging', description: 'Use when encountering bugs test failures or unexpected behavior' },
  { name: 'tdd', description: 'Use when implementing features test-driven development write tests first' },
];

describe('SkillMatcher', () => {
  const matcher = new SkillMatcher();

  it('matches a debugging message to systematic-debugging', () => {
    const matches = matcher.match('I have a bug in my code and the tests are failing', SKILLS);
    expect(matches[0]).toBe('systematic-debugging');
  });

  it('matches a feature message to tdd', () => {
    const matches = matcher.match('I need to implement a new feature with tests', SKILLS);
    expect(matches).toContain('tdd');
  });

  it('matches a design message to brainstorming', () => {
    const matches = matcher.match('I want to design and implement a new component', SKILLS);
    expect(matches).toContain('brainstorming');
  });

  it('returns at most topN matches', () => {
    const matches = matcher.match('implement tests for this feature bug design', SKILLS, 2);
    expect(matches.length).toBeLessThanOrEqual(2);
  });

  it('returns empty array for unrelated message', () => {
    const matches = matcher.match('hello how are you', SKILLS);
    expect(matches).toHaveLength(0);
  });

  it('returns empty array when no skills provided', () => {
    const matches = matcher.match('implement feature with tests', []);
    expect(matches).toHaveLength(0);
  });
});
```

### Step 2: Run to verify failure

```
npx vitest run src/skills/skill-matcher.test.ts
```
Expected: FAIL

### Step 3: Implement

```ts
// src/skills/skill-matcher.ts
const STOP_WORDS = new Set(['a', 'an', 'the', 'is', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'with', 'i', 'my', 'this', 'that', 'it', 'have', 'need', 'want']);
const THRESHOLD = 0.15;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

export class SkillMatcher {
  match(
    message: string,
    skills: { name: string; description: string }[],
    topN = 2
  ): string[] {
    if (skills.length === 0) return [];

    const messageTokens = new Set(tokenize(message));
    if (messageTokens.size === 0) return [];

    const scored = skills.map((skill) => {
      const skillTokens = tokenize(`${skill.name} ${skill.description}`);
      const overlap = skillTokens.filter((t) => messageTokens.has(t)).length;
      const score = skillTokens.length > 0 ? overlap / skillTokens.length : 0;
      return { name: skill.name, score };
    });

    return scored
      .filter((s) => s.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, topN)
      .map((s) => s.name);
  }
}
```

### Step 4: Run to verify pass

```
npx vitest run src/skills/skill-matcher.test.ts
```
Expected: PASS (6 tests)

### Step 5: Commit

```bash
git add src/skills/skill-matcher.ts src/skills/skill-matcher.test.ts
git commit -m "feat: add TF-IDF keyword SkillMatcher"
```

---

## Task 7: Settings + package.json configuration

**Files:**
- Modify: `src/core/settings.ts`
- Modify: `package.json`

### Step 1: Add settings getter

In `src/core/settings.ts`, add after `completionsMaxContextLines`:

```ts
get skillSources(): SkillSourceConfig[] {
  return this.config.get<SkillSourceConfig[]>('skills.sources', []);
}
```

Add the interface at the top of the file (before the class):

```ts
export interface SkillSourceConfig {
  type: 'github' | 'npm' | 'marketplace' | 'local';
  url?: string;      // github
  package?: string;  // npm
  slug?: string;     // marketplace
  version?: string;  // marketplace
  path?: string;     // local
}
```

### Step 2: Add configuration schema to `package.json`

Inside `"contributes"."configuration"."properties"`, add:

```json
"lucentCode.skills.sources": {
  "type": "array",
  "default": [],
  "description": "Skill set sources. Each entry is an object with a 'type' and type-specific fields.",
  "items": {
    "type": "object",
    "properties": {
      "type": {
        "type": "string",
        "enum": ["github", "npm", "marketplace", "local"],
        "description": "Source type"
      },
      "url": { "type": "string", "description": "GitHub repo URL (for type: github)" },
      "package": { "type": "string", "description": "npm package name (for type: npm)" },
      "slug": { "type": "string", "description": "Marketplace slug (for type: marketplace)" },
      "version": { "type": "string", "description": "Marketplace version (for type: marketplace), defaults to latest" },
      "path": { "type": "string", "description": "Local directory path (for type: local)" }
    },
    "required": ["type"]
  }
}
```

Also inside `"contributes"."commands"`, add three new commands:

```json
{
  "command": "lucentCode.browseSkills",
  "title": "Browse Skills",
  "category": "Lucent Code"
},
{
  "command": "lucentCode.addSkillSource",
  "title": "Add Skill Source",
  "category": "Lucent Code"
},
{
  "command": "lucentCode.refreshSkills",
  "title": "Refresh Skills",
  "category": "Lucent Code"
}
```

### Step 3: Run existing tests to confirm no regression

```
npx vitest run
```
Expected: All existing tests still PASS

### Step 4: Commit

```bash
git add src/core/settings.ts package.json
git commit -m "feat: add skills.sources setting and three skill commands to package.json"
```

---

## Task 8: Shared types — skill message protocol

**Files:**
- Modify: `src/shared/types.ts`

### Step 1: Add skill types

Add a `SkillSummary` interface and extend the message protocol.

After `ConversationSummary` interface, add:

```ts
export interface SkillSummary {
  name: string;
  description: string;
}
```

In `ExtensionMessage` union, add:

```ts
| { type: 'skillsLoaded'; skills: SkillSummary[] }
| { type: 'skillContent'; name: string; content: string | null }
```

In `WebviewMessage` union, add:

```ts
| { type: 'getSkillContent'; name: string }
```

### Step 2: Run existing tests to confirm no regression

```
npx vitest run
```
Expected: All existing tests still PASS

### Step 3: Commit

```bash
git add src/shared/types.ts
git commit -m "feat: add SkillSummary and skill message types to protocol"
```

---

## Task 9: MessageHandler — skill integration

**Files:**
- Modify: `src/lsp/editor-tools.ts`
- Modify: `src/chat/message-handler.ts`
- Modify: `src/chat/message-handler.test.ts`

### Step 1: Add USE_SKILL_TOOL_DEFINITION to editor-tools.ts

At the bottom of `src/lsp/editor-tools.ts`, add:

```ts
export const USE_SKILL_TOOL_DEFINITION: ToolDefinition = {
  type: 'function',
  function: {
    name: 'use_skill',
    description: 'Load a skill\'s full instructions to guide your approach for a specific task. Call this when a skill listed in Available Skills is relevant.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The skill name as listed in Available Skills' },
      },
      required: ['name'],
    },
  },
};
```

### Step 2: Write failing tests for MessageHandler skill handling

In `src/chat/message-handler.test.ts`, add a new describe block. Look at the existing test file structure first:

```
npx vitest run src/chat/message-handler.test.ts
```

Then add tests for skill handling. The existing tests mock `OpenRouterClient`. Add to the existing test file:

```ts
// --- Skill integration tests ---
// Add these inside the existing describe block or a new one.
// Requires a SkillRegistry mock.

import { SkillRegistry } from '../skills/skill-registry';

// In the test setup area, add:
const mockSkillRegistry = {
  get: vi.fn(),
  getSummaries: vi.fn(() => [{ name: 'tdd', description: 'Test-driven development' }]),
  getAll: vi.fn(() => []),
} as unknown as SkillRegistry;

it('includes skill advertisement in system message when registry is set', async () => {
  // Set up handler with skill registry
  // Send a message
  // Verify the system message content includes "## Available Skills"
  // (Check the messages passed to client.chatStream)
});

it('handles use_skill tool call by returning skill content', async () => {
  mockSkillRegistry.get = vi.fn().mockReturnValue({
    name: 'tdd', description: 'TDD', content: '# TDD\nWrite tests first.', source: 'local'
  });
  // Mock finish_reason: 'tool_calls' with use_skill call, then stop
  // Verify the tool result message contains the skill content
});

it('handles use_skill for unknown skill with error message', async () => {
  mockSkillRegistry.get = vi.fn().mockReturnValue(undefined);
  // Verify tool result contains "Skill not found: unknown-skill"
});
```

> **Note:** Write these tests against the actual test file structure. Read `src/chat/message-handler.test.ts` before writing — match its mock setup exactly.

### Step 3: Modify MessageHandler constructor and handleSendMessage

**In `src/chat/message-handler.ts`:**

1. Add import at top:
```ts
import { SkillRegistry } from '../skills/skill-registry';
import { SkillMatcher } from '../skills/skill-matcher';
import { USE_SKILL_TOOL_DEFINITION } from '../lsp/editor-tools';
```

2. Add to constructor parameters (after `terminalBuffer`):
```ts
private readonly skillRegistry?: SkillRegistry
```

3. Add `SkillMatcher` instantiation as a private field:
```ts
private readonly skillMatcher = new SkillMatcher();
```

4. In `handleSendMessage`, replace:
```ts
const tools = this.toolExecutor ? TOOL_DEFINITIONS : undefined;
```
With:
```ts
const skillTools = this.skillRegistry ? [USE_SKILL_TOOL_DEFINITION] : [];
const editorTools = this.toolExecutor ? TOOL_DEFINITIONS : [];
const allTools = [...skillTools, ...editorTools];
const tools = allTools.length > 0 ? allTools : undefined;
```

5. In `handleSendMessage`, after building `systemMessage`, add skill advertisement:
```ts
const skillSummaries = this.skillRegistry?.getSummaries() ?? [];
const skillAdvertisement = skillSummaries.length > 0
  ? `\n\n## Available Skills\nThe following skills are available. Use the \`use_skill\` tool when a skill is relevant.\n\n${skillSummaries.map((s) => `- ${s.name}: ${s.description}`).join('\n')}`
  : '';
systemMessage.content = [systemMessage.content, skillAdvertisement].filter(Boolean).join('');
```

6. In `handleSendMessage`, after building `userContent` and before `this.conversationMessages.push(...)`, add semantic pre-injection:
```ts
const skillMatches = this.skillRegistry
  ? this.skillMatcher.match(content, this.skillRegistry.getSummaries())
  : [];
const skillBlocks = skillMatches
  .map((name) => this.skillRegistry?.get(name))
  .filter(Boolean)
  .map((s) => `<skill name="${s!.name}">\n${s!.content}\n</skill>`)
  .join('\n\n');
const enrichedContent = skillBlocks
  ? `${skillBlocks}\n\n${typeof userContent === 'string' ? userContent : content}`
  : userContent;
// Replace userContent with enrichedContent in the push below
```

Then change the push to use `enrichedContent`:
```ts
this.conversationMessages.push({ role: 'user', content: enrichedContent });
```

7. In the tool execution loop, before calling `this.toolExecutor.execute(...)`, add:
```ts
if (tc.function.name === 'use_skill') {
  const skillName = (args.name as string) ?? '';
  const skill = this.skillRegistry?.get(skillName);
  this.conversationMessages.push({
    role: 'tool',
    tool_call_id: tc.id,
    content: skill ? skill.content : `Skill not found: ${skillName}`,
  });
  continue;
}
```

Note: `use_skill` is NOT in `GATED_TOOLS` — no approval needed.

### Step 4: Run all tests

```
npx vitest run
```
Expected: All tests PASS (including any new skill handler tests)

### Step 5: Commit

```bash
git add src/lsp/editor-tools.ts src/chat/message-handler.ts src/chat/message-handler.test.ts
git commit -m "feat: integrate SkillRegistry and SkillMatcher into MessageHandler with use_skill tool"
```

---

## Task 10: Extension wiring — SkillRegistry init, commands, status bar

**Files:**
- Modify: `src/extension.ts`

### Step 1: Add imports and SkillRegistry init

At top of `extension.ts`, add:
```ts
import { SkillRegistry } from './skills/skill-registry';
import { fetchGitHubSkills } from './skills/sources/github-source';
import { fetchNpmSkills } from './skills/sources/npm-source';
import { fetchMarketplaceSkills } from './skills/sources/marketplace-source';
import * as fs from 'fs/promises';
import * as path from 'path';
```

In the `activate` function, after constructing `settings`, add:

```ts
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
        const files = await fs.readdir(expandedPath).catch(() => []);
        for (const file of files as string[]) {
          if (file.endsWith('.md')) {
            const content = await fs.readFile(path.join(expandedPath, file), 'utf8').catch(() => '');
            if (content) ownMarkdowns.push(content);
          }
        }
      }
    } catch {
      // skip failing source
    }
  }

  const preloaded = ownMarkdowns.length > 0
    ? [{ type: 'local' as const, content: new Map(ownMarkdowns.map((md, i) => [String(i), md])) }]
    : [];
  await skillRegistry.load(preloaded);
}

await loadSkills();
```

Add `import * as os from 'os';` at the top (if not already present).

### Step 2: Pass skillRegistry to MessageHandler

Find where `MessageHandler` is constructed (search for `new MessageHandler`) and add `skillRegistry` as the last argument.

### Step 3: Add skill status bar item

After the auth status bar item setup, add:

```ts
const skillsStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 89);
context.subscriptions.push(skillsStatusBar);

function updateSkillsStatus(): void {
  const count = skillRegistry.getAll().length;
  if (count > 0) {
    skillsStatusBar.text = `$(book) ${count} skills`;
    skillsStatusBar.tooltip = `Lucent Code: ${count} skills loaded`;
    skillsStatusBar.show();
    setTimeout(() => skillsStatusBar.hide(), 5000);
  }
}
updateSkillsStatus();
```

### Step 4: Add browseSkills, addSkillSource, refreshSkills commands

```ts
context.subscriptions.push(
  vscode.commands.registerCommand('lucentCode.browseSkills', async () => {
    const summaries = skillRegistry.getSummaries();
    if (summaries.length === 0) {
      vscode.window.showInformationMessage('No skills loaded. Add sources via "Lucent Code: Add Skill Source".');
      return;
    }
    const items = summaries.map((s) => ({ label: s.name, description: s.description }));
    const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select a skill to insert' });
    if (picked) {
      // Post to webview to insert skill chip
      chatProvider.postMessage({ type: 'skillsLoaded', skills: [{ name: picked.label, description: picked.description ?? '' }] });
      vscode.window.showInformationMessage(`Skill "${picked.label}" selected — switch to chat to use it.`);
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

    let newSource: Record<string, string> = { type: typeItem.label };

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
    vscode.window.showInformationMessage(`Skill source added and refreshed.`);
  }),

  vscode.commands.registerCommand('lucentCode.refreshSkills', async () => {
    await loadSkills();
    updateSkillsStatus();
    const count = skillRegistry.getAll().length;
    vscode.window.showInformationMessage(`Skills refreshed: ${count} skills loaded.`);
  })
);
```

### Step 5: Send skillsLoaded to webview on ready

In the `'ready'` handler inside the webview message handler (in `chat-provider.ts` or wherever `postMessage` calls happen), you need to send the skill list when the webview is ready. Find where `ready` is handled in `message-handler.ts` and add:

```ts
case 'ready': {
  // ... existing ready handling ...
  // Add after existing postMessage calls:
  const skillSummaries = this.skillRegistry?.getSummaries() ?? [];
  if (skillSummaries.length > 0) {
    postMessage({ type: 'skillsLoaded', skills: skillSummaries });
  }
  break;
}
```

### Step 6: Run all tests

```
npx vitest run
```
Expected: All tests PASS

### Step 7: Commit

```bash
git add src/extension.ts
git commit -m "feat: wire SkillRegistry in extension — init, commands, status bar, ready handler"
```

---

## Task 11: Webview — chat store + App.tsx skill handling

**Files:**
- Modify: `webview/src/stores/chat.ts`
- Modify: `webview/src/App.tsx`

### Step 1: Add skills to chat store

In `webview/src/stores/chat.ts`, add a `availableSkills` signal and handler.

Read the file first, then add:
- `const [availableSkills, setAvailableSkills] = createSignal<{ name: string; description: string }[]>([]);`
- `handleSkillsLoaded(skills: { name: string; description: string }[]) { setAvailableSkills(skills); }`
- Export `availableSkills` and `handleSkillsLoaded` in the `chatStore` object

### Step 2: Handle skillsLoaded in App.tsx

In `webview/src/App.tsx`, in the `window.addEventListener('message', ...)` switch block, add:

```ts
case 'skillsLoaded':
  chatStore.handleSkillsLoaded(message.skills);
  break;
```

### Step 3: Add handleResolveSkill function to App.tsx

```ts
const handleResolveSkill = (name: string): Promise<string | null> => {
  return new Promise((resolve) => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as { type: string; name?: string; content?: string | null };
      if (msg.type === 'skillContent' && msg.name === name) {
        window.removeEventListener('message', handler);
        resolve(msg.content ?? null);
      }
    };
    window.addEventListener('message', handler);
    vscode.postMessage({ type: 'getSkillContent', name });
    setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve(null);
    }, 5000);
  });
};
```

### Step 4: Pass skills to ChatInput

In App.tsx, update the `ChatInput` usage:
```tsx
<ChatInput
  onSend={handleSend}
  onCancel={chatStore.cancelRequest}
  isStreaming={chatStore.isStreaming()}
  onResolveMention={handleResolveMention}
  skills={chatStore.availableSkills()}
  onResolveSkill={handleResolveSkill}
/>
```

### Step 5: Handle getSkillContent in MessageHandler

In `src/chat/message-handler.ts`, add to the `handleMessage` switch:

```ts
case 'getSkillContent': {
  const skill = this.skillRegistry?.get(message.name);
  postMessage({ type: 'skillContent', name: message.name, content: skill?.content ?? null });
  break;
}
```

### Step 6: Run all tests

```
npx vitest run
```
Expected: All tests PASS

### Step 7: Commit

```bash
git add webview/src/stores/chat.ts webview/src/App.tsx src/chat/message-handler.ts
git commit -m "feat: wire skill list to webview — store, App.tsx, getSkillContent handler"
```

---

## Task 12: ChatInput — slash autocomplete + skill chips

**Files:**
- Modify: `webview/src/components/ChatInput.tsx`

### Step 1: Read the current file fully

Read `webview/src/components/ChatInput.tsx` — you need to know the exact structure before modifying. (Already read above.)

### Step 2: Add new props interface fields

Update `ChatInputProps`:
```ts
interface ChatInputProps {
  onSend: (content: string, images: string[]) => void;
  onCancel: () => void;
  isStreaming: boolean;
  onResolveMention: (type: string) => Promise<string | null>;
  skills: { name: string; description: string }[];        // NEW
  onResolveSkill: (name: string) => Promise<string | null>; // NEW
}
```

### Step 3: Add signals for slash autocomplete and skill chips

After existing signals, add:

```ts
const [showSkills, setShowSkills] = createSignal(false);
const [skillFilter, setSkillFilter] = createSignal('');
const [skillChips, setSkillChips] = createSignal<{ name: string; content: string }[]>([]);
```

### Step 4: Update handleInput to detect `/` trigger

In `handleInput`, after the `@` detection logic, add:

```ts
// Detect / trigger for skills
const lastSlash = value.lastIndexOf('/');
if (lastSlash !== -1 && (lastSlash === 0 || value[lastSlash - 1] === ' ')) {
  const after = value.slice(lastSlash + 1);
  if (!after.includes(' ')) {
    setSkillFilter(after.toLowerCase());
    setShowSkills(true);
    return;
  }
}
setShowSkills(false);
```

Also clear `showSkills` in Escape handler:
```ts
if (e.key === 'Escape') {
  setShowMentions(false);
  setShowSkills(false);
  return;
}
```

### Step 5: Add selectSkill handler

```ts
const selectSkill = async (skill: { name: string; description: string }) => {
  setShowSkills(false);
  setIsResolvingMention(true);
  // Remove the /filter text from input
  const value = input();
  const lastSlash = value.lastIndexOf('/');
  setInput(lastSlash !== -1 ? value.slice(0, lastSlash) : value);
  try {
    const content = await props.onResolveSkill(skill.name);
    if (content !== null) {
      setSkillChips((prev) => {
        if (prev.some((c) => c.name === skill.name)) return prev; // no duplicates
        return [...prev, { name: skill.name, content }];
      });
    }
  } finally {
    setIsResolvingMention(false);
  }
};
```

### Step 6: Update handleSend to prepend skill blocks

In `handleSend`, after building `terminalPart`, add:

```ts
const skillBlocks = skillChips()
  .map((c) => `<skill name="${c.name}">\n${c.content}\n</skill>`)
  .join('\n\n');
const fullContent = [skillBlocks || null, terminalPart, ...textParts, input().trim()].filter(Boolean).join('\n\n');
```

Also reset skill chips on send:
```ts
setSkillChips([]);
```

### Step 7: Add filtered skills computed value

```ts
const filteredSkills = () =>
  props.skills.filter((s) => s.name.toLowerCase().includes(skillFilter()));
```

### Step 8: Add JSX for skill dropdown and chips

**Skill dropdown** (add after `showMentions` Show block):
```tsx
<Show when={showSkills() && filteredSkills().length > 0}>
  <div class="mention-dropdown">
    <For each={filteredSkills()}>
      {(skill) => (
        <button
          class="mention-item"
          onMouseDown={(e) => { e.preventDefault(); void selectSkill(skill); }}
        >
          <span class="mention-item-label">/{skill.name}</span>
          <span class="mention-item-desc">{skill.description}</span>
        </button>
      )}
    </For>
  </div>
</Show>
```

**Skill chips** (add inside the `attachment-chips` Show condition and For block):

Update the `Show` condition:
```tsx
<Show when={attachments().length > 0 || terminalContent() !== null || terminalError() || skillChips().length > 0}>
```

Add skill chips rendering inside the `attachment-chips` div (before the `For each={attachments()}`):
```tsx
<For each={skillChips()}>
  {(chip) => (
    <div class="attachment-chip attachment-chip--skill">
      <span class="attachment-name">⚡ {chip.name}</span>
      <button
        class="attachment-remove"
        aria-label={`Remove ${chip.name} skill`}
        onClick={() => setSkillChips((prev) => prev.filter((c) => c.name !== chip.name))}
        title="Remove"
      >×</button>
    </div>
  )}
</For>
```

**⚡ toolbar button** (add after the `>_` button, before the Send/Stop Show):
```tsx
<button
  class="attach-button"
  aria-label="Browse skills"
  onClick={async () => {
    // Open the skills dropdown by simulating a / in input
    setSkillFilter('');
    setShowSkills(true);
  }}
  title="Browse skills"
  disabled={props.isStreaming || props.skills.length === 0}
>⚡</button>
```

### Step 9: Update placeholder text

```tsx
placeholder="Ask about your code... Type @ for mentions, / for skills"
```

### Step 10: Build the webview to check for TypeScript errors

```
cd webview && npx vite build
```
Expected: Build succeeds with no TypeScript errors

### Step 11: Run all extension tests

```
cd .. && npx vitest run
```
Expected: All tests PASS

### Step 12: Commit

```bash
git add webview/src/components/ChatInput.tsx
git commit -m "feat: add slash autocomplete and skill chips to ChatInput"
```

---

## Task 13: CSS for skill chips

**Files:**
- Modify: `webview/src/` CSS file (wherever `attachment-chip--terminal` is styled)

### Step 1: Find the CSS file

```
npx vitest run  # not needed for CSS, just find the file
```

Run: `ls webview/src/` to find the CSS file.

### Step 2: Add skill chip styles

Find where `.attachment-chip--terminal` is styled. Add after it:

```css
.attachment-chip--skill {
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  border: 1px solid var(--vscode-focusBorder);
}
```

### Step 3: Build webview

```
cd webview && npx vite build
```
Expected: Build succeeds

### Step 4: Commit

```bash
git add webview/src/
git commit -m "feat: add CSS for skill chip variant"
```

---

## Task 14: Update features.md

**Files:**
- Modify: `docs/features.md`

Add a new section to `features.md` after the Settings section:

```markdown
## Skill Sets

| Status | Feature | Description | Phase |
|--------|---------|-------------|-------|
| :white_check_mark: | Claude Code skill cache | Auto-loads skills from ~/.claude/plugins/cache/ and ~/.claude/skills/ | - |
| :white_check_mark: | GitHub repo source | Fetch skills from any public GitHub repository | - |
| :white_check_mark: | npm/unpkg source | Fetch skills from npm packages via unpkg.com | - |
| :white_check_mark: | Superpowers marketplace | Fetch versioned skill packs from the superpowers registry | - |
| :white_check_mark: | Local directory source | Load skills from a local directory | - |
| :white_check_mark: | Skill advertisement | System prompt lists available skills (name + description) each turn | - |
| :white_check_mark: | Semantic pre-injection | TF-IDF matching auto-injects relevant skills before model responds | - |
| :white_check_mark: | use_skill tool | Model can explicitly request a skill's full content via tool call | - |
| :white_check_mark: | Slash command autocomplete | Type /skill-name to select and attach a skill chip | - |
| :white_check_mark: | Skill browser | ⚡ button + browseSkills command opens quick pick of all loaded skills | - |
| :white_check_mark: | Add/refresh commands | addSkillSource wizard and refreshSkills command | - |
```

### Step 1: Update the file, then commit

```bash
git add docs/features.md
git commit -m "docs: add skill sets feature inventory to features.md"
```

---

## Plan complete and saved to `docs/plans/2026-03-18-skill-sets-plan.md`.

**Two execution options:**

**1. Subagent-Driven (this session)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** — Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
