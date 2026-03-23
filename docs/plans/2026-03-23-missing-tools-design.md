# Missing Tools Design

## Goal

Add the five core tools that all major AI coding competitors (Cursor, Copilot Agent, Cline) provide but Lucent Code currently lacks: `write_file`, `delete_file`, `run_terminal_command`, `list_directory`, and `create_directory`. Add a scoped approval system for the three destructive tools.

## Architecture

### The 5 New Tools

| Tool | Approval required | Notes |
|------|-----------------|-------|
| `write_file` | ✅ | Creates or overwrites a file; creates parent dirs automatically |
| `delete_file` | ✅ | Irreversible; shows path in approval card |
| `run_terminal_command` | ✅ | Runs in integrated terminal; returns captured output |
| `list_directory` | ❌ auto | Read-only, no risk |
| `create_directory` | ❌ auto | Non-destructive |

### Approval Card UI

The three destructive tools route through the existing `ToolCallCard`. The card gets a 4-button footer:

```
┌─────────────────────────────────────────────┐
│ ▶ run_terminal_command                       │
│ npm test -- --coverage                       │
│                                              │
│ [Deny]  [Once]  [This workspace]  [Always]   │
└─────────────────────────────────────────────┘
```

- **Deny** — blocks this call; model receives an error result
- **Once** — approves this single invocation only
- **This workspace** — persists approval to `.lucent/config.json`; never asks again for this tool in this project
- **Always** — persists approval to `~/.lucent/config.json`; never asks again for this tool anywhere

Approval granularity is per-tool-type (not per specific command/path), matching Cline's approach.

### Approval Storage

| Scope | Location | Format |
|-------|----------|--------|
| Session | In-memory `Set<string>` on `MessageHandler` | — |
| Workspace | `{workspaceRoot}/.lucent/config.json` | JSON |
| Global | `~/.lucent/config.json` | JSON |

Config file schema (identical for both locations):
```json
{
  "approvedTools": ["write_file", "run_terminal_command"]
}
```

**Check order** before showing approval UI:
1. Session set contains tool name? → execute immediately
2. Workspace `.lucent/config.json` `approvedTools` contains tool name? → execute immediately
3. Global `~/.lucent/config.json` `approvedTools` contains tool name? → execute immediately
4. Send `toolApprovalRequest` to webview → show card → wait for response

**On "This workspace" click** → read/create `.lucent/config.json`, add tool name, write back. Also ensure `.lucent` is in `.gitignore` (append if missing).

**On "Always" click** → same but `~/.lucent/config.json`.

### `write_file` Implementation

- Uses `vscode.workspace.fs.writeFile`
- Creates all missing parent directories before writing
- Card shows the file path (no diff preview — the file may not exist yet)
- On success returns the number of bytes written

### `delete_file` Implementation

- Uses `vscode.workspace.fs.delete`
- Returns a clear error if the file does not exist (no silent no-ops)

### `run_terminal_command` Implementation

- Creates a new VS Code terminal (or reuses a named "Lucent" terminal)
- Sends the command via `terminal.sendText`
- Waits a settle time (default 8 seconds) for the command to complete
- Reads output from the existing `TerminalBuffer`
- Returns stdout/stderr as the tool result so the model can react to failures
- If `TerminalBuffer` is unavailable (proposed API not enabled), returns a message noting that output capture is unavailable

### `list_directory` Implementation

- Uses `vscode.workspace.fs.readDirectory`
- Returns a sorted list of entries with type indicators (`[file]` / `[dir]`)
- Accepts workspace-relative or absolute paths

### `create_directory` Implementation

- Uses `vscode.workspace.fs.createDirectory`
- Silently succeeds if directory already exists

### `.gitignore` Management

On first "This workspace" approval:
1. Check if `.gitignore` exists in workspace root
2. If it contains `.lucent` already, do nothing
3. Otherwise append `.lucent` to `.gitignore` (or create `.gitignore` with that entry)

### ToolCallCard Changes

The webview `ToolCallCard` component needs:
- Current two-button layout (Approve / Deny) replaced with the four-button layout for destructive tools
- The approval response message extended from `{ approved: boolean }` to `{ approved: boolean; scope?: 'once' | 'workspace' | 'global' }`
- For `run_terminal_command` and `delete_file`: show the key argument (command string / file path) prominently
- For `write_file`: show the target path

### Message Handler Changes

`MessageHandler` needs:
- A `sessionApprovals: Set<string>` field
- A `ToolApprovalManager` helper (or inline logic) that checks session/workspace/global before dispatching approval requests
- Handling for the new `scope` field in `toolApprovalResponse` messages
- Implementations of the 5 new tool methods wired into `EditorToolExecutor`

## Tech Stack

- VS Code extension API: `workspace.fs`, `window.createTerminal`, `workspace.getConfiguration`
- Node `fs/promises` + `os.homedir()` for `~/.lucent/config.json`
- Existing `TerminalBuffer` for command output capture
- Existing `ToolCallCard` webview component (extended)
- Existing tool approval message flow (`toolApprovalRequest` / `toolApprovalResponse`)
