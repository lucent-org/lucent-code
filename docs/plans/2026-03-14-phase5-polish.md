# Phase 5 — Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add keyboard shortcuts, user-facing error notifications with recovery hints, and prepare the extension for marketplace publishing with proper metadata, icon, and changelog.

**Architecture:** Register additional keybindings in package.json, add a notification utility that wraps `vscode.window.showErrorMessage` with action buttons for common recovery paths, create an SVG icon, add marketplace metadata to package.json, and create a CHANGELOG.

**Tech Stack:** TypeScript, VSCode Extension API, SVG

---

### Task 1: Keyboard Shortcuts

**Files:**
- Modify: `package.json` — add keybindings for common actions

**Step 1: Add keybindings**

The existing `contributes.keybindings` array has one entry (`Alt+\` for triggerCompletion). Add these:

```json
{
  "command": "openRouterChat.newChat",
  "key": "ctrl+shift+n",
  "mac": "cmd+shift+n",
  "when": "openRouterChat.chatView.visible"
},
{
  "command": "openRouterChat.focusChat",
  "key": "ctrl+shift+l",
  "mac": "cmd+shift+l"
}
```

Add the new `focusChat` command to the `commands` array:
```json
{
  "command": "openRouterChat.focusChat",
  "title": "OpenRouter Chat: Focus Chat Panel"
}
```

**Step 2: Register the focusChat command in extension.ts**

Add to `src/extension.ts` in the commands section:
```typescript
context.subscriptions.push(
  vscode.commands.registerCommand('openRouterChat.focusChat', () => {
    vscode.commands.executeCommand('openRouterChat.chatView.focus');
  })
);
```

**Step 3: Build and test**

Run: `node esbuild.config.mjs`

**Step 4: Commit**

```bash
git add package.json src/extension.ts
git commit -m "feat: add keyboard shortcuts for new chat (Ctrl+Shift+N) and focus chat (Ctrl+Shift+L)"
```

---

### Task 2: Error Notifications with Recovery Hints

**Files:**
- Create: `src/core/notifications.ts`
- Create: `src/core/notifications.test.ts`
- Modify: `src/chat/message-handler.ts` — use notifications for errors

**Step 1: Write the test file**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockShowErrorMessage = vi.fn(() => Promise.resolve(undefined));
const mockShowWarningMessage = vi.fn(() => Promise.resolve(undefined));
const mockShowInformationMessage = vi.fn(() => Promise.resolve(undefined));
const mockExecuteCommand = vi.fn();

vi.mock('vscode', () => ({
  window: {
    showErrorMessage: mockShowErrorMessage,
    showWarningMessage: mockShowWarningMessage,
    showInformationMessage: mockShowInformationMessage,
  },
  commands: {
    executeCommand: mockExecuteCommand,
  },
}));

import { NotificationService } from './notifications';

describe('NotificationService', () => {
  let notifications: NotificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    notifications = new NotificationService();
  });

  it('should show API key error with Set API Key action', async () => {
    mockShowErrorMessage.mockResolvedValue('Set API Key');
    await notifications.handleError('No API key configured. Please set your OpenRouter API key.');
    expect(mockShowErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('API key'),
      'Set API Key'
    );
    expect(mockExecuteCommand).toHaveBeenCalledWith('openRouterChat.setApiKey');
  });

  it('should show rate limit error with retry hint', async () => {
    await notifications.handleError('OpenRouter API error (429): Rate limited');
    expect(mockShowWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('Rate limited')
    );
  });

  it('should show generic error for unknown errors', async () => {
    await notifications.handleError('Something unexpected happened');
    expect(mockShowErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Something unexpected happened')
    );
  });

  it('should show network error with retry hint', async () => {
    await notifications.handleError('fetch failed');
    expect(mockShowErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('network'),
      expect.anything()
    );
  });
});
```

**Step 2: Write the implementation**

```typescript
import * as vscode from 'vscode';

export class NotificationService {
  async handleError(errorMessage: string): Promise<void> {
    const lower = errorMessage.toLowerCase();

    if (lower.includes('api key') || lower.includes('no api key')) {
      const action = await vscode.window.showErrorMessage(
        `OpenRouter: API key not configured. Set your API key to get started.`,
        'Set API Key'
      );
      if (action === 'Set API Key') {
        vscode.commands.executeCommand('openRouterChat.setApiKey');
      }
    } else if (lower.includes('429') || lower.includes('rate limit')) {
      vscode.window.showWarningMessage(
        `OpenRouter: Rate limited. Please wait a moment and try again.`
      );
    } else if (lower.includes('401') || lower.includes('unauthorized')) {
      const action = await vscode.window.showErrorMessage(
        `OpenRouter: Invalid API key. Please check your API key.`,
        'Update API Key'
      );
      if (action === 'Update API Key') {
        vscode.commands.executeCommand('openRouterChat.setApiKey');
      }
    } else if (lower.includes('fetch failed') || lower.includes('network') || lower.includes('econnrefused')) {
      vscode.window.showErrorMessage(
        `OpenRouter: Could not connect. Please check your network connection.`,
        'Retry'
      );
    } else {
      vscode.window.showErrorMessage(`OpenRouter: ${errorMessage}`);
    }
  }
}
```

**Step 3: Integrate into MessageHandler**

In `src/chat/message-handler.ts`, add import:
```typescript
import { NotificationService } from '../core/notifications';
```

In the `handleSendMessage` catch block, after posting `streamError`, add:
```typescript
const notifier = new NotificationService();
notifier.handleError(errorMessage);
```

Also in `handleGetModels`, after posting `streamError`:
```typescript
const notifier = new NotificationService();
notifier.handleError(errorMessage);
```

**Step 4: Run tests and build**

Run: `npx vitest run`
Run: `node esbuild.config.mjs`

**Step 5: Commit**

```bash
git add src/core/notifications.ts src/core/notifications.test.ts src/chat/message-handler.ts
git commit -m "feat: add NotificationService with contextual error messages and recovery actions"
```

---

### Task 3: Extension Icon

**Files:**
- Create: `media/icon.svg`
- Modify: `package.json` — add icon field

**Step 1: Create a simple SVG icon**

Create `media/icon.svg` — a chat bubble with a router/connection motif:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
  <rect width="128" height="128" rx="24" fill="#1a1a2e"/>
  <path d="M32 40h64c4.4 0 8 3.6 8 8v32c0 4.4-3.6 8-8 8H72l-16 16V88H32c-4.4 0-8-3.6-8-8V48c0-4.4 3.6-8 8-8z" fill="#0e639c"/>
  <circle cx="48" cy="64" r="5" fill="#fff"/>
  <circle cx="64" cy="64" r="5" fill="#fff"/>
  <circle cx="80" cy="64" r="5" fill="#fff"/>
</svg>
```

**Step 2: Update package.json**

Add at the top level (after `"publisher"`):
```json
"icon": "media/icon.png",
```

Note: The marketplace requires PNG. We'll create the SVG and note that a PNG conversion is needed for publishing. For now, reference the SVG in the activity bar (already using `$(comment-discussion)`).

Actually, keep it simple — just create the SVG for now and update the `icon` field. The `$(comment-discussion)` codicon is already used for the activity bar.

**Step 3: Commit**

```bash
git add media/icon.svg package.json
git commit -m "feat: add extension icon"
```

---

### Task 4: Marketplace Metadata & CHANGELOG

**Files:**
- Modify: `package.json` — add marketplace metadata
- Create: `CHANGELOG.md`

**Step 1: Add marketplace metadata to package.json**

Add these fields at the top level:

```json
"license": "MIT",
"repository": {
  "type": "git",
  "url": "https://github.com/openrouter-chat/vscode"
},
"keywords": ["ai", "chat", "openrouter", "copilot", "completions", "code-intelligence"],
"galleryBanner": {
  "color": "#1a1a2e",
  "theme": "dark"
}
```

**Step 2: Create CHANGELOG.md**

```markdown
# Changelog

## [0.1.0] - 2026-03-14

### Added

#### Phase 1 — Chat Panel
- Side panel chat UI with Solid.js webview
- Streaming responses via SSE
- Markdown rendering with syntax-highlighted code blocks
- Copy and Insert at Cursor actions on code blocks
- Model selector with search across the full OpenRouter catalog
- API key authentication via VSCode SecretStorage
- Basic code context (active file, selection, open editors)
- Empty state with quick-start suggestions

#### Phase 2 — Inline Completions
- Ghost text suggestions as you type (auto mode)
- Manual trigger via `Alt+\`
- Configurable debounce, trigger mode, and context window
- Separate model setting for completions
- Status bar indicator with loading state

#### Phase 3 — Code Intelligence
- VSCode language service integration (hover, definition, references, diagnostics, symbols)
- 5-second TTL cache for language service results
- Editor capability detection per language
- Dynamic system prompt with available editor capabilities
- Tool-use support (rename symbol, apply code action, format document, insert/replace code)

#### Phase 4 — Persistence & Auth
- Conversation history saved locally (JSON files in globalStorageUri)
- Auto-titling conversations via LLM
- Export conversations as JSON or Markdown
- Conversation list UI with load, delete, and export actions
- OAuth PKCE flow structure for OpenRouter

#### Phase 5 — Polish
- Keyboard shortcuts: `Ctrl+Shift+N` (new chat), `Ctrl+Shift+L` (focus chat), `Alt+\` (trigger completion)
- Contextual error notifications with recovery actions
- Extension icon and marketplace metadata
```

**Step 3: Commit**

```bash
git add package.json CHANGELOG.md
git commit -m "docs: add CHANGELOG and marketplace metadata"
```

---

### Task 5: Final Verification & Documentation Update

**Files:**
- Modify: `docs/features.md` — mark all Phase 5 items complete
- Modify: `README.md` — update roadmap, test counts

**Step 1: Run full test suite and build**

Run: `npx vitest run`
Run: `npm run build`

**Step 2: Update features.md**

Mark Phase 5 items as complete: Keyboard shortcuts, Error notifications. Marketplace packaging as complete (metadata added).

**Step 3: Update README roadmap**

Change Phase 5 status from "Planned" to "Done".
Update test count.

**Step 4: Commit**

```bash
git add docs/features.md README.md
git commit -m "docs: mark all phases complete, final documentation update"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Keyboard shortcuts | `package.json`, `src/extension.ts` |
| 2 | Error notifications | `src/core/notifications.ts` + test, `src/chat/message-handler.ts` |
| 3 | Extension icon | `media/icon.svg`, `package.json` |
| 4 | Marketplace metadata + CHANGELOG | `package.json`, `CHANGELOG.md` |
| 5 | Final verification & docs | `docs/features.md`, `README.md` |
