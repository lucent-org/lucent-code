# OpenRouter Chat — Feature Inventory

Complete feature list for the OpenRouter Chat VSCode extension. Features are grouped by module and tagged with the phase in which they are planned for delivery.

**Legend:** :white_check_mark: = Implemented | :construction: = Planned | :warning: = Needs Fix

---

## Chat Panel

| Status | Feature | Description | Phase |
|--------|---------|-------------|-------|
| :white_check_mark: | Side panel chat UI | Solid.js webview in the activity bar side panel | 1 |
| :white_check_mark: | Streaming responses | Real-time token-by-token response rendering via SSE | 1 |
| :white_check_mark: | Markdown rendering | Full Markdown support: headings (h1–h4), lists, bold, italic, inline code, fenced code blocks | 1 |
| :white_check_mark: | Syntax-highlighted code blocks | Code blocks with language-aware syntax highlighting | 1 |
| :white_check_mark: | Copy code button | One-click copy on code blocks | 1 |
| :white_check_mark: | Insert at cursor | Insert code block content at the current editor cursor | 1 |
| :white_check_mark: | Apply to file | Apply code block as a WorkspaceEdit to the referenced or user-selected file; inline diff for ≤1 hunk, native diff editor for 2+ hunks | 1 |
| :white_check_mark: | Cancel generation | Stop button to abort in-flight streaming responses | 1 |
| :white_check_mark: | Multi-line input | Shift+Enter for newlines, Enter to submit | 1 |
| :white_check_mark: | `@terminal` context mention | Type `@terminal` in chat input to inject the last 200 lines of the active terminal | 2 |
| :white_check_mark: | `@fix` / `@explain` action mentions | Type `@fix` or `@explain` to insert a focused prompt prefix; works with the existing editor context | 2 |
| :white_check_mark: | `@file` mention | Type `@file` to fuzzy-search and attach any workspace file as context (≤5 MB, text files only) | - |
| :white_check_mark: | File attachments (paperclip button) | Click 📎 to pick images or text files; up to 5 MB per file | P3 |
| :white_check_mark: | File attachments (drag-and-drop) | Drag files from Explorer or OS onto the chat input area | P3 |
| :white_check_mark: | Empty state guidance | Welcome screen with API key hint or quick-start suggestions | 1 |
| :white_check_mark: | Conversation history | Persist conversations locally, restore on reopen | 4 |
| :white_check_mark: | Auto-title conversations | Generate conversation titles via a lightweight LLM call | 4 |
| :white_check_mark: | Export conversations | Export as JSON or Markdown | 4 |
| :white_check_mark: | Import conversations | Import conversations from JSON | 4 |

## Model Selection

| Status | Feature | Description | Phase |
|--------|---------|-------------|-------|
| :white_check_mark: | Full model catalog | Fetch and display all available models from OpenRouter API | 1 |
| :white_check_mark: | Model selector dropdown | Choose model from dropdown with search, shows name + provider | 1 |
| :white_check_mark: | Separate chat model setting | Configurable default model for chat | 1 |
| :white_check_mark: | Separate completions model setting | Configurable default model for inline completions | 2 |
| :white_check_mark: | `use_model` tool | AI can switch to a different OpenRouter model mid-conversation (scoped approval: once / workspace / always) | - |
| :white_check_mark: | `@model` mention | Type `@model` in the chat input to open a fuzzy-search model picker and switch instantly — no approval needed | - |

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
| :white_check_mark: | Global kill switch | Respects `editor.inlineSuggest.enabled` | 2 |

## Authentication

| Status | Feature | Description | Phase |
|--------|---------|-------------|-------|
| :white_check_mark: | API key auth | Store API key in VSCode SecretStorage (encrypted) | 1 |
| :white_check_mark: | Auth prompt on activation | Prompt for credentials if none found on startup | 1 |
| :white_check_mark: | OAuth flow | Browser-based login via OpenRouter OAuth with proper PKCE (SHA-256) | 4 |
| :white_check_mark: | Token management | Secure token storage, refresh, and revocation | 4 |
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
| :white_check_mark: | Grep fallback | Search file contents via regex when LSP returns no results or language has no server | 3 |
| :white_check_mark: | Glob fallback | Find files by pattern when LSP cannot enumerate files | 3 |

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
| :white_check_mark: | Contextual code actions | Include available quick fixes at cursor in the prompt | 3 |
| :white_check_mark: | Diff preview | Show diff preview for user approval before destructive changes | 3 |
| :white_check_mark: | Tool-use: search web | LLM can search the web via DuckDuckGo (no API key required) | - |
| :white_check_mark: | Tool-use: fetch URL | LLM can fetch any URL as Markdown via Jina AI reader (no API key required) | - |
| :white_check_mark: | Tool-use: HTTP request | LLM can make GET/POST/PUT/DELETE requests to local or remote APIs | - |
| :white_check_mark: | HITL tool approval | Destructive editor tool calls and all MCP tool calls show inline approval card; user allows or denies | - |
| :white_check_mark: | Autonomous mode | `⚡` toolbar toggle (per-session) + `lucentCode.chat.autonomousMode` setting (persistent default) bypass all approval gates | - |
| :white_check_mark: | Large output offloading | Tool results over 8,000 chars are truncated; full result saved to tmpfile | - |
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
| :white_check_mark: | Autonomous mode setting | `lucentCode.chat.autonomousMode` — when true all tool calls run without approval | - |

## MCP (Model Context Protocol)

| Status | Feature | Description | Phase |
|--------|---------|-------------|-------|
| :white_check_mark: | Three-tier config loading | Reads `mcpServers` from `~/.claude/settings.json` → `~/.lucentcode/settings.json` → `<workspace>/.mcp.json`; later files win on name collisions | - |
| :white_check_mark: | Stdio subprocess transport | Each configured MCP server is spawned as a stdio subprocess via `@modelcontextprotocol/sdk` `StdioClientTransport` | - |
| :white_check_mark: | Namespaced tool merging | MCP tools namespaced as `mcp__serverName__toolName` and merged into every OpenRouter API call | - |
| :white_check_mark: | MCP tool call routing | `mcp__`-prefixed tool calls are routed to `McpClientManager.callTool()` instead of the editor tools handler | - |
| :white_check_mark: | MCP tool approval gate | All MCP tool calls require HITL approval unless autonomous mode is enabled | - |
| :white_check_mark: | Server status chip | Webview toolbar receives `mcpStatus` on activation showing connected/error state per server | - |
| :white_check_mark: | `.mcp.json` file watcher | Changes to the workspace `.mcp.json` trigger a full MCP server reconnect | - |
| :white_check_mark: | Error isolation | Failed servers are marked `error`, their tools excluded; a `callTool` failure returns `isError: true` to the model | - |


## Skill Sets

| Status | Feature | Description | Phase |
|--------|---------|-------------|-------|
| :white_check_mark: | `LUCENT.md` project instructions | Place `LUCENT.md` (or `.clinerules`/`.cursorrules`/`CLAUDE.md`) in your workspace root; `@skill(name)` lines activate skills | - |
| :white_check_mark: | Built-in skill pack | 10 language-agnostic skills shipped with the extension: `tdd`, `clean-commits`, `refactor`, `debugging`, `code-review`, `documentation`, `doc`, `tests`, `commit`, `onboard` | - |
| :white_check_mark: | `/compact` command | Summarize and truncate conversation history to free context window; visual divider marks the compaction point | - |
| :white_check_mark: | Claude Code skill adapter | Auto-loads skills from `~/.claude/skills/*/SKILL.md` — same format as Lucent | - |
| :white_check_mark: | Claude Code skill cache | Auto-loads skills from ~/.claude/plugins/cache/ | - |
| :white_check_mark: | GitHub repo source | Fetch skills from any public GitHub repository | - |
| :white_check_mark: | npm/unpkg source | Fetch skills from npm packages via unpkg.com | - |
| :white_check_mark: | Superpowers marketplace | Fetch versioned skill packs from the superpowers registry | - |
| :white_check_mark: | Local directory source | Load skills from a local directory | - |
| :white_check_mark: | Pull-only skill loading | System prompt lists available skills (name + description only); content loaded on-demand via `use_skill` — no context bloat | - |
| :white_check_mark: | use_skill tool | Model can explicitly request a skill's full content via tool call | - |
| :white_check_mark: | Slash command autocomplete | Type /skill-name to select and attach a skill chip | - |
| :white_check_mark: | Skill browser | ⚡ button + browseSkills command opens quick pick of all loaded skills | - |
| :white_check_mark: | Add/refresh commands | addSkillSource wizard and refreshSkills command | - |

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
| :white_check_mark: | Unit tests | 255 tests across 25 test files covering all modules | 1-5 |
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
| :white_check_mark: | ~~Retry with backoff~~ | Fixed — exponential backoff with ±20% jitter for 429/5xx, Retry-After header support, AbortSignal propagation | Review |
| :white_check_mark: | ~~inlineSuggest kill switch~~ | Fixed — guard clause checks `editor.inlineSuggest.enabled === false` before any API call | Review |
| :white_check_mark: | ~~Enriched context on ready~~ | Fixed — `ready` handler calls `buildEnrichedContext()` with fallback to `buildContext()` | Review |
| :white_check_mark: | ~~Type duplication~~ | Fixed — `@shared` path alias unifies ChatMessage, ConversationSummary, Model across extension and webview | Review |
| :white_check_mark: | ~~Idiomatic scroll-to-bottom~~ | Fixed — `createEffect` watches the messages signal and scrolls to bottom reactively | Review |
| :white_check_mark: | ~~deactivate cleanup~~ | Fixed — `abort()` method on `MessageHandler`, called from `deactivate()` via module-scope reference | Review |

---

## Prioritized Backlog

All remaining work, ranked by impact vs effort. Items at the top should be picked next.

### P1 — Next (high value, low effort)

| Status | Feature | Why now | Effort |
|--------|---------|---------|--------|
| :white_check_mark: | ~~Apply to file~~ | Fixed — Apply button on code blocks; inline diff for ≤1 hunk, native diff editor for 2+ hunks | S |
| :white_check_mark: | ~~Diff preview & approval~~ | Fixed — inline DiffView with Apply/Discard; native diff + notification for multi-hunk changes | S |
| :white_check_mark: | ~~Context menu actions~~ | Fixed — Explain/Fix/Improve submenus on selected code, append or new chat | S |
| :white_check_mark: | ~~Custom instructions file~~ | Fixed — loads `LUCENT.md` (or `.clinerules`/`.cursorrules`/`CLAUDE.md` fallbacks) from workspace root into system prompt | S |
| :white_check_mark: | ~~Enriched context on `ready`~~ | Fixed — `ready` calls `buildEnrichedContext()` with fallback to `buildContext()` | XS |
| :white_check_mark: | ~~inlineSuggest kill switch~~ | Fixed — guard clause respects `editor.inlineSuggest.enabled` | XS |
| :white_check_mark: | ~~Retry with backoff~~ | Fixed — exponential backoff with jitter, Retry-After, AbortSignal | XS |
| :white_check_mark: | ~~deactivate cleanup~~ | Fixed — `abort()` on MessageHandler called from `deactivate()` | XS |

### P2 — Soon (good value, moderate effort)

| Status | Feature | Why | Effort |
|--------|---------|-----|--------|
| :white_check_mark: | **Import conversations** | Completes the export/import pair — export already ships | S |
| :white_check_mark: | **OAuth token management** | Refresh + revocation needed for the OAuth flow to be production-ready | M |
| :white_check_mark: | **Generate commit message** | AI-generated commit message from staged diff via SCM context menu — very practical daily use | M |
| :white_check_mark: | **Task completion notification** | VSCode notification (+ optional sound) when a long streaming response finishes | XS |
| :white_check_mark: | **Add terminal output to context** | `>_` button adds terminal output as a removable chip; prepended as `<terminal output>` XML on send | S |
| :white_check_mark: | **Contextual code actions** | Include available quick-fix actions at cursor in the prompt so the LLM can suggest applying them | M |
| :white_check_mark: | **Premium web search** | Optional Tavily API key in settings for higher-quality search results than DuckDuckGo | XS |
| :white_check_mark: | **Idiomatic scroll-to-bottom** | Replace imperative DOM calls with Solid.js `createEffect` watching messages | XS |
| :white_check_mark: | **Type duplication** | Unify `ChatMessage`, `ConversationSummary`, `Model` across extension and webview | S |

### P3 — Later (higher effort or lower urgency)

| Status | Feature | Why | Effort |
|--------|---------|-----|--------|
| :white_check_mark: | ~~Image attachments~~ | Attach images via drag-and-drop or paperclip button; thumbnails shown in chat history; sent as base64 content parts to vision models | M |
| :white_check_mark: | ~~Drag-and-drop files~~ | Drop files onto chat input; images become thumbnails, text/code files are inlined as fenced code blocks | M |
| :white_check_mark: | ~~Slash commands~~ | `/` dropdown with built-in and loaded skills; `/compact` truncates history; `@fix`, `@explain` quick-action mentions; `@file` workspace file picker | M |
| :construction: | **Custom OpenAI-compatible providers** | Ollama, LM Studio, Azure OpenAI alongside OpenRouter — opens up local models | L |

### P4 — Future / exploratory (large scope)

| Status | Feature | Why | Effort |
|--------|---------|-----|--------|
| :white_check_mark: | ~~Multiple chat sessions~~ | Session strip: tab row (≥400px) or dropdown (<400px) showing last 5 conversations; switches active conversation | XL |
| :white_check_mark: | ~~MCP server integration~~ | Implemented — three-tier config, stdio subprocess spawning, namespaced tool merging, approval gate, autonomous mode bypass | XL |
| :white_check_mark: | **Git worktree isolation** | Per-session isolated worktree branch for safe agentic edits; merge/PR/discard quick-pick at session end | L |
| :construction: | **Semantic codebase search** | Vector-index workspace for meaning-based retrieval — needs embedding pipeline | XL |
