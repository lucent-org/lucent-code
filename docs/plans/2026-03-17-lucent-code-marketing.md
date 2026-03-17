# Lucent Code — Full Marketing Story

**Date:** 2026-03-17
**Status:** Approved

---

## Brand Identity

**Name:** Lucent Code
**Tagline:** *Write code in a new light.*
**Publisher:** lucentcode
**Extension ID:** lucentcode.lucent-code
**Category:** AI
**Banner:** `#0d0d1a` (dark) — visually unique in the AI category

---

## Positioning Statement

> Most AI coding tools search your files like grep does — they read text, not code.
> Lucent Code uses your language server. It understands symbols, types, references, and definitions exactly the way VS Code does.
> That's the difference between an assistant that guesses and one that actually knows.

---

## Marketplace Short Description (≤120 chars)

```
The only VS Code AI that uses your language server — not text search. Chat, completions, and code intelligence in one.
```

---

## Marketplace Long Description (README)

```markdown
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
The AI can take direct actions in your editor: rename symbols, insert code, replace ranges, apply quick fixes, and format documents. Destructive operations (rename, insert, replace) show an inline approval card — you stay in control.

### 🌐 Web and network tools
The AI can search the web, fetch URLs as clean Markdown, and make HTTP requests to local or remote APIs — no API keys required for web search or URL fetching.

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
| New chat | `Ctrl+Shift+N` |
| Trigger inline completion | `Alt+\` |

---

## Requirements

- VS Code 1.85+
- An [OpenRouter](https://openrouter.ai) API key (free tier available)

---

## Privacy

All requests go directly from your editor to OpenRouter's API. No telemetry, no data collection, no third-party servers beyond OpenRouter and the model provider you choose.
```

---

## Tags

```
ai, chat, lsp, code-intelligence, completions, openrouter,
inline-completions, semantic, all-in-one, chat-assistant,
copilot-alternative, code-assistant, language-server
```

---

## Icon Brief

**Concept:** A glowing light source — clean, minimal, bright against dark.

**Options (pick one for implementation):**
1. **Beam** — a single diagonal light beam cutting through darkness, subtle spectrum edge
2. **Glow** — a soft radiant point of light, like a star or lens flare, centered on dark bg
3. **Ray burst** — multiple thin rays emanating from a central point, 4–8 rays, asymmetric

**Colours:**
- Background: `#0d0d1a` (matches banner)
- Light: white core fading to `#a78bfa` (violet) on edges — subtle spectrum without being garish
- Accent: thin spectrum hint (`#38bdf8` → `#a78bfa`) on ray edges

**Must work at:**
- 128×128px (marketplace listing)
- 32×32px (activity bar)
- 16×16px (tab/status bar) — at this size just the glow point reads

---

## Competitive Positioning (internal — not for README)

| Competitor | Their angle | Our counter |
|---|---|---|
| GitHub Copilot | "Your AI pair programmer" — warm, vague | We name the mechanism: LSP not grep |
| Continue | "The leading open-source AI code agent" | Leadership claim with no technical substance |
| Cody | Enterprise consistency at scale | We win on individual developer precision |
| Windsurf | Motion/flow metaphor, no technical claim | We own the "actually understands code" story |
| Tabnine | Privacy, on-device | We win on model choice and code intelligence depth |

**The single message no competitor can copy:**
> *Other tools search your files. Lucent Code reads your code.*
