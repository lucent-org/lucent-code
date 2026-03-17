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
| Models | One vendor | Any model via OpenRouter |

---

## Features

### 🔍 LSP-first code intelligence
Lucent Code reads your code the way VS Code does. Symbol definitions, type signatures, references, document structure, and live diagnostics are all pulled from your language server — giving the AI the same picture your editor has.

### 💬 Streaming chat panel
A fast, focused side-panel chat built for developers. Markdown rendering, syntax-highlighted code blocks, copy and insert buttons, and real-time streaming responses. Ask questions, get explanations, request changes — all without leaving your editor.

### ⚡ Inline completions
Ghost-text suggestions that appear as you type. Supports auto-trigger (debounced) and manual trigger (`Alt+\`). Respects `editor.inlineSuggest.enabled`. Works with any model on OpenRouter.

### 🛠️ AI editor tools — with human approval
The AI can take direct actions in your editor: rename symbols, insert code, replace ranges, apply quick fixes, and format documents. Destructive operations show an inline approval card — you stay in control.

### 🌐 Web and network tools
The AI can search the web, fetch URLs as clean Markdown, and make HTTP requests to local or remote APIs — no extra API keys required.

### 🔄 Any model, via OpenRouter
Access every major AI model — Claude, GPT-4o, Gemini, Mistral, Llama, and more — through a single OpenRouter API key. Switch models per conversation. No vendor lock-in.

### 📚 Conversation history
Conversations are saved locally and restored on reopen. Export as JSON or Markdown. Import from JSON. Auto-generated titles keep your history organised.

### 📋 Context menu actions
Right-click any selection for **Explain**, **Fix**, or **Improve** — appended to the current chat or opened in a new one.

### 📄 Custom instructions
Drop a `.lucent-instructions.md` or `.cursorrules` file in your workspace root to inject project-specific context into every conversation.

---

## Getting started

1. Install Lucent Code
2. Get a free API key at [openrouter.ai](https://openrouter.ai)
3. Run `Lucent Code: Set API Key` from the command palette
4. Open the chat panel from the activity bar
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
- An [OpenRouter](https://openrouter.ai) API key (free tier available)

---

## Privacy

All requests go directly from your editor to OpenRouter's API. No telemetry, no data collection, no third-party servers beyond OpenRouter and the model provider you choose.
