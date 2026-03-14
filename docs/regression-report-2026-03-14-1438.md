# Regression Report — Phase 1 MVP

## Summary

| Metric                 | Value                              |
|------------------------|------------------------------------|
| Date                   | 2026-03-14 14:38                   |
| Application URL        | http://localhost:5173 (Vite dev)   |
| Pages Tested           | 1 (single-page chat webview)       |
| Viewports Tested       | 3 (Desktop 1920x1080, Tablet 768x1024, Mobile 375x812) |
| Existing Tests Passed  | 46                                 |
| Existing Tests Failed  | 0                                  |
| Console Errors Found   | 0                                  |
| Network Errors Found   | 0                                  |
| Visual Issues Found    | 2 (Minor)                          |
| Overall Status         | **PASS**                           |

## Automated Test Results

- **Framework:** Vitest 1.6.1
- **Command:** `npx vitest run`
- **Test Files:** 6 passed (6 total)
- **Tests:** 46 passed (46 total)
- **Duration:** 894ms

### Test Coverage by Module

| Module | File | Tests | Status |
|--------|------|-------|--------|
| Settings | `src/core/settings.test.ts` | 3 | PASS |
| Auth | `src/core/auth.test.ts` | 5 | PASS |
| OpenRouter Client | `src/core/openrouter-client.test.ts` | 10 | PASS |
| Context Builder | `src/core/context-builder.test.ts` | 8 | PASS |
| Markdown Utils | `src/core/markdown-utils.test.ts` | 10 | PASS |
| Message Handler | `src/chat/message-handler.test.ts` | 10 | PASS |

### Tests Added in This Session

- **Message Handler (10 new):** newChat clears history, getModels success/error, setModel, ready event, sendMessage streaming/error/empty deltas, cancelRequest aborts, conversation history accumulation
- **OpenRouter Client (7 new):** chatStream streaming/API error/[DONE] marker/malformed chunks/no body, headers throws without key, chat request body verification
- **Context Builder (7 new):** buildContext with editor/selection/no selection, formatForPrompt with file/selection/editors/empty context
- **Markdown Utils (10 new):** escapeHtml special chars/empty/passthrough, renderMarkdown code blocks/inline code/bold/italic/newlines/combined/XSS prevention

## Browser-Based Visual Testing

### Empty State

**Desktop (1920x1080):**
- Layout: Toolbar (model selector + new chat button) at top, empty messages area, input at bottom
- Spacing: Consistent padding, toolbar border visible
- Typography: Font sizes appropriate
- Severity: **Pass**

**Tablet (768x1024):**
- Layout adapts correctly, model selector fills available width
- Input area properly positioned at bottom
- Severity: **Pass**

**Mobile (375x812):**
- Model selector and + button fit within viewport
- Input area visible with no overflow
- Severity: **Pass**

### Chat Messages with Code Blocks

**Desktop (1920x1080):**
- User message renders with "You" label
- Assistant message renders with "Assistant" label
- Code blocks display with: language label (typescript), Copy button, Insert button
- Inline code (`.sort()`, `localeCompare`) styled with background highlight
- Bold text (**string arrays**) renders correctly
- Italic text (*new*) renders correctly
- Severity: **Pass**

**Tablet (768x1024):**
- All formatting renders correctly at this width
- Code blocks have adequate padding and readable font size
- Copy/Insert buttons accessible
- Severity: **Pass**

**Mobile (375x812):**
- Code blocks have horizontal scroll for long lines (functional)
- Text wraps appropriately
- Severity: **Pass**

### Model Selector Dropdown

- Dropdown opens below the toggle button
- Search input field present
- Models listed with name (bold) and ID (subdued)
- Selected model highlighted with accent color
- Dropdown closes on selection
- Severity: **Pass**

### Interactive Elements

- Send button: Disabled when input is empty, enabled when text entered
- Stop button: Appears during streaming, replaces Send
- Input: Disabled during streaming, re-enabled after stream ends
- Textarea: Placeholder text visible ("Ask about your code...")
- Severity: **Pass**

## Issues Found

### Minor Issues

1. **No empty state guidance** — When the chat is empty, there's no placeholder text or onboarding hint in the message area. Users see a blank panel with no indication of what to do. Consider adding a centered "Ask a question about your code" message or example prompts.

2. **Send button disabled without model** — If no models are loaded (e.g., no API key set), the user can type text but the Send button stays disabled with no visible explanation. Consider showing a hint like "Set API key to start" or disabling the input with a message.

## Accessibility

- Semantic structure: Roles are correct (button, textbox)
- Code blocks have language labels
- Button labels are descriptive ("Copy", "Insert", "Send", "Stop")
- No ARIA issues detected in accessibility snapshot

## Recommendations

### Priority: Low (Polish)

1. Add an empty state / welcome message in the chat area
2. Show feedback when no API key is configured (input placeholder or banner)
3. Consider adding a loading spinner when models are being fetched
4. The VSCode CSS variables fallback gracefully outside the editor (tested with injected dark theme variables)

## Conclusion

Phase 1 MVP is in good shape. All 46 programmatic tests pass. The webview UI renders correctly across all three viewports (desktop, tablet, mobile) with proper dark theme integration. Code blocks, inline formatting, model selector, and interactive elements all function as designed. No critical or major issues found — only minor polish suggestions for the empty state UX.
