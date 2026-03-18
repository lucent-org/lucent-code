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
    mockStat.mockRejectedValue(new Error('not found'));
    mockReaddir.mockResolvedValue([]);
  });

  it('starts empty', () => {
    expect(registry.getAll()).toHaveLength(0);
  });

  it('loads skills from Claude Code plugins cache when directory exists', async () => {
    mockStat.mockResolvedValueOnce({ isDirectory: () => true });
    mockReaddir
      .mockResolvedValueOnce([{ name: 'superpowers', isDirectory: () => true }])
      .mockResolvedValueOnce([{ name: '4.3.1', isDirectory: () => true }])
      .mockResolvedValueOnce([{ name: 'skills', isDirectory: () => true }])
      .mockResolvedValueOnce([{ name: 'brainstorming.md', isDirectory: () => false }]);
    mockReadFile.mockResolvedValueOnce(SKILL_MD);

    await registry.load([]);

    expect(registry.getAll()).toHaveLength(1);
    expect(registry.get('brainstorming')?.description).toBe('Use before creative work');
    expect(registry.get('brainstorming')?.source).toBe('claude-code');
  });

  it('own-source skill with same name overrides Claude Code cache', async () => {
    mockStat.mockResolvedValueOnce({ isDirectory: () => true });
    mockReaddir
      .mockResolvedValueOnce([{ name: 'sp', isDirectory: () => true }])
      .mockResolvedValueOnce([{ name: '1.0', isDirectory: () => true }])
      .mockResolvedValueOnce([{ name: 'skills', isDirectory: () => true }])
      .mockResolvedValueOnce([{ name: 'brainstorming.md', isDirectory: () => false }]);
    mockReadFile.mockResolvedValueOnce(SKILL_MD);

    const overrideMd = `---\nname: brainstorming\ndescription: My custom brainstorming\n---\nCustom content`;
    await registry.load([{ type: 'local', content: new Map([['brainstorming', overrideMd]]) }]);

    expect(registry.get('brainstorming')?.description).toBe('My custom brainstorming');
    expect(registry.get('brainstorming')?.source).toBe('local');
  });

  it('returns skill summaries without content', () => {
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
