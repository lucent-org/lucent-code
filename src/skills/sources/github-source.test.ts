import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { fetchGitHubSkills } from './github-source';

const SKILL_MD = `---\nname: brainstorming\ndescription: Use before creative work\n---\n# Content`;

describe('fetchGitHubSkills', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches and returns skill markdown files from a GitHub repo', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([
          { name: 'brainstorming.md', type: 'file', download_url: 'https://raw.githubusercontent.com/test/repo/main/skills/brainstorming.md' },
          { name: 'README.md', type: 'file', download_url: 'https://raw.githubusercontent.com/test/repo/main/skills/README.md' },
        ]),
      })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(SKILL_MD) })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('# README') });

    const results = await fetchGitHubSkills('https://github.com/test/repo');
    expect(results).toHaveLength(2);
    expect(results[0]).toBe(SKILL_MD);
  });

  it('searches common skill directories (skills/, .claude/skills/)', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({
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
