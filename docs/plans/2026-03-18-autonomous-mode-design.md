# Autonomous Mode — Design

**Date:** 2026-03-18
**Status:** Approved

---

## Goal

Gate all MCP tool calls behind the existing approval UI, and add an autonomous mode that bypasses all approval gates (both editor tools and MCP tools) — surfaced as a VS Code setting for the persistent default and a toolbar button for per-session override.

---

## Architecture

```
Activate → settings.autonomousMode → MessageHandler._autonomousMode
        → postMessage(autonomousModeChanged) → webview toolbar reflects state

Toolbar click → postMessage(setAutonomousMode) → MessageHandler._autonomousMode = value

Tool call arrives:
  if _autonomousMode         → execute directly
  else if mcp__ prefix       → requestToolApproval → execute if approved
  else if GATED_TOOLS member → requestToolApproval → execute if approved
  else                       → execute directly
```

The VS Code setting is the persistent default (read on activation). The toolbar toggle is a per-session override — no settings write on click. Toggling the toolbar changes `_autonomousMode` in the running `MessageHandler` only; the setting is unchanged.

---

## Components

### Extension

**`src/core/settings.ts`**
Add getter:
```typescript
get autonomousMode(): boolean {
  return this.config.get<boolean>('chat.autonomousMode', false);
}
```

**`src/chat/message-handler.ts`**
- Add `private _autonomousMode: boolean` field, initialized from `settings.autonomousMode` in constructor
- Add `setAutonomousMode(value: boolean): void` method
- Handle `setAutonomousMode` webview message in `handleMessage`
- MCP gate: when `finish_reason === 'tool_calls'` and tool name starts with `mcp__`, call `requestToolApproval` unless `_autonomousMode`
- Editor gate: existing `GATED_TOOLS` check also skipped when `_autonomousMode`

**`src/shared/types.ts`**
```typescript
// Add to WebviewMessage:
| { type: 'setAutonomousMode'; enabled: boolean }

// Add to ExtensionMessage:
| { type: 'autonomousModeChanged'; enabled: boolean }
```

**`package.json`**
```json
"lucentCode.chat.autonomousMode": {
  "type": "boolean",
  "default": false,
  "description": "When enabled, all tool calls (editor tools and MCP tools) run without approval prompts."
}
```

**`src/extension.ts`**
In `setupWebviewMessaging()`, after existing setup, push initial autonomous mode state:
```typescript
chatProvider.postMessageToWebview({
  type: 'autonomousModeChanged',
  enabled: settings.autonomousMode,
});
```
Pass `settings.autonomousMode` as initial value to `MessageHandler` constructor (via `Settings` reference already passed).

### Webview

**`webview/src/stores/chat.ts`**
Add signal:
```typescript
const [autonomousMode, setAutonomousMode] = createSignal(false);
```
Expose `autonomousMode` accessor and `setAutonomousModeFromMessage(value: boolean)` setter.

**`webview/src/App.tsx`**
- Handle `autonomousModeChanged` message → `chatStore.setAutonomousModeFromMessage(message.enabled)`
- Toolbar button that calls `vscode.postMessage({ type: 'setAutonomousMode', enabled: !chatStore.autonomousMode() })` on click
- Button label: `⚡` with `title="Autonomous mode — all tools run without approval"`
- Active class applied when `chatStore.autonomousMode()` is `true`

---

## Testing

**`src/core/settings.test.ts`**
- `autonomousMode` returns `false` by default
- `autonomousMode` returns `true` when config set to `true`

**`src/chat/message-handler.test.ts`**
- MCP tool call, autonomous mode off → `requestToolApproval` called; `callTool` runs only if approved
- MCP tool call, autonomous mode on → `callTool` runs directly, no approval
- Gated editor tool, autonomous mode on → executes directly, no approval
- `setAutonomousMode` message updates `_autonomousMode` correctly

---

## Out of Scope

- Per-server or per-tool MCP approval granularity (v1: all-or-nothing)
- Persisting the per-session toolbar override to settings
- Visual indicator of which tools ran autonomously in the message history
