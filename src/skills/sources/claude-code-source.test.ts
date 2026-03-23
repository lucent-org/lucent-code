import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';

const { mockReaddir, mockReadFile } = vi.hoisted(() => ({
  mockReaddir: vi.fn(),
  mockReadFile: vi.fn(),
}));

vi.mock('fs/promises', () => ({ readdir: mockReaddir, readFile: mockReadFile }));

const { fetchClaudeCodeSkills } = await import('./claude-code-source');

describe('fetchClaudeCodeSkills', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array when ~/.claude/skills does not exist', async () => {
    mockReaddir.mockRejectedValue(new Error('ENOENT'));
    expect(await fetchClaudeCodeSkills()).toEqual([]);
  });

  it('reads SKILL.md from each subdirectory', async () => {
    mockReaddir.mockResolvedValueOnce([
      { name: 'tdd', isDirectory: () => true },
      { name: 'not-a-dir.md', isDirectory: () => false },
    ]);
    mockReadFile.mockResolvedValueOnce('---\nname: tdd\ndescription: test driven\n---\n# TDD');
    const result = await fetchClaudeCodeSkills();
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('name: tdd');
  });

  it('skips subdirectory when SKILL.md is missing', async () => {
    mockReaddir.mockResolvedValueOnce([{ name: 'broken', isDirectory: () => true }]);
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    expect(await fetchClaudeCodeSkills()).toEqual([]);
  });

  it('uses the correct path: ~/.claude/skills', async () => {
    mockReaddir.mockRejectedValue(new Error('ENOENT'));
    await fetchClaudeCodeSkills();
    const expectedDir = path.join(os.homedir(), '.claude', 'skills');
    expect(mockReaddir.mock.calls[0][0]).toBe(expectedDir);
  });

  it('skips files that exceed 50KB', async () => {
    mockReaddir.mockResolvedValueOnce([{ name: 'big', isDirectory: () => true }]);
    mockReadFile.mockResolvedValueOnce('x'.repeat(51 * 1024));
    expect(await fetchClaudeCodeSkills()).toEqual([]);
  });
});
