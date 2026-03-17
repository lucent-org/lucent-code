# Lucent Code Rebrand Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rename and reposition the extension from "OpenRouter Chat" to "Lucent Code" across all source files, package metadata, UI strings, and documentation.

**Architecture:** Pure rename/replace — no logic changes. Touch `package.json` for metadata and command/setting/view IDs, update matching string references in all TypeScript source files, update the webview UI string, create the icon, and rewrite the README. Tests need updating where they reference old command/setting strings.

**Tech Stack:** TypeScript, VSCode Extension API, Solid.js webview, Vitest

---

### Task 1: Update `package.json` metadata and IDs

**Files:**
- Modify: `package.json`

**Context:**
`package.json` is the single source of truth for the extension's marketplace identity, command IDs, setting keys, view IDs, and keybindings. Every `openRouterChat.*` command ID declared here must be updated. The setting section prefix `openRouterChat` becomes `lucentCode`. The view container ID `openrouter-chat` becomes `lucent-code`.

**Step 1: Apply all changes to `package.json`**

Replace the top metadata block:
```json
"name": "lucent-code",
"displayName": "Lucent Code",
"description": "The only VS Code AI that uses your language server — not text search. Chat, completions, and code intelligence in one.",
"publisher": "lucentcode",
"galleryBanner": {
  "color": "#0d0d1a",
  "theme": "dark"
},
"icon": "images/icon.png",
"keywords": [
  "ai", "chat", "lsp", "code-intelligence", "completions",
  "openrouter", "inline-completions", "semantic", "all-in-one",
  "chat-assistant", "copilot-alternative", "language-server"
],
```

Replace viewsContainers:
```json
"viewsContainers": {
  "activitybar": [{
    "id": "lucent-code",
    "title": "Lucent Code",
    "icon": "$(comment-discussion)"
  }]
},
"views": {
  "lucent-code": [{
    "type": "webview",
    "id": "lucentCode.chatView",
    "name": "Chat"
  }]
},
```

Replace all commands — change every `openRouterChat.` prefix to `lucentCode.`:
```json
{ "command": "lucentCode.setApiKey",           "title": "Set API Key",                "category": "Lucent Code" },
{ "command": "lucentCode.importConversation",   "title": "Import Conversation",        "category": "Lucent Code" },
{ "command": "lucentCode.newChat",              "title": "New Chat",                   "category": "Lucent Code" },
{ "command": "lucentCode.triggerCompletion",    "title": "Trigger Inline Completion",  "category": "Lucent Code" },
{ "command": "lucentCode.focusChat",            "title": "Focus Chat Panel",           "category": "Lucent Code" },
{ "command": "lucentCode.explainCode",          "title": "Explain (Add to Chat)",      "category": "Lucent Code" },
{ "command": "lucentCode.explainCodeNew",       "title": "Explain (New Chat)",         "category": "Lucent Code" },
{ "command": "lucentCode.fixCode",              "title": "Fix (Add to Chat)",          "category": "Lucent Code" },
{ "command": "lucentCode.fixCodeNew",           "title": "Fix (New Chat)",             "category": "Lucent Code" },
{ "command": "lucentCode.improveCode",          "title": "Improve (Add to Chat)",      "category": "Lucent Code" },
{ "command": "lucentCode.improveCodeNew",       "title": "Improve (New Chat)",         "category": "Lucent Code" },
{ "command": "lucentCode.signOut",              "title": "Sign Out",                   "category": "Lucent Code" },
{ "command": "lucentCode.authMenu",             "title": "Manage Authentication",      "category": "Lucent Code" }
```

Replace configuration section:
```json
"configuration": {
  "title": "Lucent Code",
  "properties": {
    "lucentCode.chat.model": { ... },
    "lucentCode.chat.temperature": { ... },
    "lucentCode.chat.maxTokens": { ... },
    "lucentCode.completions.model": { ... },
    "lucentCode.completions.triggerMode": { ... },
    "lucentCode.completions.debounceMs": { ... },
    "lucentCode.completions.maxContextLines": { ... }
  }
}
```
(Keep all property schemas identical — only rename the key prefix.)

Replace keybindings:
```json
{ "command": "lucentCode.triggerCompletion", "key": "alt+\\", "when": "editorTextFocus" },
{ "command": "lucentCode.newChat",  "key": "ctrl+shift+n", "mac": "cmd+shift+n", "when": "lucentCode.chatView.visible" },
{ "command": "lucentCode.focusChat","key": "ctrl+shift+l", "mac": "cmd+shift+l" }
```

Replace submenu and menus:
```json
"submenus": [{ "id": "lucentCode.editorContext", "label": "Lucent Code" }],
"menus": {
  "editor/context": [{ "submenu": "lucentCode.editorContext", "when": "editorHasSelection", "group": "navigation@100" }],
  "lucentCode.editorContext": [
    { "command": "lucentCode.explainCode",    "group": "1_explain@1" },
    { "command": "lucentCode.explainCodeNew", "group": "1_explain@2" },
    { "command": "lucentCode.fixCode",        "group": "2_fix@1" },
    { "command": "lucentCode.fixCodeNew",     "group": "2_fix@2" },
    { "command": "lucentCode.improveCode",    "group": "3_improve@1" },
    { "command": "lucentCode.improveCodeNew", "group": "3_improve@2" }
  ]
}
```

**Step 2: Verify JSON is valid**

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('OK')"
```
Expected: `OK`

**Step 3: Commit**

```bash
git add package.json
git commit -m "chore: rebrand package.json to Lucent Code"
```

---

### Task 2: Update TypeScript source strings

**Files:**
- Modify: `src/extension.ts`
- Modify: `src/core/settings.ts`
- Modify: `src/chat/chat-provider.ts`
- Modify: `src/core/auth.ts`
- Modify: `src/core/notifications.ts`
- Modify: `src/core/instructions-loader.ts`
- Modify: `src/core/openrouter-client.ts`
- Modify: `src/chat/message-handler.ts`

**Context:**
All `openRouterChat.*` command ID strings in TypeScript must match the new IDs declared in `package.json`. Settings use `openRouterChat` as the section key — this changes to `lucentCode`. Auth stores the API key under `openRouterChat.apiKey` — change to `lucentCode.apiKey`. The OAuth redirect URI uses `vscode://openrouter-chat/` — change to `vscode://lucent-code/`.

**Step 1: `src/core/settings.ts` — change section key**

```ts
// line 3
const SECTION = 'lucentCode';
```

**Step 2: `src/chat/chat-provider.ts` — change view type and title**

```ts
// view type
public static readonly viewType = 'lucentCode.chatView';

// HTML title (in getHtmlForWebview)
<title>Lucent Code</title>
```

**Step 3: `src/core/auth.ts` — change secret key and OAuth URI**

```ts
// secret storage key
const SECRET_KEY = 'lucentCode.apiKey';

// OAuth redirect URI
vscode.Uri.parse('vscode://lucent-code/oauth-callback')
```

**Step 4: `src/core/notifications.ts` — change command references**

```ts
vscode.commands.executeCommand('lucentCode.setApiKey');
// (both occurrences)
```

**Step 5: `src/core/instructions-loader.ts` — change warning message**

```ts
`Lucent Code: ${filename} exceeds 50 KB and will be ignored.`
```

**Step 6: `src/core/openrouter-client.ts` — change X-Title header**

```ts
'X-Title': 'Lucent Code VSCode',
```

**Step 7: `src/extension.ts` — change all command registrations and references**

Replace every `openRouterChat.` string with `lucentCode.`:
- `authStatusBar.command = 'lucentCode.authMenu'`
- All `vscode.commands.registerCommand('lucentCode.*', ...)` calls
- `vscode.commands.executeCommand('lucentCode.chatView.focus')`
- Welcome message: `'Welcome to Lucent Code! Set your API key to get started.'`

**Step 8: `src/chat/message-handler.ts` — change status bar message**

```ts
vscode.window.setStatusBarMessage('Lucent Code: Opening diff editor...', 3000);
```

**Step 9: Run tests to confirm nothing broken**

```bash
npx vitest run
```
Expected: 175/175 passed

**Step 10: Commit**

```bash
git add src/
git commit -m "chore: update command IDs and setting keys to lucentCode"
```

---

### Task 3: Update test files

**Files:**
- Modify: `src/core/notifications.test.ts`
- Modify: `src/core/auth.test.ts`

**Context:**
Test files reference old command IDs and setting keys. These need to match the new strings so tests continue to assert the right values.

**Step 1: Check which test strings need updating**

```bash
grep -n "openRouterChat\|openrouter-chat\|OpenRouter Chat" src/core/notifications.test.ts src/core/auth.test.ts
```

**Step 2: Update `src/core/notifications.test.ts`**

Replace any `'openRouterChat.setApiKey'` with `'lucentCode.setApiKey'`.

**Step 3: Update `src/core/auth.test.ts`**

Replace any `openrouter-chat` OAuth URI strings with `lucent-code`.
Replace any `openRouterChat.apiKey` secret key strings with `lucentCode.apiKey`.

**Step 4: Run tests**

```bash
npx vitest run
```
Expected: 175/175 passed

**Step 5: Commit**

```bash
git add src/core/notifications.test.ts src/core/auth.test.ts
git commit -m "chore: update test assertions to lucentCode IDs"
```

---

### Task 4: Update webview UI strings

**Files:**
- Modify: `webview/src/App.tsx`
- Modify: `webview/index.html`

**Context:**
The webview has two hardcoded "OpenRouter Chat" strings — the empty-state heading and the API key hint. Both should update to "Lucent Code". The `index.html` title is already "OpenRouter Chat" and needs updating.

**Step 1: `webview/index.html`**

```html
<title>Lucent Code</title>
```

**Step 2: `webview/src/App.tsx` — empty state heading**

```tsx
// line 122 area
<div class="empty-state-title">Lucent Code</div>
```

**Step 3: `webview/src/App.tsx` — API key hint**

```tsx
<span>Set your API key to get started.<br/>Use the command palette: <code>Lucent Code: Set API Key</code></span>
```

**Step 4: Run tests**

```bash
npx vitest run
```
Expected: 175/175 passed

**Step 5: Commit**

```bash
git add webview/src/App.tsx webview/index.html
git commit -m "chore: update webview UI strings to Lucent Code"
```

---

### Task 5: Create the icon

**Files:**
- Create: `images/icon.svg`
- Create: `images/icon.png` (128×128)

**Context:**
`package.json` references `images/icon.png` for the marketplace listing. The icon concept is a soft glowing light source on a dark `#0d0d1a` background — a radiant point of light with a subtle violet-to-blue spectrum edge. Must read clearly at 128×128 (marketplace), 32×32 (activity bar), and 16×16 (tab).

**Step 1: Create `images/` directory**

```bash
mkdir -p images
```

**Step 2: Create `images/icon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <!-- Dark background -->
  <rect width="128" height="128" rx="16" fill="#0d0d1a"/>

  <!-- Outer glow rings -->
  <circle cx="64" cy="64" r="48" fill="none" stroke="#a78bfa" stroke-width="1" opacity="0.15"/>
  <circle cx="64" cy="64" r="36" fill="none" stroke="#818cf8" stroke-width="1" opacity="0.2"/>
  <circle cx="64" cy="64" r="24" fill="none" stroke="#38bdf8" stroke-width="1.5" opacity="0.3"/>

  <!-- Radial gradient glow -->
  <defs>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stop-color="#ffffff" stop-opacity="1"/>
      <stop offset="20%"  stop-color="#e0e7ff" stop-opacity="0.9"/>
      <stop offset="50%"  stop-color="#a78bfa" stop-opacity="0.5"/>
      <stop offset="80%"  stop-color="#38bdf8" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#0d0d1a" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Glow fill -->
  <circle cx="64" cy="64" r="48" fill="url(#glow)"/>

  <!-- Bright core -->
  <circle cx="64" cy="64" r="8" fill="#ffffff" opacity="0.95"/>
  <circle cx="64" cy="64" r="4" fill="#ffffff"/>
</svg>
```

**Step 3: Export PNG**

Option A — using Inkscape (if installed):
```bash
inkscape images/icon.svg --export-png=images/icon.png --export-width=128 --export-height=128
```

Option B — using Node.js + sharp (install if needed):
```bash
npm install --save-dev sharp
node -e "require('sharp')('images/icon.svg').resize(128,128).png().toFile('images/icon.png', (e,i) => console.log(e||i))"
```

Option C — open `images/icon.svg` in a browser, screenshot at 128×128, save as `images/icon.png`.

**Step 4: Verify `images/icon.png` exists and is ~128×128**

```bash
ls -lh images/
```

**Step 5: Commit**

```bash
git add images/
git commit -m "feat: add Lucent Code icon (glow on dark background)"
```

---

### Task 6: Rewrite README.md

**Files:**
- Modify: `README.md`

**Context:**
The README is the marketplace listing page. Replace entirely with the approved marketing copy from `docs/plans/2026-03-17-lucent-code-marketing.md`. The hero line is "Write code in a new light." The differentiator table (LSP vs grep) comes first.

**Step 1: Replace `README.md` with the approved marketing copy**

Full content (copy from the marketing doc, section "Marketplace Long Description"):

```markdown
# Lucent Code

### Write code in a new light.

Lucent Code is the AI coding assistant that understands your codebase the same way VS Code does — through your language server, not file search.

While other tools grep through your files hoping to find the right answer, Lucent Code resolves symbols, follows type definitions, looks up references, and reads diagnostics directly from the language server. The result: responses that are accurate, context-aware, and actually useful.

---

## Why Lucent Code is different

| | Other AI tools | Lucent Code |
|---|---|---|
| Code understanding | Text search (grep/glob) | Language server (LSP) |
| Symbol resolution | Regex pattern matching | `executeDefinitionProvider` |
| Type information | Guessed from context | `executeHoverProvider` |
| References | File scan | `executeReferenceProvider` |
| Diagnostics | None | Live errors and warnings |
| Models | One vendor | Any model via OpenRouter |

---

## Features

### 🔍 LSP-first code intelligence
Lucent Code reads your code the way VS Code does. Symbol definitions, type signatures, references, document structure, and live diagnostics are all pulled from your language server — giving the AI the same picture your editor has.

### 💬 Streaming chat panel
A fast, focused side-panel chat built for developers. Markdown rendering, syntax-highlighted code blocks, copy and insert buttons, and real-time streaming responses. Ask questions, get explanations, request changes — all without leaving your editor.

### ⚡ Inline completions
Ghost-text suggestions that appear as you type. Supports auto-trigger (debounced) and manual trigger (`Alt+\`). Respects `editor.inlineSuggest.enabled`. Works with any model on OpenRouter.

### 🛠️ AI editor tools — with human approval
The AI can take direct actions in your editor: rename symbols, insert code, replace ranges, apply quick fixes, and format documents. Destructive operations show an inline approval card — you stay in control.

### 🌐 Web and network tools
The AI can search the web, fetch URLs as clean Markdown, and make HTTP requests to local or remote APIs — no extra API keys required.

### 🔄 Any model, via OpenRouter
Access every major AI model — Claude, GPT-4o, Gemini, Mistral, Llama, and more — through a single OpenRouter API key. Switch models per conversation. No vendor lock-in.

### 📚 Conversation history
Conversations are saved locally and restored on reopen. Export as JSON or Markdown. Import from JSON. Auto-generated titles keep your history organised.

### 📋 Context menu actions
Right-click any selection for **Explain**, **Fix**, or **Improve** — appended to the current chat or opened in a new one.

### 📄 Custom instructions
Drop a `.lucent-instructions.md` or `.cursorrules` file in your workspace root to inject project-specific context into every conversation.

---

## Getting started

1. Install Lucent Code
2. Get a free API key at [openrouter.ai](https://openrouter.ai)
3. Run `Lucent Code: Set API Key` from the command palette
4. Open the chat panel from the activity bar
5. Select a model and start chatting

---

## Keyboard shortcuts

| Action | Shortcut |
|---|---|
| Focus chat panel | `Ctrl+Shift+L` |
| New chat | `Ctrl+Shift+N` |
| Trigger inline completion | `Alt+\` |

---

## Requirements

- VS Code 1.85+
- An [OpenRouter](https://openrouter.ai) API key (free tier available)

---

## Privacy

All requests go directly from your editor to OpenRouter's API. No telemetry, no data collection, no third-party servers beyond OpenRouter and the model provider you choose.
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README with Lucent Code marketing copy"
```

---

### Task 7: Update CHANGELOG.md

**Files:**
- Modify: `CHANGELOG.md`

**Context:**
Add a rebrand entry at the top of the changelog so marketplace visitors understand the history.

**Step 1: Prepend to `CHANGELOG.md`**

```markdown
## [Unreleased] — Rebrand

### Changed
- Extension renamed from **OpenRouter Chat** to **Lucent Code**
- Publisher ID: `lucentcode`, Extension ID: `lucentcode.lucent-code`
- All command IDs updated: `openRouterChat.*` → `lucentCode.*`
- All setting keys updated: `openRouterChat.*` → `lucentCode.*`
- New icon and dark marketplace banner (`#0d0d1a`)
- Updated marketplace description and README

> If you had custom keybindings pointing to `openRouterChat.*` commands, update them to `lucentCode.*`.
```

**Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: add rebrand entry to CHANGELOG"
```

---

### Task 8: Final verification

**Step 1: Run full test suite**

```bash
npx vitest run --reporter=verbose
```
Expected: 175/175 passed, 0 failures

**Step 2: Verify no old brand strings remain in source**

```bash
grep -rn "openRouterChat\|openrouter-chat\|OpenRouter Chat" src/ webview/src/ package.json --include="*.ts" --include="*.tsx" --include="*.json"
```
Expected: zero results (only acceptable hits are inside test fixture strings that intentionally test old behaviour, and comments)

**Step 3: Build the extension**

```bash
npm run build
```
Expected: no errors

**Step 4: Commit if any stragglers fixed**

```bash
git add -A
git commit -m "chore: clean up remaining brand string stragglers"
```
