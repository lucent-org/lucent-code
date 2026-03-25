# Slash Commands & `@file` Mention Design

## Goal

Four connected improvements:
1. Add 4 new built-in quick-action skills (`/doc`, `/tests`, `/commit`, `/onboard`)
2. Add `/compact` system command — summarizes and truncates conversation history
3. Drop `@test` action mention — `/tests` skill replaces it
4. Add `@file` typed mention — fuzzy-search workspace files from the keyboard

## Architecture

### Section 1 — New built-in skills

Four new skill files added to `src/skills/builtin/`. They follow the same format as the existing six built-ins and appear in the `/` dropdown alongside `tdd`, `debugging`, etc.

| File | Name | Description |
|------|------|-------------|
| `doc.md` | `doc` | Generate JSDoc/docstring for selected code or active file |
| `tests.md` | `tests` | Generate tests for selected code using the project's test framework |
| `commit.md` | `commit` | Run `git diff --staged \|\| git diff HEAD` and write a conventional commit message |
| `onboard.md` | `onboard` | Analyze project structure, entry points, and dependencies — orient a new developer |

**Skill content notes:**

- **`doc`** — instructs AI to match the language's doc format (JSDoc, Python docstrings, Rust doc comments), describe parameters, return value, and side effects; no padding
- **`tests`** — instructs AI to identify edge cases, use the project's existing test framework if detectable, follow TDD style; replaces `@test`
- **`commit`** — instructs AI to call `run_terminal_command('git diff --staged || git diff HEAD')`, then produce a `type(scope): description` conventional commit message with a brief changed-files list
- **`onboard`** — instructs AI to read `package.json`/`README`, map top-level directories, identify entry points and key dependencies, summarize architecture in plain language

### Section 2 — `/compact` system command

`/compact` is intercepted by `MessageHandler` before a regular API call is made.

**Flow:**
1. User selects `/compact` from the skill dropdown — a chip appears as normal
2. On send, `MessageHandler` detects the compact chip
3. Makes a **separate** summarization API call with the current `conversationMessages`:
   > "Summarize this conversation in 3–5 sentences. Capture key decisions, code changes discussed, and open questions."
4. Replaces `conversationMessages` with a single entry:
   ```
   [Conversation compacted — YYYY-MM-DD HH:mm]

   <summary>
   ```
5. Posts `{ type: 'conversationCompacted', summary }` to the webview
6. Chat renders a visual "compacted" divider at that point in the history

**Trade-off:** After compaction the AI loses access to file/code context from prior turns — only the summary remains. This is expected (same behaviour as Cline's `/smol`).

**Implementation touch-points:**
- `src/chat/message-handler.ts` — detect compact chip, run summarization, replace history
- `webview/src/stores/chat.ts` — handle `conversationCompacted` message, insert divider entry
- `webview/src/components/MessageList.tsx` (or equivalent) — render compacted divider
- `src/shared/types.ts` — add `conversationCompacted` to `WebviewMessage` union

### Section 3 — Drop `@test`

Remove `@test` from `MENTION_SOURCES` in `webview/src/components/ChatInput.tsx`.

`@fix` and `@explain` are retained — they are quick one-liners that inject a focused prompt prefix directly; they do not need skill-level guidance.

### Section 4 — `@file` typed mention

Typing `@` followed by any character that does not match a known mention keyword triggers a workspace file search dropdown.

**Behaviour:**
- Fuzzy-matches filenames and relative paths against the workspace file list
- Selecting a file produces a file attachment chip (same as dragging a file onto the input)
- Reuses the existing file attachment infrastructure — no new chip type needed
- Binary files are skipped; files over 5 MB are rejected with a tooltip

**Implementation touch-points:**
- `webview/src/components/ChatInput.tsx` — add `@file` detection and file search dropdown to `handleInput`; trigger file list fetch via `postMessage({ type: 'listFiles', query })` or reuse the existing file picker path
- `src/chat/message-handler.ts` (or `extension.ts`) — handle `listFiles` message, return matching workspace files
- `src/shared/types.ts` — add `listFiles` / `fileList` message pair if not already present

**Scope:** workspace files only (not folders), same 5 MB / binary-skip rules as the paperclip attachment.

## What's Not Changing

- Existing built-in skills (`tdd`, `clean-commits`, `refactor`, `debugging`, `code-review`, `documentation`) — unchanged
- `@fix`, `@explain` action mentions — unchanged
- `@terminal`, `@codebase`, `@model` context mentions — unchanged
- `use_skill` tool and skill registry — unchanged
- File attachment via paperclip button — unchanged (same chips, same limits)

## Tech Stack

- `src/skills/builtin/*.md` — 4 new skill files
- `src/skills/builtin/index.ts` — add 4 new skill strings
- `webview/src/components/ChatInput.tsx` — remove `@test`, add `@file` detection + dropdown
- `src/chat/message-handler.ts` — `/compact` interception + summarization call + history replacement
- `webview/src/stores/chat.ts` — `conversationCompacted` handler
- `src/shared/types.ts` — `conversationCompacted` message type; `listFiles`/`fileList` if needed
