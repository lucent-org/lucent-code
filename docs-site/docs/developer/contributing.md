---
sidebar_position: 6
title: Contributing
description: Commit style, PR process, how to add built-in skills, and running regression tests.
---

# Contributing

## Commit Style

Lucent Code uses [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

feat(chat): add @model mention for inline model switching
fix(skills): strip surrounding quotes from frontmatter values
docs: add getting-started page
refactor(mcp): extract tool namespacing into helper function
```

**Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`

**Scopes (optional):** `chat`, `skills`, `mcp`, `tools`, `search`, `webview`, `build`

Keep the subject line under 72 characters. Use the body for motivation and context when needed.

## Pull Requests

1. Fork the repo and create a feature branch: `git checkout -b feat/your-feature`
2. Make changes, commit with Conventional Commits style
3. Ensure `npm run build` succeeds with no TypeScript errors
4. Open a PR against `main`
5. Title the PR like a commit subject

Small, focused PRs are easier to review than large ones. If you're making a significant change, open an issue first to discuss the approach.

## Adding a Built-in Skill

1. Create `src/skills/builtin/your-skill.md`:

   ```markdown
   ---
   name: your-skill
   description: One sentence describing what this skill does
   ---

   Your prompt content here.
   ```

2. Import and export in `src/skills/builtin/index.ts`:

   ```typescript
   import yourSkill from './your-skill.md';

   export const BUILTIN_SKILLS: readonly string[] = [
     // existing skills...
     yourSkill,
   ];
   ```

3. Test against a live model before submitting:

   ```bash
   node scripts/test-skills-full.mjs
   ```

4. Commit:
   ```bash
   git commit -m "feat(skills): add your-skill built-in skill"
   ```

## Regression Testing Skills

`scripts/test-skills-full.mjs` tests every built-in skill by calling the OpenRouter API. It checks:
- Model returns a response (not empty)
- Response is within expected length bounds
- Response follows the skill's stated output format

Set your API key before running:
```bash
export OPENROUTER_API_KEY=sk-or-v1-...
node scripts/test-skills-full.mjs
```

## Code Style

- TypeScript strict mode (`"strict": true`)
- No `any` types
- Prefer `const` over `let`
- No default exports in `src/` (named exports only); webview components use default exports
- Shared types go in `src/shared/types.ts` — never duplicate types across files
- Messages between extension and webview must go through the typed protocol — no side channels

## Project Structure Conventions

- `src/` — extension host (Node.js / VS Code API)
- `webview/src/` — SolidJS UI
- `src/shared/` — types shared between host and webview
- `src/skills/builtin/` — built-in skill `.md` files
- `docs/plans/` — internal design and implementation plans (not public docs)
- `docs-site/` — this documentation site
- `marketing/` — lucentcode.dev marketing site
- `scripts/` — utility and test scripts
