---
sidebar_position: 4
title: Skills & Commands
description: Slash commands that guide the AI with structured prompts — code review, refactoring, commit messages, and more.
---

# Skills & Commands

**Skills** are structured prompt templates that guide the AI to perform a specific task with consistent, high-quality output. Invoke them with a `/` slash command.

## Built-in Skill Reference

| Command | What it does |
|---|---|
| `/code-review` | Structured review: correctness → design → style |
| `/refactor` | Safe refactoring with explicit Before/After blocks |
| `/debugging` | Root-cause analysis: symptom → hypothesis → fix |
| `/tests` | Unit tests covering happy path, edges, and errors |
| `/doc` | JSDoc / docstring for the selected function |
| `/documentation` | Full documentation section with usage and reference |
| `/commit` | Conventional Commits message from staged changes |
| `/clean-commits` | Squash/reword suggestions for a clean merge history |
| `/onboard` | Onboarding guide for new contributors |
| `/compact` | Summarise conversation to free context window |

> **Note:** Skills that use tool calls internally (like `/code-review`) require a model with tool-use support. They are hidden automatically when a model without `tools` in `supported_parameters` is selected.

---

## Invoking a Skill

1. Click in the chat input
2. Type `/` — the skill picker opens showing all available skills
3. Continue typing to filter by name
4. Press **Enter** or click to select

The skill name appears as a **chip** in the input. Add your own context after the chip, then send.

Example: type `/code-review`, then add `focus on the auth module` — the AI will use the code review framework but focus on what you specified.

## Built-in Skills

These ship with Lucent Code and are always available:

### `/code-review`
Structured code review in three levels: correctness, design, and style.

Output format:
```
[critical] file.ts:12 — problem — suggested fix
[important] file.ts:5 — problem — suggested fix
[suggestion] file.ts:8 — problem — suggested fix
```

Use it on: the current file, a pasted function, or any code you want reviewed.

### `/refactor`
Systematic refactoring with explicit Before/After blocks. The AI states what changed and why before presenting the refactored code.

### `/debugging`
Root-cause debugging. The AI investigates the symptom, forms a hypothesis, suggests a minimal test, then proposes a fix — avoiding random guesses.

### `/tests`
Write unit tests for a function or module. Covers: happy path, edge cases, error cases, and boundary conditions.

### `/doc`
Write a JSDoc / docstring for a function. First sentence describes the behaviour from the caller's perspective, then `@param` and `@returns`.

### `/documentation`
Write a comprehensive documentation section: overview, prerequisites, step-by-step usage, configuration reference, and troubleshooting.

### `/commit`
Generate a Conventional Commits message for staged changes. Returns just the commit message — paste it straight into your terminal.

### `/clean-commits`
Review a list of commits and suggest squash/reword operations to produce a clean, meaningful git history before merging.

### `/onboard`
Generate an onboarding guide for new contributors: what the codebase does, how it's structured, how to run it, and where to start.

### `/compact`
Summarise the current conversation to free context window. A divider marks the compaction point in the UI.

## How Skills Work

When you invoke a skill, the full skill prompt is sent to the AI as context for your message. The AI follows the skill's instructions to structure its response.

Skills are loaded **on demand** — only the name and description appear in the system prompt (no context bloat). The full content is fetched when you invoke the skill.

## Custom Skills

You can add your own skills from multiple sources:

### From `~/.claude/skills/`

Create a directory `~/.claude/skills/my-skill/` with a `SKILL.md` file:

```markdown
---
name: my-skill
description: What this skill does in one sentence
---

Your prompt content here. Write clear instructions for the AI.
```

Lucent Code auto-loads all skills from `~/.claude/skills/` on startup.

### From the Superpowers Marketplace

If you have [Claude Code](https://claude.ai/code) installed with superpowers plugins, Lucent Code automatically discovers and loads those skills too. They appear in the skill picker grouped by source.

### From GitHub, npm, or a local directory

Use the **Add Skill Source** command (`Ctrl+Shift+P` → **Lucent Code: Add Skill Source**) to add:
- A GitHub repository URL
- An npm package name
- A local directory path

### Refreshing Skills

Run **Lucent Code: Refresh Skills** from the Command Palette to reload all sources.

## Skill Sources in the Picker

The skill picker groups skills by source:
- **Built-in** — shipped with Lucent Code
- **Claude** — from `~/.claude/skills/` or plugin cache
- **GitHub / npm / marketplace / local** — from external sources you've added

## LUCENT.md Project Instructions

Add a `LUCENT.md` file to your workspace root to give the AI persistent instructions about your project. Any `@skill(name)` lines in `LUCENT.md` auto-activate those skills for every conversation in that workspace.

Lucent Code also reads `CLAUDE.md`, `.cursorrules`, and `.clinerules` — same format.
