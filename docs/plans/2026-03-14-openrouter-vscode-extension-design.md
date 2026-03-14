# OpenRouter Chat — VSCode Extension Design

## Overview

A VSCode extension that integrates OpenRouter's full model catalog into the editor, providing a Copilot/Claude Chat-like experience with a chat side panel and inline completions. Uses VSCode's built-in language services for code intelligence — no custom LSP required.

## Architecture: Modular Monolith

Single extension with clearly separated internal modules. Each module is independently testable and maps to a delivery phase.

### Project Structure

```
openrouter-chat/
├── src/
│   ├── extension.ts              # Activation, command registration
│   ├── core/
│   │   ├── openrouter-client.ts  # OpenRouter API client (streaming, model listing)
│   │   ├── auth.ts               # API key + OAuth management
│   │   ├── settings.ts           # Extension settings wrapper
│   │   └── context-builder.ts    # Gathers code context for prompts
│   ├── chat/
│   │   ├── chat-provider.ts      # WebviewViewProvider for the side panel
│   │   ├── message-handler.ts    # Extension ↔ webview message protocol
│   │   └── history.ts            # Conversation persistence & export
│   ├── completions/
│   │   ├── inline-provider.ts    # InlineCompletionItemProvider
│   │   └── trigger-config.ts     # Auto/manual trigger logic + debounce
│   ├── lsp/
│   │   └── code-intelligence.ts  # Wrappers around VSCode language APIs
│   └── shared/
│       └── types.ts              # Shared interfaces & types
├── webview/                      # Solid.js chat UI (separate build)
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── ChatMessage.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   ├── ModelSelector.tsx
│   │   │   └── CodeBlock.tsx
│   │   ├── stores/
│   │   │   ├── chat.ts
│   │   │   └── settings.ts
│   │   └── utils/
│   │       └── markdown.ts
│   ├── index.html
│   └── vite.config.ts
├── package.json                  # Extension manifest + contributes
├── tsconfig.json
└── esbuild.config.ts             # Extension host bundling
```

### Build Pipeline

- **esbuild** for the extension host (fast, standard for VSCode extensions)
- **Vite** for the Solid webview (best DX for Solid, outputs to `dist/webview/`)
- Two separate build pipelines that merge into one `dist/` folder

---

## Module Design

### Core Module

**OpenRouter Client (`core/openrouter-client.ts`):**
- Wraps the OpenRouter `/api/v1/chat/completions` endpoint (OpenAI-compatible)
- Supports streaming via SSE for chat responses
- Fetches the full model catalog from `/api/v1/models` for the model selector
- Handles rate limiting, retries with exponential backoff, and error mapping
- Accepts an abort signal for cancelling in-flight requests

**Auth (`core/auth.ts`):**
- API key stored in VSCode's `SecretStorage` (encrypted, not in plaintext settings)
- OAuth flow: opens browser via `vscode.env.openExternal`, listens on a local redirect URI, exchanges code for token, stores token in `SecretStorage`
- Auth state exposed as an EventEmitter so other modules can react to login/logout
- On activation, checks for existing credentials and prompts if missing

**Settings (`core/settings.ts`):**
- Thin wrapper around `vscode.workspace.getConfiguration('openRouterChat')`
- Typed accessors for: preferred model, trigger mode, debounce delay, temperature, max tokens, etc.

**Context Builder (`core/context-builder.ts`):**
- Gathers relevant code context to include in prompts:
  - Current file content + cursor position
  - Selected text (if any)
  - Open editor tabs (file paths + languages)
  - Diagnostics (errors/warnings) from the active file
- Calls into the `lsp/` module for richer context when needed
- Formats context into a structured system prompt section

---

### Chat Module

**Chat Provider (`chat/chat-provider.ts`):**
- Implements `WebviewViewProvider` — registers as a side panel in the activity bar with a custom icon
- Loads the Solid webview from `dist/webview/`
- Applies CSP (Content Security Policy) to the webview
- Manages the webview lifecycle (create, show, dispose)

**Message Protocol (`chat/message-handler.ts`):**
- Bidirectional messaging between extension host and webview via `postMessage`
- Message types:
  - `sendMessage` — user submits a prompt
  - `streamChunk` — streamed response token from OpenRouter
  - `streamEnd` / `streamError` — completion/error signals
  - `setModel` — user selects a different model
  - `getModels` — webview requests the model catalog
  - `getHistory` — webview requests saved conversations
  - `cancelRequest` — user stops a generation
- Typed message contracts shared via `shared/types.ts`

**History (`chat/history.ts`):**
- Conversations stored as JSON files in `globalStorageUri`
- Each conversation: `{ id, title, model, messages[], createdAt, updatedAt }`
- Auto-titles conversation based on first message (lightweight LLM call for summary)
- Export as JSON or Markdown
- Import from JSON

**Solid Webview (`webview/`):**
- `ChatMessage` — Renders user/assistant messages with Markdown + syntax-highlighted code blocks
- `ChatInput` — Multiline text area, submit on Enter (Shift+Enter for newline), stop button during streaming
- `ModelSelector` — Dropdown populated from the model catalog, shows model name + provider
- `CodeBlock` — Syntax highlighting, copy button, "Insert at cursor" and "Apply to file" actions
- Stores manage chat state and settings reactively via Solid's signals

---

### Inline Completions Module

**Inline Provider (`completions/inline-provider.ts`):**
- Implements `InlineCompletionItemProvider`
- Builds prompt from:
  - File content before/after cursor (windowed to stay within token limits)
  - File language identifier
  - Diagnostics on the current line
  - Relevant symbol definitions from `lsp/` module
- Calls OpenRouter with a FIM-capable model or completion-style prompt
- Returns one or more `InlineCompletionItem` suggestions

**Trigger Config (`completions/trigger-config.ts`):**
- Automatic mode: triggers after configurable debounce (default ~300ms)
- Manual mode: triggers only via keybinding (default: `Alt+\`)
- Setting: `openRouterChat.completions.triggerMode` — `"auto" | "manual"`
- Cancels in-flight requests when user keeps typing
- Respects `editor.inlineSuggest.enabled` as a global kill switch

**Model selection:**
- Separate setting from chat: `openRouterChat.completions.model`
- Defaults to a fast, cheap model (user can override)

---

### LSP / Code Intelligence Module

**Code Intelligence (`lsp/code-intelligence.ts`):**
- Wraps VSCode's built-in language service commands:
  - `getDefinition` → `vscode.executeDefinitionProvider`
  - `getTypeDefinition` → `vscode.executeTypeDefinitionProvider`
  - `getHover` → `vscode.executeHoverProvider`
  - `getReferences` → `vscode.executeReferenceProvider`
  - `getDiagnostics` → `vscode.languages.getDiagnostics`
  - `getSymbols` → `vscode.executeDocumentSymbolProvider`
- All calls on-demand, not continuous
- Brief TTL cache (~5s) to avoid redundant calls
- Graceful fallback: missing providers are simply omitted
- `resolveContext(uri, position)` convenience method for full context gathering

**Editor Capability Hints:**
- On file open / language change, probes which providers are available (rename, code actions, formatting, refactoring, signature help, etc.)
- Injects a dynamic "editor capabilities" block into the system prompt listing only what's actually supported for the current language
- Exposes editor actions as tools for models that support tool use:
  - `rename_symbol({ uri, position, newName })`
  - `apply_code_action({ uri, position, actionTitle })`
  - `format_document({ uri })`
  - `insert_code({ uri, position, code })`
  - `replace_range({ uri, range, code })`
- Fetches available code actions at cursor via `vscode.executeCodeActionProvider` and includes them in the prompt
- Shows diff preview to user for approval before applying destructive changes
- Only advertises capabilities that are actually available for the current language

---

## Phasing Plan

### Phase 1 — MVP
- Extension scaffold (esbuild + Vite, activation, commands)
- OpenRouter client with streaming
- API key auth (SecretStorage)
- Chat webview with Solid (send messages, stream responses, code blocks)
- Basic context: current file + selection
- Model selector (full catalog from OpenRouter API)

### Phase 2 — Inline Completions
- InlineCompletionItemProvider
- Auto + manual trigger modes with debounce
- Separate model setting for completions
- Windowed file context (before/after cursor)

### Phase 3 — Code Intelligence & LSP Hints
- VSCode language service wrappers
- Context enrichment (definitions, types, diagnostics, references)
- Editor capability detection + system prompt injection
- Tool-use for editor actions (rename, code actions, format)
- Diff preview for approval on destructive actions

### Phase 4 — Auth & Persistence
- OAuth flow (browser redirect, token exchange)
- Conversation persistence (save/load from globalStorageUri)
- Export (JSON + Markdown) / Import
- Auto-titling conversations

### Phase 5 — Polish
- Settings UI refinements
- Keyboard shortcuts & command palette commands
- Error handling & user-facing notifications
- Extension marketplace packaging & README
