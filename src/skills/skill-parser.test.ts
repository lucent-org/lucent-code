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

  it('ignores unknown frontmatter fields like type', () => {
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

  it('returns empty body for frontmatter with no content', () => {
    const md = `---\nname: foo\ndescription: bar\n---\n`;
    const result = parseFrontmatter(md);
    expect(result.name).toBe('foo');
    expect(result.body).toBe('');
  });

  it('handles Windows CRLF line endings', () => {
    const md = `---\r\nname: win\r\ndescription: Windows\r\n---\r\nbody content`;
    const result = parseFrontmatter(md);
    expect(result.name).toBe('win');
    expect(result.description).toBe('Windows');
  });
});
