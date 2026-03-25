---
sidebar_position: 1
title: Architecture
description: How the extension is structured — the VS Code host process, the SolidJS webview, and the postMessage protocol between them.
---

# Architecture

Lucent Code is a VS Code extension split into two processes that communicate via VS Code's webview postMessage API.

## High-Level Structure

```
┌─────────────────────────────────────────────────────────────┐
│ VS Code Extension Host (Node.js)                            │
│                                                             │
│  src/extension.ts          ← activation entry point        │
│  src/chat/chat-handler.ts  ← OpenRouter API calls          │
│  src/skills/               ← skill registry & sources      │
│  src/tools/                ← editor tool implementations   │
│  src/mcp/                  ← MCP client manager            │
│  src/context/              ← LSP context gatherer          │
│  src/search/               ← codebase indexer              │
└──────────────────┬──────────────────────────────────────────┘
                   │  postMessage (WebviewMessage / ExtensionMessage)
┌──────────────────▼──────────────────────────────────────────┐
│ Webview (SolidJS, bundled by esbuild)                       │
│                                                             │
│  webview/src/App.tsx           ← root component            │
│  webview/src/components/       ← UI components             │
│  webview/src/services/         ← vscode API bridge         │
└─────────────────────────────────────────────────────────────┘
```

## Message Protocol

All communication uses typed messages defined in `src/shared/types.ts`.

**Webview → Extension** (`WebviewMessage`):
```typescript
type WebviewMessage =
  | { type: 'sendMessage'; content: string; images?: string[]; model: string }
  | { type: 'getModels' }
  | { type: 'setModel'; modelId: string }
  | { type: 'toolApprovalResponse'; requestId: string; approved: boolean; scope?: ApprovalScope }
  | { type: 'listFiles'; query: string }
  // ... more
```

**Extension → Webview** (`ExtensionMessage`):
```typescript
type ExtensionMessage =
  | { type: 'streamChunk'; content: string }
  | { type: 'streamEnd'; usage?: Usage }
  | { type: 'modelsLoaded'; models: OpenRouterModel[] }
  | { type: 'toolApprovalRequest'; requestId: string; toolName: string; args: Record<string, unknown>; diff?: DiffLine[] }
  | { type: 'usageUpdate'; lastMessageCost: number; sessionCost: number; creditsUsed: number }
  // ... more
```

The webview sends messages via `vscode.postMessage()`. The extension sends messages via `panel.webview.postMessage()`.

## Key Source Files

| File | Purpose |
|---|---|
| `src/extension.ts` | Activation, panel creation, message routing |
| `src/chat/chat-handler.ts` | Builds prompts, calls OpenRouter API, streams responses, routes tool calls |
| `src/skills/skill-registry.ts` | Loads and indexes skills from all sources |
| `src/skills/sources/` | Skill source implementations (builtin, claude-code, github, npm, marketplace, local) |
| `src/tools/editor-tools.ts` | Implements editor tool calls (write_file, rename_symbol, etc.) |
| `src/mcp/mcp-client-manager.ts` | Spawns and manages MCP server subprocesses |
| `src/context/context-gatherer.ts` | Collects LSP context (file, selection, diagnostics) |
| `src/search/indexer.ts` | Vector indexing for @codebase search |
| `src/shared/types.ts` | **All shared types** — read this first |
| `webview/src/App.tsx` | Root SolidJS component, message handler |
| `webview/src/components/ChatMessage.tsx` | Renders a single message with markdown, code blocks, tool cards |
| `webview/src/components/ChatInput.tsx` | Input with @mentions, skill chips, file attachment |
| `webview/src/components/ModelSelector.tsx` | Model picker dropdown |

## Build System

esbuild bundles both the extension and the webview:

```bash
npm run build         # production build
npm run watch         # incremental rebuild on file change
```

Config: `esbuild.config.mjs`. Notable: `.md` files are loaded as text strings (used for built-in skills).

## Data Flow: Sending a Message

1. User types in `ChatInput.tsx` and presses Enter
2. Webview posts `{ type: 'sendMessage', content, model }` to extension
3. `extension.ts` routes to `ChatHandler`
4. `ChatHandler` builds the system prompt (active file, skills list, capabilities, LUCENT.md)
5. OpenRouter API called with streaming enabled
6. Each token streamed back as `{ type: 'streamChunk', content }`
7. If AI calls a tool: `{ type: 'toolApprovalRequest' }` sent to webview
8. User approves → webview posts `{ type: 'toolApprovalResponse', approved: true }`
9. Tool executed, result appended to messages, API called again
10. `{ type: 'streamEnd', usage }` sent when done; `{ type: 'usageUpdate' }` updates status bar
