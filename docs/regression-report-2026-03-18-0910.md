# Regression Report — Lucent Code Webview

**Date:** 2026-03-18 09:10
**Tester:** Claude Code (automated regression test via Playwright MCP)

---

## Summary Table

| Metric | Value |
|---|---|
| Date | 2026-03-18 09:10 |
| Application URL | http://172.27.32.1:5176 (Vite dev server) |
| UI States Tested | 7 (empty, models loaded, chat with message, conversation list, @mention dropdown, /skill dropdown, diff view) |
| Viewports Tested | 3 (Desktop 1920×1080, Tablet 768×1024, Mobile 375×812) |
| Existing Tests Passed | 231 |
| Existing Tests Failed | 0 |
| Console Errors Found | 0 |
| Network Errors Found | 0 |
| Visual Issues Found | 3 |
| **Overall Status** | **WARN** |

---

## Phase 2: Existing Test Results

**Framework:** Vitest v2.1.9
**Command:** `npm test -- --reporter=verbose`
**Result:** ✅ 231 passed, 0 failed, 0 skipped across 23 test files

**Test files covered:**
- `src/core/` — openrouter-client, settings, context-builder, auth, notifications, instructions-loader, markdown-utils, message-text, terminal-buffer
- `src/chat/` — history, message-handler (incl. full skill integration)
- `src/completions/` — inline-provider, prompt-builder, trigger-config
- `src/lsp/` — capability-detector, code-intelligence, editor-tools
- `src/skills/` — skill-parser, skill-registry, skill-matcher
- `src/skills/sources/` — github-source, npm-source, marketplace-source

---

## Phase 3: Browser-Based Testing

### Setup & Authentication

No login form detected. Application is a VS Code extension webview with a mock VS Code API fallback for dev mode (`vscode-api.ts` returns a no-op stub when `acquireVsCodeApi` is not available). App loaded cleanly at the dev server URL with no errors.

---

### UI State Results

#### State 1: Empty state — no API key

**Functional:** ✅ Renders the "💬 Lucent Code" empty state with API key setup instructions. All toolbar buttons present (model selector, history, new chat). Chat input textarea disabled Send button correctly. Skills ⚡ button correctly disabled (no skills loaded).

**Console errors:** 0
**Network errors:** 0

**Visual — Desktop (1920×1080):** ✅ Clean centered layout. Text readable. Adequate vertical centering. Input row anchored to bottom.

**Visual — Tablet (768×1024):** ✅ Layout scales correctly. All elements full-width and proportioned.

**Visual — Mobile (375×812):** ⚠️ Minor — "Lucent Code: Set API Key" command text wraps to two lines with "Key" on its own line. Readable but awkward. See recommendation #3.

---

#### State 2: Models loaded — suggestions visible

**Functional:** ✅ On `modelsLoaded` message, toolbar updates to show model name ("Claude Sonnet 4.6"). Empty state switches from API key prompt to three suggestion buttons: "Explain this code", "Find bugs", "Suggest improvements". Clicking suggestion fires `sendMessage` → VS Code mock logs `postMessage`.

**Visual — Desktop:** ✅ Suggestion buttons are evenly spaced, centered, clear visual separation, readable labels.

---

#### State 3: Chat with messages (code block + inline markdown)

**Functional:** ✅ User message ("Explain this code") appears with "You" label. Assistant response renders with code block, inline formatting. Code block header shows language label + Copy/Insert/Apply action buttons. Stream → streamEnd cycle transitions correctly.

**Visual — Desktop:** ⚠️ **Major** — Markdown headings and lists not rendered (see Finding #1).

**Visual — Tablet (768×1024):** ✅ Full-width code block, text wraps correctly, action buttons visible.

**Visual — Mobile (375×812):** ✅ Code block and text both readable. Action buttons (Copy/Insert/Apply) remain accessible.

---

#### State 4: Conversation list panel

**Functional:** ✅ ☰ button opens the list panel. Panel shows conversation titles, relative dates (3/18/2026, 3/17/2026), and per-item action buttons (MD export, JS export, Delete). ☰ button shows "active" state while panel is open. Clicking ☰ again dismisses it.

**Visual — Desktop:** ✅ Panel renders at full width above messages. Titles are readable. Action buttons right-aligned. Clean row separation.

---

#### State 5: @mention dropdown

**Functional:** ✅ Typing `@` in the input triggers dropdown above the textarea showing all 4 mentions: `@fix`, `@explain`, `@test`, `@terminal` with descriptions. Dropdown is grouped (action/context separator present). Keyboard dismiss with Escape closes it.

**Visual — Desktop:** ✅ Dropdown positions correctly above the input. Items are readable with label + description two-line layout. No overflow.

---

#### State 6: /skill autocomplete dropdown

**Functional:** ✅ After injecting `skillsLoaded` message, typing `/` opens the skill autocomplete showing `/brainstorming`, `/systematic-debugging`, `/tdd` with descriptions. ⚡ skills button correctly enabled after skills are loaded.

**Visual — Desktop:** ✅ Same dropdown styling as @mention — consistent design language. Items readable.

---

#### State 7: Diff view overlay

**Functional:** ✅ `showDiff` message triggers the diff panel at the bottom of the page. Header shows filename ("greet.ts") and Apply/Discard buttons. Removed lines show red background with `-` prefix. Added lines show green background with `+` prefix. Context lines shown without highlight. Clicking Discard dismisses the panel cleanly.

**Visual — Desktop:** ✅ Colors clearly distinguish added/removed/context. Panel does not overlap the input area.

---

## Findings & Recommendations

### 🔴 Major Issues

#### Finding #1 — Markdown headings and lists render as literal text

**Where:** All chat message assistant responses
**Observed:** `### Key Points` appears as literal text `### Key Points`. `- item` appears as `- item`. This affects any AI response that uses headings or bullet lists — a very common pattern.
**Root cause:** `webview/src/utils/markdown.ts` — `renderMarkdown()` handles only: fenced code blocks, inline code, bold (`**`), italic (`*`), and `\n→<br>`. Headings (`#`, `##`, `###`) and lists (`-`, `*`, `1.`) are not implemented. `h1/h2/h3/h4/ul/li/ol` are also not in `DOMPurify`'s `ALLOWED_TAGS`.
**Impact:** High — AI responses frequently use headings for structure and bullet lists for key points. These appear as cluttered raw markdown syntax.
**Fix:** Add heading and list rendering to `renderMarkdown()` and add `h1/h2/h3/h4/ul/ol/li` to `ALLOWED_TAGS` in the DOMPurify call.

---

### 🟡 Minor Issues

#### Finding #2 — "Lucent Code: Set API Key" wraps awkwardly at 375px mobile

**Where:** Empty state, mobile 375×812 viewport
**Observed:** The inline `<code>` element "Lucent Code: Set API Key" breaks across two lines with "Key" isolated on line 3.
**Root cause:** No `white-space: nowrap` on the command `<code>` element. At 375px the code element exceeds the line width.
**Impact:** Low — cosmetic only, still readable.
**Fix:** Add `white-space: nowrap; overflow-wrap: anywhere;` to the `.empty-state-hint code` selector in `styles.css`.

#### Finding #3 — Conversation message count shows "msgs" without a number

**Where:** Conversation list panel subtitles
**Observed:** Each conversation entry shows "msgs · 3/18/2026" — the word "msgs" with no count preceding it.
**Root cause:** `ConversationSummary` does not include a `messageCount` field in test data. The component may be trying to render `undefined msgs`. This needs verification against the real `ConversationHistory.list()` output.
**Impact:** Low — informational only, conversation titles are readable.
**Fix:** Verify `ConversationSummary` type includes message count and confirm `ConversationList.tsx` renders it correctly. Add `messageCount` to the summary returned by `history.list()` if missing.

---

### 💡 Suggestions

1. **Enrich the markdown renderer** — Beyond headings and lists, consider adding: `>` blockquotes, `---` horizontal rules, `[text](url)` links (sanitized). These are frequently used in AI responses. Using a mature library like `marked` + DOMPurify would be safer and more complete than growing the custom renderer.

2. **Code block horizontal scroll on mobile** — Code blocks at 375px show content scrolling correctly, but there is no visual scroll indicator. Consider adding a subtle fade gradient on the right edge of code blocks to hint at scrollable content.

3. **Empty ⚡ button tooltip** — When no skills are loaded, the ⚡ button is disabled but shows no tooltip explaining why. Consider adding `title="No skills loaded — configure skill sources in settings"` to the disabled state.

---

## Overall Assessment

The application is **functionally solid** with zero console errors, zero network errors, and all interactive states working correctly. The test suite is comprehensive (231 tests, 100% pass rate). The **primary quality concern** is the markdown renderer's missing support for headings and lists, which visibly degrades the readability of AI responses in real usage. This is the one item that should be addressed before the next release. The other findings are cosmetic.

| Severity | Count |
|---|---|
| 🔴 Major | 1 |
| 🟡 Minor | 2 |
| 💡 Suggestions | 3 |
| ✅ No issues | All other states |
