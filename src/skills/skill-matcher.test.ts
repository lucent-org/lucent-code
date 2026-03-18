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
