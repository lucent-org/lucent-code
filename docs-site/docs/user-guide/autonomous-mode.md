---
sidebar_position: 6
title: Autonomous Mode
description: Let the AI make file edits, run commands, and use tools — with or without your approval on each action.
---

# Autonomous Mode

By default, Lucent Code asks for your approval before the AI makes any changes to your files or runs any commands. **Autonomous mode** bypasses these approval gates so the AI can work through multi-step tasks without interruption.

## Enabling Autonomous Mode

Click the **⚡ lightning bolt** toggle in the chat toolbar. When lit, autonomous mode is active for the current session.

To make it the persistent default:

```json
// .vscode/settings.json or user settings
{
  "lucentCode.chat.autonomousMode": true
}
```

## Tool Approval (Without Autonomous Mode)

When the AI wants to take an action — edit a file, run a shell command, make an HTTP request — an **approval card** appears in the chat:

```
┌─────────────────────────────────────────────┐
│ ⚙ write_file                                │
│ path: src/auth/token.ts                     │
│                                             │
│ [Show diff]  [Allow once]  [Allow always]   │
└─────────────────────────────────────────────┘
```

**Approval scopes:**

| Option | Behaviour |
|---|---|
| **Allow once** | Approve this single call |
| **Allow for workspace** | Approve all calls of this tool type in this workspace |
| **Allow always** | Approve this tool type globally, forever |
| **Deny** | Block this call; the AI will try a different approach |

For file edits, click **Show diff** to preview the exact changes before approving.

## Available Tools

When not in autonomous mode, the AI can request to use these tools (all require approval):

| Tool | What it does |
|---|---|
| `read_file` | Read any file in your workspace |
| `write_file` | Write or create a file |
| `rename_symbol` | Rename a symbol across the codebase via LSP |
| `apply_code_action` | Apply a VS Code quick fix or refactoring |
| `format_document` | Run the document formatter |
| `insert_code` | Insert code at a specific position |
| `replace_range` | Replace a specific code range |
| `search_web` | Search the web via DuckDuckGo |
| `fetch_url` | Fetch a URL and return it as Markdown |
| `http_request` | Make a GET/POST/PUT/DELETE HTTP request |
| `use_model` | Switch to a different model mid-conversation |
| `use_skill` | Load a skill's full content |

MCP server tools also appear here (see [MCP Servers](./mcp-servers)).

## Git Worktrees

For larger agentic tasks, Lucent Code can create a **git worktree** — an isolated copy of your repo on a new branch. The AI works in the worktree, keeping your working directory clean.

Start a worktree session via the **Start Worktree** button in the toolbar. When the task is done, you can merge, create a PR, or discard the worktree.

:::tip
Use autonomous mode + worktrees for tasks like *"refactor the entire auth module"* or *"add TypeScript types throughout this file"*. The AI works through the task, you review the result as a diff.
:::
