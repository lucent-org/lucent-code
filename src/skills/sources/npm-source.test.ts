import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { fetchNpmSkills } from './npm-source';

describe('fetchNpmSkills', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches skill files from unpkg for a package', async () => {
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
