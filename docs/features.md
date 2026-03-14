# OpenRouter Chat — Feature Inventory

Complete feature list for the OpenRouter Chat VSCode extension. Features are grouped by module and tagged with the phase in which they are planned for delivery.

---

## Chat Panel

| Feature | Description | Phase |
|---------|-------------|-------|
| Side panel chat UI | Solid.js webview in the activity bar side panel | 1 |
| Streaming responses | Real-time token-by-token response rendering via SSE | 1 |
| Markdown rendering | Full Markdown support in assistant messages | 1 |
| Syntax-highlighted code blocks | Code blocks with language-aware syntax highlighting | 1 |
| Copy code button | One-click copy on code blocks | 1 |
| Insert at cursor | Insert code block content at the current editor cursor | 1 |
| Apply to file | Apply code block as an edit to the referenced file | 1 |
| Cancel generation | Stop button to abort in-flight streaming responses | 1 |
| Multi-line input | Shift+Enter for newlines, Enter to submit | 1 |
| Conversation history | Persist conversations locally, restore on reopen | 4 |
| Auto-title conversations | Generate conversation titles via a lightweight LLM call | 4 |
| Export conversations | Export as JSON or Markdown | 4 |
| Import conversations | Import conversations from JSON | 4 |

## Model Selection

| Feature | Description | Phase |
|---------|-------------|-------|
| Full model catalog | Fetch and display all available models from OpenRouter API | 1 |
| Model selector dropdown | Choose model from dropdown, shows name + provider | 1 |
| Separate chat model setting | Configurable default model for chat | 1 |
| Separate completions model setting | Configurable default model for inline completions | 2 |

## Inline Completions

| Feature | Description | Phase |
|---------|-------------|-------|
| Ghost text suggestions | Inline completion items rendered as ghost text | 2 |
| Automatic trigger mode | Suggestions appear after a debounce while typing | 2 |
| Manual trigger mode | Suggestions only on keybinding (default: `Alt+\`) | 2 |
| Configurable trigger mode | Setting to switch between auto and manual | 2 |
| Configurable debounce | Setting to adjust auto-trigger delay (default 300ms) | 2 |
| Request cancellation | Cancel in-flight completions when user keeps typing | 2 |
| Windowed file context | Send code before/after cursor within token limits | 2 |
| Global kill switch | Respects `editor.inlineSuggest.enabled` | 2 |

## Authentication

| Feature | Description | Phase |
|---------|-------------|-------|
| API key auth | Store API key in VSCode SecretStorage (encrypted) | 1 |
| Auth prompt on activation | Prompt for credentials if none found on startup | 1 |
| OAuth flow | Browser-based login via OpenRouter OAuth | 4 |
| Token management | Secure token storage, refresh, and revocation | 4 |
| Auth state events | EventEmitter for login/logout so modules can react | 1 |

## Code Intelligence (LSP Integration)

| Feature | Description | Phase |
|---------|-------------|-------|
| Current file context | Include active file content + cursor position in prompts | 1 |
| Selection context | Include selected text in prompts | 1 |
| Open editors context | Include open tab file paths + languages | 1 |
| Diagnostics context | Include current file errors/warnings in prompts | 3 |
| Definition resolution | Resolve symbol definitions via `executeDefinitionProvider` | 3 |
| Type definition resolution | Resolve type signatures via `executeTypeDefinitionProvider` | 3 |
| Hover info | Get type info + docs via `executeHoverProvider` | 3 |
| Reference lookup | Find symbol usages via `executeReferenceProvider` | 3 |
| Document symbols | Get file structure via `executeDocumentSymbolProvider` | 3 |
| Context caching | Brief TTL cache (~5s) to avoid redundant language service calls | 3 |
| Graceful fallback | Omit context types not supported by the current language | 3 |

## Editor Capability Hints

| Feature | Description | Phase |
|---------|-------------|-------|
| Capability detection | Probe which language providers are available for the current file | 3 |
| Dynamic system prompt | Inject available editor capabilities into the LLM system prompt | 3 |
| Tool-use: rename symbol | LLM can trigger project-wide rename via tool call | 3 |
| Tool-use: apply code action | LLM can apply quick fixes / refactorings | 3 |
| Tool-use: format document | LLM can trigger document formatting | 3 |
| Tool-use: insert code | LLM can insert code at a specific position | 3 |
| Tool-use: replace range | LLM can replace a code range | 3 |
| Contextual code actions | Include available quick fixes at cursor in the prompt | 3 |
| Diff preview | Show diff preview for user approval before destructive changes | 3 |
| Language-aware advertising | Only advertise capabilities the current language actually supports | 3 |

## Settings & Configuration

| Feature | Description | Phase |
|---------|-------------|-------|
| Typed settings wrapper | Type-safe access to extension configuration | 1 |
| Preferred chat model | Default model for chat conversations | 1 |
| Preferred completions model | Default model for inline completions | 2 |
| Temperature setting | Configurable temperature for responses | 1 |
| Max tokens setting | Configurable max tokens for responses | 1 |
| Trigger mode setting | Auto / manual inline completion trigger | 2 |
| Debounce delay setting | Configurable debounce for auto-trigger | 2 |

## Polish & UX

| Feature | Description | Phase |
|---------|-------------|-------|
| Keyboard shortcuts | Configurable keybindings for common actions | 5 |
| Command palette commands | All major actions accessible via command palette | 5 |
| Error notifications | User-facing error messages and recovery hints | 5 |
| Marketplace packaging | `.vsix` packaging, marketplace listing, README | 5 |
| CSP enforcement | Content Security Policy on webview | 1 |
| Activity bar icon | Custom icon for the chat side panel | 1 |
