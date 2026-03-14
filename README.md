# OpenRouter Chat for VSCode

A VSCode extension that brings the full [OpenRouter](https://openrouter.ai) model catalog into your editor — chat with any AI model and get inline code completions, powered by Claude, GPT, Gemini, Llama, and hundreds more.

## Features

### Chat Panel

A side panel chat interface in the activity bar, similar to GitHub Copilot Chat or Claude Chat.

- **Any model** — Access the full OpenRouter model catalog. Switch models mid-conversation.
- **Streaming responses** — Real-time token-by-token rendering.
- **Code blocks** — Syntax-highlighted code blocks with Copy and Insert at Cursor buttons.
- **Markdown** — Bold, italic, inline code, and code fences rendered in assistant messages.
- **Code context** — Automatically includes your active file, cursor position, selection, and diagnostics in prompts.
- **Code intelligence** — Enriches prompts with hover info, definitions, references, and document symbols from VSCode's language services.
- **Editor capability hints** — Tells the LLM what editor actions are available (rename, format, code actions) so it can suggest them.
- **Tool-use** — Models that support tool-use can invoke editor actions directly: rename symbols, apply code actions, format documents, insert or replace code.
- **Conversation history** — Conversations are saved locally and persist across restarts. Browse, load, and delete past conversations.
- **Auto-titling** — Conversations are automatically titled after the first exchange using a lightweight LLM call.
- **Export** — Export any conversation as JSON or Markdown.
- **Cancel generation** — Stop button to abort in-flight responses.

### Inline Completions

Copilot-like ghost text suggestions as you type.

- **Auto mode** — Suggestions appear after a configurable debounce (default 300ms).
- **Manual mode** — Trigger completions only with `Alt+\`.
- **Separate model** — Use a fast, cheap model for completions while keeping a powerful model for chat.
- **Windowed context** — Sends code before/after cursor within configurable token limits.
- **Status bar** — Shows a sparkle icon with loading state during completion requests.

## Getting Started

### Prerequisites

- VSCode 1.85.0 or later
- An [OpenRouter API key](https://openrouter.ai/keys)

### Installation (Development)

```bash
# Clone the repository
git clone <repo-url>
cd openrouter-chat

# Install dependencies
npm install
cd webview && npm install && cd ..

# Build
npm run build

# Launch in VSCode
# Press F5 to open Extension Development Host
```

### Setting Your API Key

On first launch, you'll be prompted to enter your OpenRouter API key. You can also set it anytime via:

- Command Palette (`Ctrl+Shift+P`) → **OpenRouter Chat: Set API Key**

Your API key is stored securely in VSCode's encrypted SecretStorage — never in plaintext settings.

## Configuration

All settings are under `openRouterChat.*` in VSCode settings.

### Chat Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `openRouterChat.chat.model` | `""` | Default model for chat (e.g., `anthropic/claude-sonnet-4`). Leave empty to select manually. |
| `openRouterChat.chat.temperature` | `0.7` | Temperature for chat responses (0-2). |
| `openRouterChat.chat.maxTokens` | `4096` | Maximum tokens for chat responses. |

### Inline Completion Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `openRouterChat.completions.model` | `""` | Model for inline completions. Leave empty to use the chat model. |
| `openRouterChat.completions.triggerMode` | `"auto"` | `"auto"` (suggest while typing) or `"manual"` (only via `Alt+\`). |
| `openRouterChat.completions.debounceMs` | `300` | Debounce delay in ms for auto-trigger mode (100-2000). |
| `openRouterChat.completions.maxContextLines` | `100` | Max lines before/after cursor to include as context (10-500). |

## Commands

| Command | Keybinding | Description |
|---------|------------|-------------|
| `OpenRouter Chat: Set API Key` | — | Set or update your OpenRouter API key |
| `OpenRouter Chat: New Chat` | — | Clear the current conversation |
| `OpenRouter Chat: Trigger Inline Completion` | `Alt+\` | Manually trigger an inline completion |

## Architecture

Modular monolith — single extension with clearly separated internal modules.

```
src/
├── extension.ts                # Entry point — wires all modules together
├── core/
│   ├── openrouter-client.ts    # OpenRouter API client (streaming + non-streaming)
│   ├── auth.ts                 # API key management via SecretStorage
│   ├── settings.ts             # Typed settings wrapper
│   └── context-builder.ts      # Gathers editor context for prompts
├── chat/
│   ├── chat-provider.ts        # WebviewViewProvider for the side panel
│   ├── message-handler.ts      # Extension ↔ webview message protocol
│   └── history.ts              # Conversation persistence (save/load/export)
├── completions/
│   ├── inline-provider.ts      # InlineCompletionItemProvider
│   ├── prompt-builder.ts       # Builds completion prompts with windowed context
│   └── trigger-config.ts       # Debounce and trigger mode logic
├── lsp/
│   ├── code-intelligence.ts    # VSCode language service wrappers (hover, definition, refs, symbols)
│   ├── capability-detector.ts  # Probes available language providers per file
│   └── editor-tools.ts         # Tool executor + OpenAI-compatible tool definitions
└── shared/
    └── types.ts                # Shared TypeScript interfaces

webview/                        # Solid.js chat UI (separate Vite build)
├── src/
│   ├── App.tsx                 # Root component with message handling
│   ├── components/
│   │   ├── ChatMessage.tsx     # Message rendering with code block parsing
│   │   ├── ChatInput.tsx       # Input area with send/stop buttons
│   │   ├── ModelSelector.tsx   # Searchable model dropdown
│   │   └── CodeBlock.tsx       # Code blocks with copy/insert actions
│   ├── stores/
│   │   ├── chat.ts             # Reactive chat state (Solid signals)
│   │   └── settings.ts         # Theme settings
│   └── utils/
│       ├── vscode-api.ts       # VSCode API bridge (with dev fallback)
│       └── markdown.ts         # Simple markdown rendering
└── vite.config.ts              # Vite build → dist/webview/
```

### Build Pipeline

- **esbuild** bundles the extension host (`src/` → `dist/extension.js`)
- **Vite** builds the Solid.js webview (`webview/src/` → `dist/webview/`)

```bash
npm run build          # Build everything
npm run dev            # Watch mode (extension + webview)
npm run test           # Run all tests
npm run test:watch     # Watch mode for tests
```

## Testing

100 tests across 13 test files covering all modules:

```bash
npm test
```

| Module | Tests | What's covered |
|--------|-------|----------------|
| Settings | 7 | All config accessors (chat + completions) |
| Auth | 8 | Key storage, prompting, cancellation, OAuth PKCE |
| OpenRouter Client | 10 | Model listing, chat, streaming, SSE parsing, errors |
| Context Builder | 10 | Editor context, selection, formatting, enriched prompts, diagnostics |
| Markdown Utils | 10 | HTML escaping, markdown rendering, XSS prevention |
| Message Handler | 14 | All message types, streaming, cancellation, history, persistence |
| Conversation History | 8 | Create, save, load, list, delete, export JSON/Markdown |
| Trigger Config | 5 | Debounce, manual mode, abort signals |
| Prompt Builder | 6 | Context windowing, cursor splitting, message building |
| Inline Provider | 4 | Completions, model selection, error handling |
| Code Intelligence | 8 | Hover, definition, diagnostics, symbols, caching |
| Capability Detector | 4 | Provider probing, prompt formatting, fallbacks |
| Editor Tools | 6 | All 5 tools, unknown tool handling, error propagation |

## Roadmap

See [docs/features.md](docs/features.md) for the full feature inventory with implementation status.

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 — MVP | Done | Chat panel, streaming, auth, code context, model selection |
| Phase 2 — Inline Completions | Done | Ghost text, auto/manual triggers, debounce |
| Phase 3 — Code Intelligence | Done | LSP integration, editor capability hints, tool-use |
| Phase 4 — Auth & Persistence | Done | OAuth structure, conversation history, auto-titling, export |
| Phase 5 — Polish | Planned | Keyboard shortcuts, error UX, marketplace packaging |

## License

MIT
