# P2 Features — Design

**Date:** 2026-03-17
**Status:** Approved

---

## Overview

Four P2 backlog features to implement as a batch. All are self-contained additions with no breaking changes to existing functionality.

---

## Feature 1: Generate Commit Message

### What it does
A sparkle icon button appears inline in the SCM commit message input box (same pattern as GitHub Copilot). Clicking it reads the staged diff via the VS Code Git extension API, sends it to the LLM with a focused prompt, and writes the result back to `inputBox.value`.

### Integration points
- **Command:** `lucentCode.generateCommitMessage`
- **Menu contribution:** `scm/inputBox` — places the button inline with the commit input
- **Git API:** `vscode.extensions.getExtension('vscode.git')` → `GitExtension` → `Repository.diff(true)` (staged diff)
- **LLM prompt:** Focused single-purpose prompt: "Write a concise conventional commit message for the following staged diff. Return only the message, no explanation."
- **Output:** Sets `repository.inputBox.value` with the generated message

### Edge cases
- No staged changes → show info notification "No staged changes to generate a message from"
- Git extension not available → show info notification "Git extension not found"
- LLM error → show error notification with retry action (existing `NotificationService` pattern)

---

## Feature 2: `@mentions` System + `@terminal`

### What it does
A mention system in the chat input: when the user types `@`, a dropdown appears with available context sources. The first source is `@terminal`, which injects the last ~200 lines of the active terminal into the message as a context block.

### Architecture

#### Mention parser (webview)
- Detect `@` followed by word characters as the user types in the chat input
- Show a floating dropdown anchored to the caret with available sources
- On selection, replace the `@mention` token with a resolved context block or a placeholder tag (e.g. `[[terminal]]`)
- The resolved content is sent as part of the message to the extension host

#### Terminal buffer (extension host)
- Subscribe to `vscode.window.onDidWriteTerminalData` on activation
- Maintain a per-terminal circular buffer of the last 200 lines
- Expose the buffer for the active terminal via a message handler command `getTerminalOutput`
- Buffer is cleared when a terminal is disposed

#### Message flow
1. User types `@terminal` and selects it from the dropdown
2. Webview sends `getTerminalOutput` message to extension host
3. Extension host returns the buffered lines for `vscode.window.activeTerminal`
4. Webview injects a context block into the composed message:
   ```
   <terminal output>
   [last 200 lines]
   </terminal output>
   ```
5. Message is sent to the LLM with the terminal block as part of the user turn

### Extensibility
The `@mentions` system is built with an open registry: each source is a `MentionSource` with `{ id, label, description, resolve(): Promise<string> }`. Adding `@file`, `@selection`, or `@diagnostics` later requires only registering a new source.

### Available sources (this batch)
| Mention | Description | Resolves to |
|---|---|---|
| `@terminal` | Last ~200 lines of active terminal | Terminal output block |

---

## Feature 3: Contextual Code Actions

### What it does
When building the enriched context for a chat message, the extension queries available code actions at the current cursor position via `vscode.executeCodeActionProvider`. The list of action titles is injected into the system prompt so the AI knows what VS Code can already fix — and can invoke `apply_code_action` (already wired) to apply them.

### Integration points
- **Context builder:** Add a new context item in `buildEnrichedContext()`: call `vscode.commands.executeCommand('vscode.executeCodeActionProvider', uri, range)` where `range` is a zero-length range at the cursor
- **System prompt injection:** Append to the capabilities section:
  ```
  Available code actions at cursor:
  - Add missing import 'fs'
  - Extract to function
  - Fix spelling: 'recieve' → 'receive'
  ```
- **Tool use:** The AI can call the existing `apply_code_action` tool by title. The HITL approval flow is unchanged.

### Behaviour
- If no code actions are available at cursor, the section is omitted from the system prompt (no noise)
- Actions are fetched fresh on each message send (not cached) — they change as code changes
- Only `QuickFix` and `Refactor` kinds are included; source actions (organise imports on save, etc.) are excluded to avoid noise

---

## Feature 4: Premium Web Search (Tavily)

### What it does
An optional `lucentCode.tavilyApiKey` setting. When set, the `search_web` tool uses the Tavily Search API instead of DuckDuckGo. Falls back to DuckDuckGo if the key is absent or the Tavily request fails.

### Integration points
- **Setting:** `lucentCode.tavilyApiKey` — stored in `SecretStorage` via the existing `AuthService` pattern (same as `lucentCode.apiKey`)
- **Command:** `lucentCode.setTavilyApiKey` — command palette entry, same UX as the existing Set API Key command
- **`search_web` tool:** Check for Tavily key → if present, POST to `https://api.tavily.com/search` with `{ query, max_results: 5, search_depth: "basic" }` → map results to the same `{ title, url, snippet }` shape as DuckDuckGo → return. If absent or on error, fall back to DuckDuckGo.
- **No UI changes** beyond the new command palette entry

### Tavily API shape
```
POST https://api.tavily.com/search
Authorization: Bearer <key>
{ "query": "...", "max_results": 5, "search_depth": "basic" }

Response: { "results": [{ "title", "url", "content" }] }
```

---

## What Does NOT Change

- All existing tool definitions and HITL approval flows
- OpenRouter as the model backend
- Existing context enrichment pipeline (additions only)
- Webview CSS / component structure (additions only)
- Test suite structure (new tests added alongside existing ones)
