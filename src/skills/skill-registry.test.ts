// src/skills/skill-registry.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { SkillRegistry } from './skill-registry';

const SKILL_MD = `---\nname: brainstorming\ndescription: Use before creative work\n---\n# Brainstorming\nContent here.`;
const SKILL_MD2 = `---\nname: tdd\ndescription: Test-driven development\n---\n# TDD\nWrite tests first.`;

describe('SkillRegistry', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  it('starts empty', () => {
    expect(registry.getAll()).toHaveLength(0);
  });

  it('loads skills from a preloaded local source', async () => {
    await registry.load([{
      type: 'local',
      content: new Map([['brainstorming', SKILL_MD]]),
    }]);

    expect(registry.getAll()).toHaveLength(1);
    expect(registry.get('brainstorming')?.description).toBe('Use before creative work');
    expect(registry.get('brainstorming')?.source).toBe('local');
  });

  it('loads skills from multiple preloaded sources', async () => {
    await registry.load([{
      type: 'local',
      content: new Map([['brainstorming', SKILL_MD], ['tdd', SKILL_MD2]]),
    }]);

    expect(registry.getAll()).toHaveLength(2);
    expect(registry.get('tdd')?.description).toBe('Test-driven development');
  });

  it('later source overrides earlier source with same skill name', async () => {
    const overrideMd = `---\nname: brainstorming\ndescription: My custom brainstorming\n---\nCustom content`;
    await registry.load([{
      type: 'local',
      content: new Map([['a', SKILL_MD], ['b', overrideMd]]),
    }]);

    // Last write wins — overrideMd is processed after SKILL_MD
    expect(registry.get('brainstorming')?.description).toBe('My custom brainstorming');
  });

  it('clears previous skills on each load call', async () => {
    await registry.load([{
      type: 'local',
      content: new Map([['brainstorming', SKILL_MD]]),
    }]);
    expect(registry.getAll()).toHaveLength(1);

    await registry.load([]);
    expect(registry.getAll()).toHaveLength(0);
  });

  it('returns skill summaries without content', () => {
    (registry as any).skills.set('tdd', { name: 'tdd', description: 'TDD workflow', content: SKILL_MD2, source: 'local' });
    const summaries = registry.getSummaries();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toEqual({ name: 'tdd', description: 'TDD workflow' });
  });

  it('skips skills with no name in frontmatter', async () => {
    await registry.load([{
      type: 'local',
      content: new Map([['unnamed', '# No frontmatter at all']]),
    }]);
    expect(registry.getAll()).toHaveLength(0);
  });

  it('ingestFromSource stores skill with given source label', () => {
    registry.ingestFromSource(SKILL_MD, 'github');
    expect(registry.get('brainstorming')?.source).toBe('github');
    expect(registry.get('brainstorming')?.description).toBe('Use before creative work');
  });

  it('ingestFromSource later call overrides earlier call with same name', () => {
    registry.ingestFromSource(SKILL_MD, 'github');
    const override = `---\nname: brainstorming\ndescription: Overridden brainstorming\n---\nOverridden content`;
    registry.ingestFromSource(override, 'npm');
    expect(registry.get('brainstorming')?.source).toBe('npm');
    expect(registry.get('brainstorming')?.description).toBe('Overridden brainstorming');
  });

  it('ingestFromSource silently skips content exceeding 50 KB', () => {
    const oversized = `---\nname: big\ndescription: Too large\n---\n${'x'.repeat(51 * 1024)}`;
    registry.ingestFromSource(oversized, 'github');
    expect(registry.get('big')).toBeUndefined();
  });
});
