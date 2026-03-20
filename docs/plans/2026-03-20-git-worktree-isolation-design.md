# Git Worktree Isolation — Design

**Date:** 2026-03-20
**Status:** Approved

---

## Goal

When the AI is about to make broad agentic edits, create an isolated git worktree so changes are buffered on a separate branch. The user reviews a diff at the end and chooses to merge, open a PR, or discard. Stays in the same VSCode window — no new window opened.

---

## Architecture

`WorktreeManager` lives in `src/core/worktree-manager.ts` and owns four responsibilities:

1. **Creation** — `git worktree add .worktrees/lucent-<conversationId> -b lucent/<conversationId>`. Directory selection: use `.worktrees/` if it exists and is gitignored, check `CLAUDE.md` for a preference, otherwise ask the user once. Adds `.worktrees/` to `.gitignore` if not already present.

2. **URI remapping** — `remapUri(uri: string): string` replaces the workspace root prefix with the worktree path. `MessageHandler` calls this on every `uri` arg before executing any tool. URIs outside the workspace root pass through unchanged.

3. **Lifecycle state** — `idle | creating | active | finishing`. Posted to the webview as a `worktreeStatus` message so the toolbar can show a badge (`⎇` with green dot when active).

4. **Session end** — `finishSession()` runs `git diff main...HEAD --stat`, produces a `WorktreeDiff` summary, and presents a VSCode quick-pick: **Merge into current branch**, **Open as PR** (`gh pr create`), or **Discard** (`git worktree remove --force`). If `gh` is not installed, PR option is replaced with "Copy branch name to clipboard".

`MessageHandler` gets a `_worktreeManager: WorktreeManager | null` field. Three activation paths:
- Autonomous mode toggled on
- `openRouterChat.startWorktree` command (command palette / button)
- `start_worktree` tool call (LLM / skill-initiated)

---

## Components

| File | Change |
|---|---|
| `src/core/worktree-manager.ts` | New — full lifecycle, URI remap, diff summary, quick-pick |
| `src/chat/message-handler.ts` | Add `_worktreeManager`, call `remapUri` on tool args, handle `startWorktree` webview message, wire `start_worktree` tool |
| `src/extension.ts` | Register `openRouterChat.startWorktree` command; wire autonomous mode toggle to start worktree |
| `src/shared/types.ts` | Add `worktreeStatus` ExtensionMessage, `startWorktree` WebviewMessage, `WorktreeDiff` type |
| `webview/src/App.tsx` | Handle `worktreeStatus` → pass to store; show `⎇` badge in toolbar |
| `webview/src/stores/chat.ts` | Add `worktreeStatus` signal |
| `src/core/worktree-manager.test.ts` | New test file |
| `src/chat/message-handler.test.ts` | Tests for URI remapping and `start_worktree` tool |

**`start_worktree` tool definition** added to `TOOL_DEFINITIONS`:
```ts
{
  name: 'start_worktree',
  description: 'Create an isolated git worktree for this session. Call this when a skill instructs worktree isolation or before making broad agentic edits.',
  input_schema: { type: 'object', properties: {}, required: [] }
}
```

Not gated behind HITL approval — creating a worktree is non-destructive.

---

## Data Flow

```
Trigger (autonomous mode / command / start_worktree tool call)
  → WorktreeManager.create(conversationId)
    → check .worktrees/ exists → git check-ignore → add to .gitignore if needed
    → git worktree add .worktrees/lucent-<id> -b lucent/<id>
    → state = 'active' → post worktreeStatus to webview
  → MessageHandler stores _worktreeManager

Tool call arrives with uri arg
  → _worktreeManager.remapUri(uri)   ← single call site in MessageHandler
  → tool executes against worktree path

Session end (new conversation / explicit finish command)
  → WorktreeManager.finishSession()
    → git diff main...HEAD --stat → WorktreeDiff summary
    → Quick-pick: Merge / Open PR / Discard
    → Merge:   git merge lucent/<id> → git worktree remove
    → PR:      gh pr create --head lucent/<id> → git worktree remove (leaves branch)
    → Discard: git worktree remove --force
    → state = 'idle' → post worktreeStatus to webview
```

---

## Error Handling

| Error | Behaviour |
|---|---|
| `git worktree add` fails (not a git repo, dirty index) | `showErrorMessage`, stay `idle`, do not activate |
| `gh` not installed | Replace "Open as PR" with "Copy branch name to clipboard" |
| URI outside workspace root | `remapUri` returns original URI unchanged |
| Merge conflict | Open native conflict editor, leave worktree in place until resolved |

---

## Testing

**`src/core/worktree-manager.test.ts`** (new)
- `create()` runs correct `git worktree add` command
- `create()` adds `.worktrees/` to `.gitignore` if missing
- `create()` sets state to `active` and posts `worktreeStatus`
- `remapUri()` replaces workspace root prefix with worktree path
- `remapUri()` returns URI unchanged when outside workspace root
- `finishSession()` with no changes → removes worktree directly, no quick-pick
- `finishSession()` Discard → `git worktree remove --force`
- `finishSession()` Merge → `git merge` then `git worktree remove`
- `create()` when not a git repo → error, stays `idle`

**`src/chat/message-handler.test.ts`** (additions)
- `start_worktree` tool call → `WorktreeManager.create()` called, no approval gate
- Active worktree: `replace_range` uri remapped before execution
- Active worktree: `insert_code` uri remapped before execution
- No active worktree: uri args pass through unchanged
- Autonomous mode enabled → `WorktreeManager.create()` called automatically

`WorktreeManager` accepts a `runner: (cmd: string) => Promise<string>` injectable for tests — no real `git` calls in tests.

---

## Out of Scope

- Worktree-per-tool-call granularity (one worktree per session is sufficient)
- Stacked worktrees / multiple active sessions
- Auto-push to remote before presenting PR option
