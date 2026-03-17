# V1 Features Design: Import Conversations + Type Unification + OAuth Token Management

**Date:** 2026-03-17
**Status:** Approved

---

## 1. Import Conversations

### Goal

Complete the export/import pair. Export already ships (JSON and Markdown). Import accepts a `.json` file exported by this extension and restores it as a new conversation in local history.

### Architecture

**New method:** `ConversationHistory.importFromJson(json: string): Promise<Conversation>`
- Parse the JSON string
- Validate required fields: `title`, `model`, `messages`, `createdAt`, `updatedAt` (all must be present and correctly typed)
- Generate a new ID via `generateId()` — never reuse the source ID to avoid collisions
- Save with `this.save(conversation)` and return the result

**New command:** `openRouterChat.importConversation` registered in `extension.ts`
- Show file picker: `vscode.window.showOpenDialog({ filters: { 'JSON': ['json'] }, canSelectMany: false })`
- Read file with `vscode.workspace.fs.readFile`
- Call `history.importFromJson(content)`
- On success: show `showInformationMessage('Conversation imported: {title}')` and post `conversationList` update to webview
- On error: show `showErrorMessage('Import failed: {reason}')`

**No webview changes.** Import is a rare operation — a VSCode command fits better than panel UI.

### Validation rules

| Field | Check |
|---|---|
| `title` | `typeof === 'string'` |
| `model` | `typeof === 'string'` |
| `messages` | array of `{ role, content }` objects; role must be `'user'` or `'assistant'` |
| `createdAt` | `typeof === 'string'` |
| `updatedAt` | `typeof === 'string'` |

Reject (throw with descriptive message) if any check fails.

### Testing

- Parse valid JSON → saves with new ID, returns conversation
- Missing required field → throws with descriptive message
- Invalid messages array → throws
- File picker cancel → returns without error

---

## 2. Type Unification (Webview ↔ Extension)

### Goal

Remove duplicated type definitions in `webview/src/stores/chat.ts` that shadow identical/overlapping types in `src/shared/types.ts`.

### What gets unified

| Webview type | Extension type | Action |
|---|---|---|
| `ConversationSummary` | `ConversationSummary` | Delete webview copy, import from `@shared` |
| `Model` | `OpenRouterModel` | Delete `Model`, import `OpenRouterModel` from `@shared`; update usages |
| `ChatMessage` | `ChatMessage` | Keep separate — webview version has `isStreaming`, extension has `tool` role |

### Changes

**`webview/vite.config.ts`** — add resolve alias:
```ts
import path from 'path';
// ...
resolve: {
  alias: {
    '@shared': path.resolve(__dirname, '../src/shared/types'),
  },
},
```

**`webview/tsconfig.json`** — add `paths`, remove `rootDir` (Vite handles output structure):
```json
{
  "compilerOptions": {
    "paths": {
      "@shared": ["../src/shared/types"]
    }
  }
}
```
Remove `"rootDir": "src"` — it only constrains `tsc` output, which is irrelevant since Vite builds the webview.

**`webview/src/stores/chat.ts`**
- Add: `import type { ConversationSummary, OpenRouterModel } from '@shared';`
- Delete: `interface ConversationSummary { ... }` and `interface Model { ... }`
- Replace all `Model` references with `OpenRouterModel`
- `handleConversationLoaded` parameter type: replace the inline object type with `import type { Conversation } from '@shared'` and use `Conversation`

### Testing

- `npm run build` (webview) must succeed with no errors
- Existing 144 extension tests must still pass
- TypeScript type check: no new errors in `webview/src/**`

---

## 3. OAuth Token Management

### Goal

Full key lifecycle: status bar showing auth state, sign-out command that clears the local key AND revokes it server-side via the OpenRouter API, and quick-pick entry points for all auth actions.

### Architecture

#### Status Bar Item

Created in `extension.ts` after `AuthManager` construction. Two states:

| State | Text | Tooltip | Color |
|---|---|---|---|
| Authenticated | `$(key) OpenRouter` | "Signed in — click to manage" | default |
| Not authenticated | `$(warning) OpenRouter: No API key` | "Click to sign in" | `statusBarItem.warningBackground` |

Click command: `openRouterChat.authMenu` — shows a `showQuickPick` with context-appropriate options.

#### `openRouterChat.authMenu` command

When **authenticated:**
- "Set API Key" → `auth.promptForApiKey()`
- "Sign in with OAuth" → `auth.startOAuth()`
- "Sign out" → `auth.signOut()`

When **not authenticated:**
- "Set API Key" → `auth.promptForApiKey()`
- "Sign in with OAuth" → `auth.startOAuth()`

#### `auth.signOut()` method on `AuthManager`

```ts
async signOut(): Promise<void> {
  const key = await this.getApiKey();
  if (!key) return;

  // Attempt server-side revocation — best effort, don't block on failure
  try {
    await fetch('https://openrouter.ai/api/v1/auth/key', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${key}` },
    });
  } catch { /* ignore network errors */ }

  await this.clearApiKey();
}
```

**Note:** The OpenRouter revocation endpoint is assumed to be `DELETE /api/v1/auth/key` with a `Bearer` token header. If the endpoint differs, update accordingly — the implementation is isolated in `signOut()`.

#### Status bar update

`AuthManager.onDidChangeAuth` already fires on `setApiKey` and `clearApiKey`. In `extension.ts`, subscribe to this event to update the status bar label and color.

On activation: call `auth.isAuthenticated()` to set initial status bar state.

#### `openRouterChat.signOut` command

Register a dedicated `openRouterChat.signOut` command (for command palette access) that calls `auth.signOut()` then shows `showInformationMessage('Signed out of OpenRouter.')`.

### New public methods on `AuthManager`

| Method | Description |
|---|---|
| `isAuthenticated(): Promise<boolean>` | Returns `!!(await this.getApiKey())` |
| `signOut(): Promise<void>` | Revoke server-side (best effort) + `clearApiKey()` |

### Testing

- `isAuthenticated()` returns `true` when key present, `false` when absent
- `signOut()` calls `clearApiKey()` and fires `onDidChangeAuth(false)`
- `signOut()` does not throw when revocation request fails (network error)
- `signOut()` is a no-op when already signed out

---

## Files Touched (all three features combined)

| File | Change |
|---|---|
| `src/chat/history.ts` | Add `importFromJson()` method |
| `src/chat/history.test.ts` | Tests for import |
| `src/core/auth.ts` | Add `isAuthenticated()`, `signOut()` |
| `src/core/auth.test.ts` | Tests for new methods |
| `src/extension.ts` | Register 3 new commands, create status bar item, wire `onDidChangeAuth` |
| `webview/vite.config.ts` | Add `@shared` alias |
| `webview/tsconfig.json` | Add `paths`, remove `rootDir` |
| `webview/src/stores/chat.ts` | Import from `@shared`, remove duplicate types |
