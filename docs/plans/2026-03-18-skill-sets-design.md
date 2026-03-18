# Skill Sets Design

**Date:** 2026-03-18
**Status:** Approved

---

## Overview

Support Claude Code-style skill sets in Lucent Code. Skills are markdown files with YAML frontmatter describing structured AI workflows (e.g. brainstorming, TDD, debugging). They are advertised to the model at all times but their content is only injected on demand — either by semantic matching or explicit model/user invocation — to prevent context bloat.

Compatible with any instruction-following LLM, not just Claude.

---

## 1. Architecture

```
Sources                  Registry              Runtime               UI
─────────────────────    ──────────────────    ──────────────────    ──────────────
Claude Code cache        Skill                 Semantic              Skill browser
  ~/.claude/plugins/  →  Registry          →  matcher            →  (quick pick)
  ~/.claude/skills/      (in-memory map       (scores user
                         name→metadata)        message vs           /slash autocomplete
Own sources:             built at              descriptions,        in chat input
  GitHub repos        →  activation)           top-N injected)
  npm packages
  Superpowers slug     ─────────────────── →  use_skill tool       Settings UI
  Local directories        dedup by name,       (model explicitly    for sources
                           own-sources win      requests a skill)
```

**Conflict resolution:** same skill name from multiple sources → own-sources win over Claude Code cache; ties within own-sources resolved by source order in settings.

**Skill file format:** markdown with YAML frontmatter:
```markdown
---
name: brainstorming
description: Use before creative work — explores intent and requirements before implementation
type: flexible
---

# Brainstorming
...skill content...
```

---

## 2. Source Management

### Claude Code cache (automatic, no config)

- Scans `~/.claude/plugins/cache/**/*.md` and `~/.claude/skills/**/*.md` on activation
- Read-only — extension never writes here
- Re-scanned on extension reload

### Own sources

Configured in `settings.json` under `openRouterChat.skills.sources` (array of source objects):

```json
"openRouterChat.skills.sources": [
  { "type": "github", "url": "https://github.com/gsd-build/get-shit-done" },
  { "type": "npm", "package": "@obra/superpowers-skills" },
  { "type": "marketplace", "slug": "superpowers", "version": "4.3.1" },
  { "type": "local", "path": "~/my-skills/" }
]
```

| Source type | Fetch method | Notes |
|---|---|---|
| `github` | GitHub raw content API | Public repos only, no auth required |
| `npm` | unpkg.com (`unpkg.com/<package>/`) | No local npm install needed |
| `marketplace` | Superpowers marketplace registry URL | Uses their existing registry API |
| `local` | `vscode.workspace.fs.readFile` | Watched for changes, no caching needed |

### Caching

Remote sources cached in `context.globalStorageUri/skills-cache/<source-hash>/`. Refreshed by `openRouterChat.refreshSkills` command or automatically on activation if cache is >24h old.

---

## 3. Runtime Injection

### System prompt advertisement

All loaded skills are listed (name + description only) in the system prompt:

```
## Available Skills
The following skills are available. Use the `use_skill` tool when a skill is relevant to the task.

- brainstorming: Use before creative work — explores intent and requirements before implementation
- systematic-debugging: Use when encountering bugs or unexpected behavior
- tdd: Use when implementing features — guides test-first development
```

### Semantic pre-injection (automatic)

Before each model call, the user message is scored against all skill descriptions using TF-IDF keyword overlap (no embedding API, no added latency). Skills scoring above a threshold are injected into the message as `<skill>` blocks:

```xml
<skill name="systematic-debugging">
...full skill content...
</skill>

[original user message]
```

At most 2 skills injected per turn.

### `use_skill` tool (model-driven)

Added to the tool definitions the model receives:

```json
{
  "name": "use_skill",
  "description": "Load a skill's full instructions to guide your approach for a task",
  "parameters": {
    "type": "object",
    "properties": {
      "name": {
        "type": "string",
        "description": "The skill name as listed in Available Skills"
      }
    },
    "required": ["name"]
  }
}
```

- No HITL approval (read-only, no side effects)
- Unknown name → tool error result: `"Skill not found: {name}"`
- Result is the full skill markdown content

### Slash commands (user-driven)

User types `/brainstorming` in the chat input → a chip appears (same pattern as `@terminal`), skill content is prepended to the next sent message. Slash input replaced by chip on selection.

---

## 4. UI

### Skill browser

- Command: `openRouterChat.browseSkills`
- VS Code quick pick listing all skills with name + description
- Selecting a skill inserts it as a slash-command chip in the chat input
- Accessible via `⚡` toolbar button (added next to existing `📎` and `>_` buttons)

### Slash autocomplete

- Triggered when user types `/` in chat input
- Filters skill names as user types, shows name + description
- Same dropdown pattern as existing `@mentions`
- Selecting inserts the chip

### Source management commands

- `openRouterChat.addSkillSource` — guided quick-pick wizard: choose type → enter URL/path/package → writes to settings
- `openRouterChat.refreshSkills` — re-fetches all remote sources, rebuilds registry

### Status indicator

Brief `$(book) N skills loaded` status bar message on activation (fades after 3s). Send button tooltip shows which skills were matched for the current turn.

---

## 5. Error Handling

| Scenario | Behavior |
|---|---|
| GitHub fetch fails | Log warning, skip source, continue with others |
| npm/unpkg fetch fails | Skip source, warn |
| Marketplace unreachable | Use cached version if available, warn if none |
| Claude Code cache missing | Silently skip (not everyone has Claude Code) |
| Malformed skill frontmatter | Skip the file, log filename |
| `use_skill` called with unknown name | Tool error: "Skill not found: {name}" |
| Skill content exceeds 50 KB | Truncate with note (same limit as instructions-loader) |

---

## 6. Testing

| Test | What it covers |
|---|---|
| `SkillRegistry.load()` from fixture directory | Correct name/description index; dedup prefers own-source over Claude Code cache |
| `SkillMatcher.score()` | High-overlap message scores above threshold; unrelated message below |
| `use_skill` tool handler | Known skill → content returned; unknown skill → error result |
| Source fetchers (GitHub, npm, marketplace) | Mocked HTTP responses, correct skill file discovery |
| Slash command chip | `/brainstorming` → chip inserted, skill content attached on send |
| Settings source config | `addSkillSource` writes correct entry to settings |

---

## 7. Files to Create / Modify

| File | Change |
|---|---|
| `src/skills/skill-registry.ts` | New — `SkillRegistry` class: load, dedup, index |
| `src/skills/skill-matcher.ts` | New — TF-IDF scorer against skill descriptions |
| `src/skills/sources/claude-code-source.ts` | New — scans `~/.claude/` paths |
| `src/skills/sources/github-source.ts` | New — fetches from GitHub raw API |
| `src/skills/sources/npm-source.ts` | New — fetches via unpkg.com |
| `src/skills/sources/marketplace-source.ts` | New — superpowers marketplace registry |
| `src/skills/sources/local-source.ts` | New — reads local directory |
| `src/skills/skill-registry.test.ts` | New — unit tests |
| `src/skills/skill-matcher.test.ts` | New — unit tests |
| `src/core/settings.ts` | Add `skills.sources` setting definition |
| `src/core/context-builder.ts` | Inject skill advertisements into system prompt |
| `src/chat/message-handler.ts` | Run semantic matcher before each send; add `use_skill` to tool definitions |
| `src/extension.ts` | Register `browseSkills`, `addSkillSource`, `refreshSkills` commands; wire `⚡` button |
| `webview/src/components/ChatInput.tsx` | Add `/` autocomplete dropdown for skills; add `⚡` toolbar button |
| `webview/src/stores/chat.ts` | Handle skill chip state (alongside existing `@terminal` chip) |
