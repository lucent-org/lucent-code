---
sidebar_position: 2
title: Adding Skills
description: How to write a skill file, the frontmatter spec, and how skills are loaded from different sources.
---

# Adding Skills

A **skill** is a Markdown file with a YAML frontmatter header. The body is the prompt that gets sent to the AI when the skill is invoked.

## Skill File Format

```markdown
---
name: my-skill
description: One sentence describing what this skill does
---

Your prompt here. Write clear, structured instructions for the AI.

Include examples, output formats, and any constraints you want enforced.
```

**Frontmatter fields:**

| Field | Required | Description |
|---|---|---|
| `name` | Yes | Slug used in the `/` picker and for `use_skill` tool calls |
| `description` | Yes | Shown in the skill picker and system prompt — keep it to one sentence |

The `name` and `description` values may optionally be quoted (single or double quotes — both are stripped).

## Built-in Skills

Built-in skills live in `src/skills/builtin/` as individual `.md` files. They're bundled at build time by esbuild's text loader.

To add a new built-in skill:

1. Create `src/skills/builtin/your-skill.md` with frontmatter
2. Import it in `src/skills/builtin/index.ts`:
   ```typescript
   import yourSkill from './your-skill.md';
   export const BUILTIN_SKILLS: readonly string[] = [
     // ... existing skills ...
     yourSkill,
   ];
   ```
3. Build: `npm run build`

## User Skills (`~/.claude/skills/`)

Create a directory per skill:

```
~/.claude/skills/
  my-skill/
    SKILL.md       ← skill content (frontmatter + body)
  another-skill/
    SKILL.md
```

Lucent Code reads each subdirectory's `SKILL.md` on startup.

## Skill Sources

Skills are loaded from multiple sources, appearing in the picker grouped by source label:

| Label | Source |
|---|---|
| `builtin` | Bundled with the extension |
| `claude` | `~/.claude/skills/` and `~/.claude/plugins/cache/` |
| `github` | Fetched from a GitHub repository |
| `npm` | Fetched from an npm package via unpkg.com |
| `marketplace` | Fetched from the Superpowers registry |
| `local` | Loaded from a local directory path |

## SkillRegistry API

`src/skills/skill-registry.ts` — central registry:

```typescript
class SkillRegistry {
  load(content: string, source?: string): void    // parse and index one skill
  clear(): void                                    // reset all loaded skills
  get(name: string): Skill | undefined
  getSummaries(): SkillSummary[]                  // name + description + source
  getContent(name: string): string | undefined    // full body
}
```

`getSummaries()` is called when building the system prompt (lightweight — no body content). `getContent()` is called when the AI invokes `use_skill`.

## Writing Good Skills

- **Be specific about output format.** The AI will follow explicit format instructions. Vague instructions produce inconsistent output.
- **Show don't tell.** Include a concrete example of the expected output in the skill body.
- **Keep descriptions scannable.** The description appears in the AI's system prompt — one sentence is enough.
- **YAGNI.** Don't add instructions for edge cases that won't come up. Longer prompts don't mean better results.
