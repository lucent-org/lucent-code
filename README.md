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
| Models | One vendor | Any model, any provider |

---

## Features

### 🔍 LSP-first code intelligence
Lucent Code reads your code the way VS Code does. Symbol definitions, type signatures, references, document structure, and live diagnostics are all pulled from your language server — giving the AI the same picture your editor has.

### 🔄 Any model, any provider
Use **OpenRouter** for breadth (500+ models including Claude, GPT-4o, Gemini, Mistral, Llama and more), **Anthropic natively** for the latest Claude features without a proxy hop, or **NVIDIA NIM** for direct GPU inference. Switch providers in one click from the model selector.

### 💬 Streaming chat panel
A fast, focused side-panel chat built for developers. Markdown rendering, syntax-highlighted code blocks, copy and insert buttons, and real-time streaming responses. Ask questions, get explanations, request changes — all without leaving your editor.

### ⚡ Inline completions
Ghost-text suggestions that appear as you type. Supports auto-trigger (debounced) and manual trigger (`Alt+\`). Respects `editor.inlineSuggest.enabled`.

### 🧩 Built-in skills
Slash commands that give the AI structured workflows: `/code-review`, `/refactor`, `/debugging`, `/tests`, `/doc`, `/commit`, `/onboard`, `/compact`. Load your own skills from GitHub, npm, or Claude Code.

### 🛠️ AI editor tools — with human approval
The AI can take direct actions in your editor: rename symbols, insert code, replace ranges, apply quick fixes, and format documents. Destructive operations show an inline approval card — you stay in control.

### 🌿 Git worktrees
Isolate AI sessions to a dedicated git worktree so your main workspace stays clean while the AI works.

### 🔌 MCP support
Connect external tools via the Model Context Protocol for extended capabilities.

### 📚 Conversation history
Conversations are saved locally and restored on reopen. Export as JSON or Markdown. Auto-generated titles keep your history organised.

### 📋 Context menu actions
Right-click any selection for **Explain**, **Fix**, or **Improve** — appended to the current chat or opened in a new one.

### 📄 Custom instructions
Drop a `.lucent-instructions.md` or `.cursorrules` file in your workspace root to inject project-specific context into every conversation.

---

## Getting started

1. Install Lucent Code from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=lucentcode.lucent-code)
2. Open the chat panel from the activity bar
3. Click the provider selector and choose your provider:
   - **OpenRouter** — get a free API key at [openrouter.ai](https://openrouter.ai)
   - **Anthropic** — get an API key at [console.anthropic.com](https://console.anthropic.com)
   - **NVIDIA NIM** — get an API key at [build.nvidia.com](https://build.nvidia.com)
4. Run `Lucent Code: Open Provider Settings` from the command palette and enter your key
5. Select a model and start chatting

---

## Keyboard shortcuts

| Action | Shortcut |
|---|---|
| Focus chat panel | `Ctrl+Shift+L` |
| New chat | `Ctrl+Shift+Alt+N` |
| Trigger inline completion | `Alt+\` |

---

## Requirements

- VS Code 1.85+
- An API key from one of the supported providers:
  - [OpenRouter](https://openrouter.ai) (free tier available, 500+ models)
  - [Anthropic](https://console.anthropic.com) (native Claude access)
  - [NVIDIA NIM](https://build.nvidia.com) (Nemotron and other NVIDIA models)

---

## Documentation

Full documentation at [docs.lucentcode.dev](https://docs.lucentcode.dev)

---

## Privacy

All requests go directly from your editor to your chosen provider's API. No telemetry, no data collection, no third-party servers beyond the provider you configure.
