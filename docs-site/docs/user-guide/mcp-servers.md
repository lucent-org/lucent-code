---
sidebar_position: 7
title: MCP Servers
description: Extend the AI's capabilities with Model Context Protocol servers — connect databases, browsers, APIs, and more.
---

# MCP Servers

**MCP (Model Context Protocol)** is an open standard for giving AI models access to external tools and data sources. An MCP server exposes a set of tools the AI can call — anything from querying a database to controlling a browser.

## How It Works

When an MCP server is connected, its tools appear alongside Lucent Code's built-in editor tools. The AI can use them in conversation, subject to your approval (or bypassed in autonomous mode).

Tool calls are prefixed with the server name: `mcp__playwright__browser_navigate`, for example.

## Adding MCP Servers

Lucent Code reads MCP configuration from three locations, merged in this order (later wins on name collisions):

1. `~/.claude/settings.json` — shared across all Claude/Lucent sessions
2. `~/.lucentcode/settings.json` — Lucent Code-specific global config
3. `<workspace>/.mcp.json` — project-specific, checked into version control

### Via Claude Code CLI (Recommended)

If you have [Claude Code](https://claude.ai/code) installed:

```bash
claude mcp add playwright -- npx @playwright/mcp@latest
```

This writes to `~/.claude/settings.json`, making the server available in Lucent Code automatically.

### Manually in `.mcp.json`

Create `.mcp.json` in your workspace root:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"]
    }
  }
}
```

Changes to `.mcp.json` trigger an automatic reconnect — no restart needed.

## Useful MCP Servers

| Server | What it does | Install |
|---|---|---|
| `@playwright/mcp` | Browser automation — navigate, click, screenshot | `npx @playwright/mcp@latest` |
| `@upstash/context7-mcp` | Fetch up-to-date library docs | `npx -y @upstash/context7-mcp@latest` |
| `@modelcontextprotocol/server-filesystem` | Read/write filesystem outside workspace | npm |
| `@modelcontextprotocol/server-postgres` | Query a PostgreSQL database | npm |
| `@modelcontextprotocol/server-github` | GitHub API — issues, PRs, code search | npm |

Browse the full registry at [modelcontextprotocol.io](https://modelcontextprotocol.io).

## Server Status

The chat toolbar shows a status chip per MCP server:
- **Green dot** — connected and tools available
- **Red dot** — error (check the Output panel → Lucent Code for logs)

## Mentioning MCP Servers

Type `@server-name` in the chat input to direct a message to a specific MCP server. The AI will prioritise that server's tools when responding.

## MCP Tool Approval

All MCP tool calls require approval by default, regardless of your autonomous mode setting for editor tools. This is intentional — MCP servers can have significant side effects (browser actions, database writes, API calls).

To allow MCP calls without approval, enable full autonomous mode (⚡).
