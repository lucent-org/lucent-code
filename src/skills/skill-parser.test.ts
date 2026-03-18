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
