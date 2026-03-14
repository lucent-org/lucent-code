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
- Manual trigger via Alt+\
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
- Keyboard shortcuts: Ctrl+Shift+N (new chat), Ctrl+Shift+L (focus chat), Alt+\ (trigger completion)
- Contextual error notifications with recovery actions
- Extension icon and marketplace metadata
