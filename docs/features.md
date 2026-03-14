# OpenRouter Chat — Feature Inventory

Complete feature list for the OpenRouter Chat VSCode extension. Features are grouped by module and tagged with the phase in which they are planned for delivery.

**Legend:** :white_check_mark: = Implemented | :construction: = Planned

---

## Chat Panel

| Status | Feature | Description | Phase |
|--------|---------|-------------|-------|
| :white_check_mark: | Side panel chat UI | Solid.js webview in the activity bar side panel | 1 |
| :white_check_mark: | Streaming responses | Real-time token-by-token response rendering via SSE | 1 |
| :white_check_mark: | Markdown rendering | Full Markdown support in assistant messages | 1 |
| :white_check_mark: | Syntax-highlighted code blocks | Code blocks with language-aware syntax highlighting | 1 |
| :white_check_mark: | Copy code button | One-click copy on code blocks | 1 |
| :white_check_mark: | Insert at cursor | Insert code block content at the current editor cursor | 1 |
| :construction: | Apply to file | Apply code block as an edit to the referenced file | 1 |
| :white_check_mark: | Cancel generation | Stop button to abort in-flight streaming responses | 1 |
| :white_check_mark: | Multi-line input | Shift+Enter for newlines, Enter to submit | 1 |
| :white_check_mark: | Empty state guidance | Welcome screen with API key hint or quick-start suggestions | 1 |
| :construction: | Conversation history | Persist conversations locally, restore on reopen | 4 |
| :construction: | Auto-title conversations | Generate conversation titles via a lightweight LLM call | 4 |
| :construction: | Export conversations | Export as JSON or Markdown | 4 |
| :construction: | Import conversations | Import conversations from JSON | 4 |

## Model Selection

| Status | Feature | Description | Phase |
|--------|---------|-------------|-------|
| :white_check_mark: | Full model catalog | Fetch and display all available models from OpenRouter API | 1 |
| :white_check_mark: | Model selector dropdown | Choose model from dropdown with search, shows name + provider | 1 |
| :white_check_mark: | Separate chat model setting | Configurable default model for chat | 1 |
| :construction: | Separate completions model setting | Configurable default model for inline completions | 2 |

## Inline Completions

| Status | Feature | Description | Phase |
|--------|---------|-------------|-------|
| :construction: | Ghost text suggestions | Inline completion items rendered as ghost text | 2 |
| :construction: | Automatic trigger mode | Suggestions appear after a debounce while typing | 2 |
| :construction: | Manual trigger mode | Suggestions only on keybinding (default: `Alt+\`) | 2 |
| :construction: | Configurable trigger mode | Setting to switch between auto and manual | 2 |
| :construction: | Configurable debounce | Setting to adjust auto-trigger delay (default 300ms) | 2 |
| :construction: | Request cancellation | Cancel in-flight completions when user keeps typing | 2 |
| :construction: | Windowed file context | Send code before/after cursor within token limits | 2 |
| :construction: | Global kill switch | Respects `editor.inlineSuggest.enabled` | 2 |

## Authentication

| Status | Feature | Description | Phase |
|--------|---------|-------------|-------|
| :white_check_mark: | API key auth | Store API key in VSCode SecretStorage (encrypted) | 1 |
| :white_check_mark: | Auth prompt on activation | Prompt for credentials if none found on startup | 1 |
| :construction: | OAuth flow | Browser-based login via OpenRouter OAuth | 4 |
| :construction: | Token management | Secure token storage, refresh, and revocation | 4 |
| :white_check_mark: | Auth state events | EventEmitter for login/logout so modules can react | 1 |

## Code Intelligence (LSP Integration)

| Status | Feature | Description | Phase |
|--------|---------|-------------|-------|
| :white_check_mark: | Current file context | Include active file content + cursor position in prompts | 1 |
| :white_check_mark: | Selection context | Include selected text in prompts | 1 |
| :white_check_mark: | Open editors context | Include open tab file paths + languages | 1 |
| :white_check_mark: | Diagnostics context | Include current file errors/warnings in prompts | 3 |
| :white_check_mark: | Definition resolution | Resolve symbol definitions via `executeDefinitionProvider` | 3 |
| :white_check_mark: | Type definition resolution | Resolve type signatures via `executeTypeDefinitionProvider` | 3 |
| :white_check_mark: | Hover info | Get type info + docs via `executeHoverProvider` | 3 |
| :white_check_mark: | Reference lookup | Find symbol usages via `executeReferenceProvider` | 3 |
| :white_check_mark: | Document symbols | Get file structure via `executeDocumentSymbolProvider` | 3 |
| :white_check_mark: | Context caching | Brief TTL cache (~5s) to avoid redundant language service calls | 3 |
| :white_check_mark: | Graceful fallback | Omit context types not supported by the current language | 3 |

## Editor Capability Hints

| Status | Feature | Description | Phase |
|--------|---------|-------------|-------|
| :white_check_mark: | Capability detection | Probe which language providers are available for the current file | 3 |
| :white_check_mark: | Dynamic system prompt | Inject available editor capabilities into the LLM system prompt | 3 |
| :white_check_mark: | Tool-use: rename symbol | LLM can trigger project-wide rename via tool call | 3 |
| :white_check_mark: | Tool-use: apply code action | LLM can apply quick fixes / refactorings | 3 |
| :white_check_mark: | Tool-use: format document | LLM can trigger document formatting | 3 |
| :white_check_mark: | Tool-use: insert code | LLM can insert code at a specific position | 3 |
| :white_check_mark: | Tool-use: replace range | LLM can replace a code range | 3 |
| :construction: | Contextual code actions | Include available quick fixes at cursor in the prompt | 3 |
| :construction: | Diff preview | Show diff preview for user approval before destructive changes | 3 |
| :white_check_mark: | Language-aware advertising | Only advertise capabilities the current language actually supports | 3 |

## Settings & Configuration

| Status | Feature | Description | Phase |
|--------|---------|-------------|-------|
| :white_check_mark: | Typed settings wrapper | Type-safe access to extension configuration | 1 |
| :white_check_mark: | Preferred chat model | Default model for chat conversations | 1 |
| :white_check_mark: | Preferred completions model | Default model for inline completions | 2 |
| :white_check_mark: | Temperature setting | Configurable temperature for responses | 1 |
| :white_check_mark: | Max tokens setting | Configurable max tokens for responses | 1 |
| :white_check_mark: | Trigger mode setting | Auto / manual inline completion trigger | 2 |
| :white_check_mark: | Debounce delay setting | Configurable debounce for auto-trigger | 2 |

## Polish & UX

| Status | Feature | Description | Phase |
|--------|---------|-------------|-------|
| :construction: | Keyboard shortcuts | Configurable keybindings for common actions | 5 |
| :white_check_mark: | Command palette commands | Set API Key and New Chat accessible via command palette | 1 |
| :construction: | Error notifications | User-facing error messages and recovery hints | 5 |
| :construction: | Marketplace packaging | `.vsix` packaging, marketplace listing, README | 5 |
| :white_check_mark: | CSP enforcement | Content Security Policy on webview | 1 |
| :white_check_mark: | Activity bar icon | Custom icon for the chat side panel | 1 |

## Testing

| Status | Feature | Description | Phase |
|--------|---------|-------------|-------|
| :white_check_mark: | Unit tests | 85 tests across 12 test files covering all modules | 1-3 |
| :white_check_mark: | Visual regression | Browser-based screenshot testing at 3 viewports (desktop, tablet, mobile) | 1 |
| :white_check_mark: | Dev mode fallback | Standalone browser testing of webview without VSCode | 1 |
