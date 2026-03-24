---
sidebar_position: 4
title: Tools & MCP
description: How editor tools are defined, how tool approval works, and how MCP server tools are merged into the tool list.
---

# Tools & MCP

## Editor Tools

Editor tools are defined as `ToolDefinition` objects (OpenAI-compatible function schema) and passed to every API call. They're implemented in `src/tools/editor-tools.ts`.

```typescript
interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;  // JSON Schema
  };
}
```

### Tool Approval Flow

When the model returns a `tool_calls` delta:

1. `ChatHandler` checks if autonomous mode is enabled
2. If not: sends `toolApprovalRequest` to webview:
   ```typescript
   { type: 'toolApprovalRequest'; requestId: string; toolName: string; args: Record<string, unknown>; diff?: DiffLine[] }
   ```
3. Webview shows approval card; user clicks Allow or Deny
4. Webview posts `toolApprovalResponse`:
   ```typescript
   { type: 'toolApprovalResponse'; requestId: string; approved: boolean; scope?: 'once' | 'workspace' | 'global' }
   ```
5. If `scope === 'workspace'` or `'global'`, the tool is added to the allow-list for future calls

Approved scopes are persisted to VS Code's workspace/global state so they survive restarts.

### Adding a New Editor Tool

1. Add the `ToolDefinition` to the `getEditorTools()` function in `src/tools/editor-tools.ts`
2. Add a handler case in the tool dispatch switch statement
3. If the tool makes destructive changes, generate a `DiffLine[]` preview and include it in the `toolApprovalRequest`

## MCP Client Manager

`src/mcp/mcp-client-manager.ts` manages MCP server subprocesses.

**Config loading order** (later wins on name collisions):
1. `~/.claude/settings.json`
2. `~/.lucentcode/settings.json`
3. `<workspace>/.mcp.json`

**Startup:** Each configured server is spawned as a stdio subprocess via `@modelcontextprotocol/sdk`'s `StdioClientTransport`. Tools are listed via the MCP `tools/list` method.

**Tool namespacing:** MCP tools are prefixed as `mcp__serverName__toolName` before being added to the tool list sent to the API. This avoids name collisions with editor tools.

**Tool routing:** When `ChatHandler` receives a tool call, it checks the name prefix:
- `mcp__*` → `McpClientManager.callTool(server, toolName, args)`
- everything else → `EditorTools.dispatch(toolName, args)`

**Error isolation:** If a server fails to start or crashes, it's marked as `error` and its tools are excluded. A `callTool` failure returns `{ isError: true, content: [{ type: 'text', text: errorMessage }] }` to the model, letting it handle the error gracefully.

## Diff Preview

For file-writing tools, `ChatHandler` generates a `DiffLine[]` before executing:

```typescript
interface DiffLine {
  type: 'context' | 'added' | 'removed';
  content: string;
}
```

The diff is computed by comparing the existing file content against the proposed content using a simple Myers diff algorithm. It's included in the `toolApprovalRequest` so the webview can render a preview before the user approves.
