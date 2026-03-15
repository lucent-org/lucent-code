# OpenRouter Chat — Feature Inventory

Complete feature list for the OpenRouter Chat VSCode extension. Features are grouped by module and tagged with the phase in which they are planned for delivery.

**Legend:** :white_check_mark: = Implemented | :construction: = Planned | :warning: = Needs Fix

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
| :white_check_mark: | Apply to file | Apply code block as a WorkspaceEdit to the referenced or user-selected file; inline diff for ≤1 hunk, native diff editor for 2+ hunks | 1 |
| :white_check_mark: | Cancel generation | Stop button to abort in-flight streaming responses | 1 |
| :white_check_mark: | Multi-line input | Shift+Enter for newlines, Enter to submit | 1 |
| :white_check_mark: | Empty state guidance | Welcome screen with API key hint or quick-start suggestions | 1 |
| :white_check_mark: | Conversation history | Persist conversations locally, restore on reopen | 4 |
| :white_check_mark: | Auto-title conversations | Generate conversation titles via a lightweight LLM call | 4 |
| :white_check_mark: | Export conversations | Export as JSON or Markdown | 4 |
| :construction: | Import conversations | Import conversations from JSON | 4 |

## Model Selection

| Status | Feature | Description | Phase |
|--------|---------|-------------|-------|
| :white_check_mark: | Full model catalog | Fetch and display all available models from OpenRouter API | 1 |
| :white_check_mark: | Model selector dropdown | Choose model from dropdown with search, shows name + provider | 1 |
| :white_check_mark: | Separate chat model setting | Configurable default model for chat | 1 |
| :white_check_mark: | Separate completions model setting | Configurable default model for inline completions | 2 |

## Inline Completions

| Status | Feature | Description | Phase |
|--------|---------|-------------|-------|
| :white_check_mark: | Ghost text suggestions | Inline completion items rendered as ghost text | 2 |
| :white_check_mark: | Automatic trigger mode | Suggestions appear after a debounce while typing | 2 |
| :white_check_mark: | Manual trigger mode | Suggestions only on keybinding (default: `Alt+\`) | 2 |
| :white_check_mark: | Configurable trigger mode | Setting to switch between auto and manual | 2 |
| :white_check_mark: | Configurable debounce | Setting to adjust auto-trigger delay (default 300ms) | 2 |
| :white_check_mark: | Request cancellation | Cancel in-flight completions when user keeps typing | 2 |
| :white_check_mark: | Windowed file context | Send code before/after cursor within token limits | 2 |
| :construction: | Global kill switch | Respects `editor.inlineSuggest.enabled` | 2 |

## Authentication

| Status | Feature | Description | Phase |
|--------|---------|-------------|-------|
| :white_check_mark: | API key auth | Store API key in VSCode SecretStorage (encrypted) | 1 |
| :white_check_mark: | Auth prompt on activation | Prompt for credentials if none found on startup | 1 |
| :white_check_mark: | OAuth flow | Browser-based login via OpenRouter OAuth with proper PKCE (SHA-256) | 4 |
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
| :white_check_mark: | Tool-use: rename symbol | Programmatic rename via `executeDocumentRenameProvider` + `applyEdit` | 3 |
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
| :white_check_mark: | Keyboard shortcuts | Ctrl+Shift+N (new chat), Ctrl+Shift+L (focus chat), Alt+\ (completion) | 5 |
| :white_check_mark: | Command palette commands | Set API Key and New Chat accessible via command palette | 1 |
| :white_check_mark: | Error notifications | Contextual errors with recovery actions (Set API Key, Retry) | 5 |
| :white_check_mark: | Marketplace packaging | Icon, CHANGELOG, marketplace metadata, README | 5 |
| :white_check_mark: | CSP enforcement | Content Security Policy on webview | 1 |
| :white_check_mark: | Activity bar icon | Custom icon for the chat side panel | 1 |

## Testing

| Status | Feature | Description | Phase |
|--------|---------|-------------|-------|
| :white_check_mark: | Unit tests | 132 tests across 15 test files covering all modules | 1-5 |
| :white_check_mark: | Visual regression | Browser-based screenshot testing at 3 viewports (desktop, tablet, mobile) | 1 |
| :white_check_mark: | Dev mode fallback | Standalone browser testing of webview without VSCode | 1 |

## Backlog — Code Review Findings

### Critical (Security)

| Status | Issue | Description | Source |
|--------|-------|-------------|--------|
| :white_check_mark: | ~~XSS via innerHTML~~ | Fixed — DOMPurify sanitizes all innerHTML with strict tag allowlist | Review |
| :white_check_mark: | ~~OAuth PKCE broken~~ | Fixed — proper SHA-256 challenge, state persistence, callback handler | Review |
| :white_check_mark: | ~~Path traversal in history~~ | Fixed — ID sanitization + resolved path validation | Review |

### Important

| Status | Issue | Description | Source |
|--------|-------|-------------|--------|
| :white_check_mark: | ~~Tool-use not wired~~ | Fixed — agentic loop passes TOOL_DEFINITIONS, accumulates streamed tool_calls, executes tools, feeds results back (5-iteration cap) | Review |
| :white_check_mark: | ~~Monkey-patched resolveWebviewView~~ | Fixed — `onResolve?: () => void` callback on `ChatViewProvider`, set before registration | Review |
| :white_check_mark: | ~~Sync fs in async history~~ | Fixed — all method bodies use `fs.promises.*`; constructor `mkdirSync` retained | Review |
| :white_check_mark: | ~~Unbounded LSP cache~~ | Fixed — capped at 100 entries with LRU eviction (Map insertion-order) | Review |
| :white_check_mark: | ~~NotificationService per-error~~ | Fixed — injected via `MessageHandler` constructor with singleton in `extension.ts` | Review |
| :white_check_mark: | ~~CSS filename mismatch~~ | Fixed — `chat-provider.ts` now references `index.css` (actual Vite build output) | Review |
| :white_check_mark: | ~~rename_symbol broken~~ | Fixed — uses `vscode.executeDocumentRenameProvider` to get a `WorkspaceEdit` and applies it | Review |

### Suggestions (resolved with next priorities)

| Status | Issue | Description | Source |
|--------|-------|-------------|--------|
| :construction: | Retry with backoff | Design doc specifies exponential backoff for 429/5xx — not implemented | Review |
| :construction: | inlineSuggest kill switch | Inline provider should check `editor.inlineSuggest.enabled` before API calls | Review |
| :construction: | Enriched context on ready | `ready` handler sends basic `buildContext()` instead of `buildEnrichedContext()` | Review |
| :construction: | Type duplication | ChatMessage, ConversationSummary, Model defined in both extension and webview | Review |
| :construction: | Idiomatic scroll-to-bottom | Use Solid.js `createEffect` watching messages instead of imperative calls | Review |
| :construction: | deactivate cleanup | Empty `deactivate()` — should abort in-flight requests and clean up | Review |

---

## Prioritized Backlog

All remaining work, ranked by impact vs effort. Items at the top should be picked next.

### P1 — Next (high value, low effort)

| Status | Feature | Why now | Effort |
|--------|---------|---------|--------|
| :white_check_mark: | ~~Apply to file~~ | Fixed — Apply button on code blocks; inline diff for ≤1 hunk, native diff editor for 2+ hunks | S |
| :white_check_mark: | ~~Diff preview & approval~~ | Fixed — inline DiffView with Apply/Discard; native diff + notification for multi-hunk changes | S |
| :white_check_mark: | ~~Context menu actions~~ | Fixed — Explain/Fix/Improve submenus on selected code, append or new chat | S |
| :white_check_mark: | ~~Custom instructions file~~ | Fixed — loads .openrouter-instructions.md or .cursorrules from workspace root into system prompt | S |
| :construction: | **Enriched context on `ready`** | One-line fix: `ready` sends `buildContext()` instead of `buildEnrichedContext()` — the rich LSP context is silently dropped on panel open | XS |
| :construction: | **inlineSuggest kill switch** | Inline provider should respect `editor.inlineSuggest.enabled` — one guard clause | XS |
| :construction: | **Retry with backoff** | Exponential backoff for 429/5xx — prevents hard failures on transient rate limits | XS |
| :construction: | **deactivate cleanup** | Abort in-flight requests and dispose resources on extension deactivate | XS |

### P2 — Soon (good value, moderate effort)

| Status | Feature | Why | Effort |
|--------|---------|-----|--------|
| :construction: | **Import conversations** | Completes the export/import pair — export already ships | S |
| :construction: | **OAuth token management** | Refresh + revocation needed for the OAuth flow to be production-ready | M |
| :construction: | **Generate commit message** | AI-generated commit message from staged diff via SCM context menu — very practical daily use | M |
| :construction: | **Task completion notification** | VSCode notification (+ optional sound) when a long streaming response finishes | XS |
| :construction: | **Add terminal output to context** | Button to include current terminal output in the next message — essential for debugging loops | S |
| :construction: | **Contextual code actions** | Include available quick-fix actions at cursor in the prompt so the LLM can suggest applying them | M |
| :construction: | **Idiomatic scroll-to-bottom** | Replace imperative DOM calls with Solid.js `createEffect` watching messages | XS |
| :construction: | **Type duplication** | Unify `ChatMessage`, `ConversationSummary`, `Model` across extension and webview | S |

### P3 — Later (higher effort or lower urgency)

| Status | Feature | Why | Effort |
|--------|---------|-----|--------|
| :construction: | **Image attachments** | Attach screenshots/diagrams to chat for multi-modal models — increasingly expected | M |
| :construction: | **Drag-and-drop files** | Drag files from Explorer into chat input to attach or inline their contents | M |
| :construction: | **Slash commands** | `/fix`, `/explain`, `/test` in chat input — good UX, not a blocker | M |
| :construction: | **Custom OpenAI-compatible providers** | Ollama, LM Studio, Azure OpenAI alongside OpenRouter — opens up local models | L |

### P4 — Future / exploratory (large scope)

| Status | Feature | Why | Effort |
|--------|---------|-----|--------|
| :construction: | **Multiple chat sessions** | Parallel tabbed conversations — significant UI overhaul | XL |
| :construction: | **MCP server integration** | Register and invoke MCP servers — major extensibility surface | XL |
| :construction: | **Git worktree isolation** | Per-session isolated worktree branch for safe agentic edits | L |
| :construction: | **Semantic codebase search** | Vector-index workspace for meaning-based retrieval — needs embedding pipeline | XL |
