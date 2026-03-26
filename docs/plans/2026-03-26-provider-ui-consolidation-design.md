# Provider UI Consolidation — Design

**Date:** 2026-03-26
**Status:** Approved

## Goal

Replace the current model selector and dual status bar items with a unified two-level `ProviderModelSelector` that allows switching providers, repopulates the model list per provider, and surfaces per-provider settings/auth — all from a single UI entry point.

## Problems Being Solved

1. **No provider distinction** — the model selector shows all models without any provider grouping or switching
2. **Two status bar items** — `$(sparkle) OpenRouter` (inline completions) and `$(key) OpenRouter · $0.0005` (auth + cost) are separate and both hardcoded to "OpenRouter" even when Anthropic or NVIDIA NIM is active
3. **No provider settings access from UI** — users must navigate VS Code settings manually to configure API keys

---

## Design

### Unified Selector Button

Replaces the current `ModelSelector` component. The button in the chat input bar shows:

```
[⚡ Anthropic · Claude Sonnet 4.6 · 23%]
```

- Provider name (from active provider)
- Model display name
- Context fill percentage (existing behavior retained)

---

### Two-Level Picker

#### Level 1 — Provider List

Opens on button click. Shows all three providers with configuration status and a gear icon per provider:

```
● Anthropic      ✓  ⚙
  OpenRouter     ✓  ⚙
  NVIDIA NIM     !  ⚙
```

- `●` filled dot = active provider
- `✓` = configured (API key present / OAuth authenticated)
- `!` = not configured (warning, no API key)
- `⚙` = opens provider settings/auth (see below)

Clicking a provider row navigates to Level 2 for that provider.

#### Level 2 — Model List

```
← Anthropic
  [search...]
  Claude Opus 4.6       $0.015 / $0.075
  Claude Sonnet 4.6 ✓   $0.003 / $0.015
  Claude Haiku 4.5      $0.00025 / $0.00125
```

- Back arrow returns to Level 1
- Same search and pricing display as current model selector
- Currently selected model has a checkmark
- Selecting a model sets both the provider override and the model

#### Model Unavailability Warning

When switching to a provider whose model list does not contain the current model, a yellow banner appears at the top of Level 2:

```
⚠ "nvidia/nemotron-super-49b-v1" not available in Anthropic
  Switching to Claude Sonnet 4.6
```

Auto-selects the first model of the new provider. User can pick a different one before the banner dismisses.

---

### Provider Settings / Auth (Gear Icon)

| Provider | Gear action |
|---|---|
| **OpenRouter** | Triggers `lucentCode.authMenu` — existing Quick Pick with "Sign in with OAuth" and "Set API key manually" |
| **Anthropic** | Opens VS Code settings filtered to `lucentCode.providers.anthropic` |
| **NVIDIA NIM** | Opens VS Code settings filtered to `lucentCode.providers.nvidianim` (API key + base URL) |

---

### Status Bar Consolidation

Remove `InlineCompletionProvider`'s separate status bar item. Merge into a single item in `extension.ts`:

| State | Text |
|---|---|
| Idle, authed | `$(key) Anthropic · $0.0012` |
| Inline completion running | `$(loading~spin) Anthropic · $0.0012` |
| No credits (OpenRouter) | `$(warning) OpenRouter: No credits` |
| No API key | `$(warning) Anthropic: No API key` |
| Not signed in (OpenRouter) | `$(warning) OpenRouter: Not signed in` |

- Provider name is dynamic — reflects `providerRegistry.resolve(settings.chatModel).id` mapped to display name
- Clicking opens `lucentCode.authMenu` (for OpenRouter) or provider settings (for Anthropic/NIM)
- Inline completion spinner replaces the idle icon temporarily; no second item needed

---

## Data Flow

### New Message Types (`ExtensionMessage` / `WebviewMessage`)

**Extension → Webview:**
```ts
{ type: 'providersLoaded', providers: Array<{ id: string; name: string; isConfigured: boolean }> }
```
Sent on startup and whenever provider configuration changes.

**Webview → Extension:**
```ts
{ type: 'switchProvider', providerId: string }
{ type: 'openProviderSettings', providerId: string }
```

### Switch Provider Flow

1. Webview sends `{ type: 'switchProvider', providerId }`
2. Extension sets `lucentCode.providers.override` to `providerId`
3. Extension calls `providerRegistry.getProvider(providerId).listModels()`
4. Extension sends `{ type: 'modelsLoaded', models }` with new list
5. If current model not in new list:
   - Extension auto-selects first model of new provider
   - Sends `{ type: 'modelChanged', modelId, providerName, warning: string }`
6. Webview shows warning banner if `warning` is present

### `isConfigured` Detection

| Provider | Configured when |
|---|---|
| OpenRouter | `auth.isAuthenticated()` returns true |
| Anthropic | `settings.anthropicApiKey` is non-empty |
| NVIDIA NIM | `settings.nvidiaApiKey` is non-empty |

---

## Components Affected

**Modified:**
- `webview/src/components/ModelSelector.tsx` → replaced by `ProviderModelSelector.tsx` (or heavily reworked)
- `webview/src/components/ChatInput.tsx` — swap `ModelSelector` for `ProviderModelSelector`
- `webview/src/stores/chat.ts` — add `activeProvider`, `providers` signal; handle `providersLoaded`, `switchProvider`
- `webview/src/App.tsx` — handle new message types
- `webview/src/styles.css` — new styles for two-level picker, provider list, config badges
- `src/completions/inline-provider.ts` — remove own `StatusBarItem`; accept shared one or signal via callback
- `src/extension.ts` — merge status bar items; handle `switchProvider` and `openProviderSettings`; send `providersLoaded`
- `src/shared/types.ts` — add new message types

**New:**
- `webview/src/components/ProviderModelSelector.tsx` — two-level picker component

---

## Error Handling

- If `listModels()` fails for a provider, Level 2 shows an inline error: `⚠ Failed to load models — check API key`
- If provider is not configured, Level 2 is disabled with a prompt: `Configure Anthropic to see models →`

---

## Out of Scope

- Per-provider model filtering beyond what the provider's `listModels()` returns
- Model favoriting or pinning
- Cost estimation before sending
