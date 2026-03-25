---
sidebar_position: 2
title: Chat Interface
description: How to use the chat panel — sending messages, keyboard shortcuts, conversation history, and applying code.
---

# Chat Interface

## Sending Messages

- **Enter** — send message
- **Shift+Enter** — insert a newline
- The input grows automatically as you type

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+L` | Focus the chat input |
| `Ctrl+Shift+N` | Start a new chat |
| `Ctrl+Shift+P` → **Lucent Code: New Chat** | New chat via Command Palette |

## Context Mentions

Type `@` in the chat input to insert context:

| Mention | What it adds |
|---|---|
| `@terminal` | Last 200 lines of the active terminal |
| `@file` | Fuzzy-search and attach any workspace file |
| `@fix` | Prefixes your message with a focused fix prompt |
| `@explain` | Prefixes your message with an explain prompt |
| `@model` | Opens the model picker to switch model inline |
| `@codebase` | Semantic search across your indexed workspace |

## Skills (Slash Commands)

Type `/` to open the skills menu and invoke a built-in or custom skill. See [Skills & Commands](./skills-and-commands).

## Applying Code

When the AI responds with a code block, three action buttons appear:

- **Copy** — copy to clipboard
- **Insert at cursor** — paste at your current editor cursor position
- **Apply to file** — apply as a workspace edit with a diff preview

The **Apply** button shows an inline diff for single-change responses. For larger changes it opens VS Code's native diff editor so you can review before accepting.

## Conversation History

Every conversation is **automatically saved** with an AI-generated title.

Access history via the **conversation list** in the chat panel header. Click any conversation to load it.

**Delete** a conversation by hovering and clicking the trash icon.

**Export** a conversation via the `⋯` menu:
- **JSON** — full message history with metadata
- **Markdown** — readable format for sharing or archiving

## Cancelling a Response

Click the **Stop** button (appears while the AI is generating) to cancel mid-stream.

## Compacting a Conversation

Long conversations consume more of the model's context window and cost more per message. Use `/compact` to summarise and compress the history:

1. Type `/compact` and press Enter
2. The AI generates a summary of the conversation so far
3. A visual divider marks the compaction point
4. Future messages reference the summary rather than the full history

This is especially useful after a long debugging session where you want to keep going without starting fresh.

## Context Window Indicator

The model selector shows a **context fill percentage** (e.g. `· 42%`) that grows as your conversation gets longer. When it hits 80% the indicator turns red — a good signal to compact or start a new chat.
