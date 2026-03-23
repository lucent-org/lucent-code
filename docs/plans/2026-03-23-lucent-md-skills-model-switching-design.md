# LUCENT.md, Built-in Skills & Model Switching Design

## Goal

Three connected improvements:
1. Rename the project instructions file to `LUCENT.md` with broad compatibility fallbacks
2. Ship a curated built-in skill pack with pull-only loading (no context bloat)
3. Add `use_model()` tool + `@model()` mention for mid-conversation model switching, including model-aware skills

## Architecture

### Section 1 — `LUCENT.md` as project instructions

**`InstructionsLoader`** gains `@skill()` parsing. After reading the file, it scans for `@skill(name)` lines, collects the names as "activated skills", and strips them from the prose before injecting into the system prompt.

File lookup order (first found wins):
```
LUCENT.md → .clinerules → .cursorrules → CLAUDE.md
```

Old `.openrouter-instructions.md` is dropped entirely — the extension is pre-1.0 and no user base has it.

**`LUCENT.md` example:**
```markdown
Always prefer small, focused functions.
Use conventional commits.
Never add TODO comments — fix it now or open a ticket.

@skill(tdd)
@skill(clean-commits)
```

The `@skill()` lines are invisible in the system prompt prose. The referenced skill names are merged into the advertised skill list.

### Section 2 — Built-in skill pack

Six language-agnostic skills bundled in `src/skills/builtin/` and registered at startup as a `builtin` source. Always available, no configuration required.

| File | Name | Description |
|------|------|-------------|
| `tdd.md` | `tdd` | Write the failing test first, then implement the minimum code to pass it |
| `clean-commits.md` | `clean-commits` | Small, focused commits in conventional format — one logical change per commit |
| `refactor.md` | `refactor` | Safe refactoring: tests first, one change at a time, no behaviour changes |
| `debugging.md` | `debugging` | Systematic root-cause debugging — no random fixes, find the cause first |
| `code-review.md` | `code-review` | Structured review: correctness → design → style, with specific line references |
| `documentation.md` | `documentation` | Write minimal, accurate docs — no padding, no restating what the code says |

### Section 3 — Claude Code adapter

A new `claudecode` source type reads `~/.claude/skills/`. For each subdirectory it looks for `SKILL.md` and loads it via the existing `parseFrontmatter` — the format is identical to ours.

**Auto-detection:** if `~/.claude/skills/` exists at startup, it is registered automatically with no config. Users can also add it explicitly:
```json
{ "type": "claudecode" }
```

The adapter is a ~30-line `ClaudeCodeSource` class alongside the existing `GitHubSource`, `NpmSource`, `MarketplaceSource`.

### Section 4 — Pull-only model (remove auto-matching)

`SkillMatcher` is removed entirely. The `skillBlocks` pre-injection in `MessageHandler` is removed.

**New behaviour:**
- System prompt lists all available skills as `name: description` only (~1 line each)
- AI calls `use_skill("name")` when it decides a skill is relevant
- Skill content loads into that turn only — not persisted across turns

A session with 10 available skills costs ~100 tokens overhead instead of potentially 5 000+. The AI has full conversation context and is more accurate than keyword matching at deciding when a skill applies.

### Section 5 — `use_model` tool + `@model()` mention

**`use_model` tool (AI-initiated):**

New tool definition:
```ts
{
  name: 'use_model',
  description: 'Switch to a different OpenRouter model for subsequent messages. Use when the current task needs stronger reasoning (upgrade) or is simple enough for a cheaper model (downgrade).',
  parameters: {
    model_id: { type: 'string', description: 'OpenRouter model ID, e.g. "anthropic/claude-opus-4-6"' },
    reason:   { type: 'string', description: 'Why this model is better suited for the current task' },
  },
  required: ['model_id'],
}
```

Routes through `APPROVAL_GATED_TOOLS`. Approval card shows:
- Current model → requested model
- Price delta (cost per 1M tokens, fetched from already-loaded model list)
- Buttons: **Deny / This message / Rest of conversation**

On approval the extension posts `{ type: 'modelChanged', modelId }` so the toolbar reflects the change immediately.

**`@model()` mention (user-initiated):**

New mention type in the chat input alongside `@file`, `@terminal`. Typing `@model(` opens a fuzzy-search dropdown over the loaded model list. On send the mention is stripped from the message content and the model switches immediately — no approval card (user explicitly chose it).

**Skills with model recommendations:**

No new frontmatter field needed. Skill authors write natural instructions:

```markdown
---
name: deep-refactor
description: Thorough architectural refactoring with cross-file impact analysis
---

Before starting, call `use_model("anthropic/claude-opus-4-6")` — this task
benefits from strong multi-file reasoning. You can switch back after.

1. Map all callers of the affected module...
```

The AI reads the skill, follows the instruction, the approval guard fires. The user sees the cost difference and decides. No surprises.

## What's Not Changing

- Existing skill sources (GitHub, npm, marketplace, local) — unchanged
- `use_skill` tool — unchanged
- `SkillRegistry` internals — unchanged
- Approval card infrastructure from the missing-tools feature — reused for `use_model`

## Tech Stack

- `InstructionsLoader` — extended with `@skill()` regex parser
- `ClaudeCodeSource` — new ~30-line source class
- `src/skills/builtin/*.md` — 6 new markdown files
- `MessageHandler` — `use_model` tool wired into `APPROVAL_GATED_TOOLS`; `SkillMatcher` import removed; `skillBlocks` injection removed
- `ChatInput.tsx` — `@model()` mention type added to existing mention system
- `ToolCallCard.tsx` — approval card extended for model switch (shows price delta)
