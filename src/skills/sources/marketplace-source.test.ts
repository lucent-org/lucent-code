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
