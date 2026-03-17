# Action Mentions — Design

**Date:** 2026-03-17
**Status:** Approved

---

## Overview

Extend the existing `@mentions` system with action shortcuts: `@fix`, `@explain`, and `@test`. Selecting one inserts a focused prompt prefix into the chat input. The existing context-enrichment pipeline already injects the current file, selection, diagnostics, and code actions — so the action mention just sets the intent; no extension-host roundtrip is needed.

---

## What Each Action Does

| Mention | Inserts into chat input |
|---------|------------------------|
| `@fix` | `Fix the following code:` |
| `@explain` | `Explain the following code:` |
| `@test` | `Write tests for the following code:` |

The user can edit the inserted text before sending. The context-enrichment pipeline adds the current file and selection automatically, so "the following code" refers to whatever the LLM will see in context.

---

## Architecture

### Mention kinds

`MentionSource` gets a `kind` field:

```typescript
interface MentionSource {
  id: string;
  label: string;
  description: string;
  kind: 'context' | 'action';
}
```

- `'context'` — resolves via async extension-host roundtrip (`@terminal`)
- `'action'` — resolves synchronously to a prompt-prefix string

### Resolution in App.tsx

`handleResolveMention` checks `type` before doing the postMessage dance:

```typescript
const handleResolveMention = (type: string): Promise<string | null> => {
  switch (type) {
    case 'fix':     return Promise.resolve('Fix the following code:');
    case 'explain': return Promise.resolve('Explain the following code:');
    case 'test':    return Promise.resolve('Write tests for the following code:');
  }
  // ... existing postMessage logic for context mentions
};
```

### Insertion in ChatInput.tsx

Action mentions (`kind === 'action'`) replace `@mention` with the returned string directly — no XML wrapper:

```
beforeAt + content + " "
```

Context mentions (`kind === 'context'`) keep the existing XML-block format:

```
beforeAt + <terminal output>\n...\n</terminal output>
```

### Dropdown grouping

The dropdown renders a visual separator between action and context sources. `MENTION_SOURCES` is split into two arrays and rendered with a group header:

```
Actions
  @fix        Fix code at cursor
  @explain    Explain code at cursor
  @test       Write tests for code at cursor
Context
  @terminal   Last 200 lines of active terminal
```

No new state needed — `filteredSources()` filters across both lists; groups are rendered from the same `MENTION_SOURCES` array by checking `kind`.

---

## No Extension Host Changes

All changes are confined to the webview (`ChatInput.tsx`, `App.tsx`). The extension host already sends the enriched context (file, selection, diagnostics, code actions) with every message — action mentions piggyback on that.

---

## What Does NOT Change

- `handleResolveMention` postMessage logic for `@terminal` (unchanged)
- `isResolvingMention` guard (still in place for async context mentions)
- Context-enrichment pipeline, system prompt, or tool definitions
- `src/shared/types.ts` — no new message types needed

---

## Documentation

A new section is added to `docs/features.md` under Chat Panel describing all available `@mentions` with their behaviour. This replaces scattered references and gives users a single place to look.
