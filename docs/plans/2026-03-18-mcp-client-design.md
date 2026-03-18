# MCP Client Support — Design

**Date:** 2026-03-18
**Status:** Approved

---

## Goal

Lucent Code connects to external MCP servers configured by the user, merges their tools and resources into every OpenRouter API call, and routes model-initiated tool calls back through the MCP server — transparently alongside existing editor tools.

---

## Architecture

A **`McpClientManager`** singleton lives in the extension host (Node.js). On activation it reads the three-tier config stack, spawns each configured MCP server as a stdio subprocess via `@modelcontextprotocol/sdk` `StdioClientTransport`, and calls `initialize` → `tools/list` → `resources/list`.

The resulting tool schemas are merged into the tool array sent to OpenRouter on every chat turn. Resources are exposed as a synthetic `mcp__read_resource` tool. Tool names are namespaced `mcp__{serverName}__{toolName}` to avoid collisions with editor tools.

The webview receives a `mcpStatus` message on startup for a status chip in the toolbar. Tool calls flow through the existing `tool_call` / `tool_approval` pipeline — no new webview message types needed.

---

## Configuration

Three-tier stack, later wins on name collisions:

| Priority | Source | Key |
|---|---|---|
| Lowest | `~/.claude/settings.json` | `mcpServers` |
| Middle | `~/.lucentcode/settings.json` | `mcpServers` |
| Highest | `<workspace>/.mcp.json` | `mcpServers` |

Each `mcpServers` entry uses the same schema across all three files:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    }
  }
}
```

---

## Components

### New files

**`src/mcp/mcp-config-loader.ts`**
Reads and merges all three config files. Returns `Map<string, McpServerConfig>`. Skips files with malformed JSON (logs warning). Skips entries with unsupported `type` values (SSE not supported in v1).

**`src/mcp/mcp-client-manager.ts`**
Owns one `Client` + `StdioClientTransport` per server. Exposes:
- `getTools(): ToolDefinition[]` — flat list of all MCP tools, namespaced
- `callTool(serverName, toolName, args): Promise<ToolResult>`
- `readResource(uri): Promise<ResourceContent>`
- `dispose()` — kills all subprocesses

**`src/mcp/mcp-client-manager.test.ts`**
Unit tests with mocked SDK.

### Modified files

**`src/core/openrouter-client.ts`**
Merges `mcpClientManager.getTools()` into the tool array before each API call.

**`src/chat/message-handler.ts`**
Routes `tool_call` messages whose name starts with `mcp__` to `McpClientManager` instead of the editor tools handler.

**`extension.ts`**
Instantiates `McpClientManager`, passes it to `MessageHandler`, calls `manager.dispose()` on deactivation. Adds file watcher on `<workspace>/.mcp.json` to trigger reconnect on change.

---

## Data Flow

```
Model → tool_call: mcp__filesystem__read_file({path})
  → MessageHandler detects mcp__ prefix
  → McpClientManager.callTool("filesystem", "read_file", {path})
  → stdio JSON-RPC to server process
  → result returned as tool_result back to conversation
```

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Server fails to start / `initialize` times out (5 s) | Marked `error`, tools excluded, webview chip shows failure |
| `callTool` RPC fails (crash, timeout) | Returns `tool_result` with `isError: true` — model decides how to proceed |
| Malformed JSON in config file | Log warning, skip file, continue with lower-priority sources |
| Unsupported transport type (e.g. `sse`) | Log warning, skip that server entry |
| `.mcp.json` changes | File watcher triggers full reconnect |

Servers are killed on `deactivate()`.

---

## Testing

- `mcp-config-loader.test.ts` — merge priority (3 sources), malformed JSON, missing files, unsupported type
- `mcp-client-manager.test.ts` — mock SDK Client; verify `getTools()`, `callTool()`, dispose kills processes, error paths
- `message-handler.test.ts` — `mcp__`-prefixed tool call routes to `McpClientManager`; non-`mcp__` calls unaffected

---

## Out of Scope (v1)

- SSE / HTTP transport
- MCP server installation UI
- Resource subscription / streaming
- Per-server approval prompts (all MCP tool calls go through the existing approval flow)
