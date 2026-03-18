# Diff Preview — Design

**Date:** 2026-03-18
**Status:** Approved

---

## Goal

For the two GATED_TOOLS that directly modify file content (`replace_range`, `insert_code`), compute an inline diff of the proposed change and display it in the tool approval card — so the user can see exactly what will change before clicking Allow or Deny. All other gated tools (`rename_symbol`, `apply_code_action`) keep the current args card unchanged.

---

## Architecture

When `requestToolApproval` is called for `replace_range` or `insert_code`, the extension host:

1. Reads the current file content via `vscode.workspace.fs.readFile`
2. Applies the proposed change to an in-memory string copy
3. Computes `DiffLine[]` using the existing `Diff.diffLines()` (already imported in `message-handler.ts`)
4. Includes `diff?: DiffLine[]` in the `toolApprovalRequest` message

The webview's `ToolCallCard` checks for `diff` — if present, renders the existing `DiffView` in place of the raw args JSON dump. No new components needed.

If the file cannot be read (not found, permissions error, missing `uri` arg), `diff` is omitted and the card falls back to the current args display.

---

## Components

### `src/shared/types.ts`
- Add `diff?: DiffLine[]` to the `toolApprovalRequest` variant of `ExtensionMessage`
- Add `diff?: DiffLine[]` to `ToolApprovalData`

### `src/chat/message-handler.ts`
Add private method:
```typescript
private async computeToolDiff(
  toolName: string,
  args: Record<string, unknown>
): Promise<DiffLine[] | undefined>
```

- For `replace_range`: read file at `args.uri` → splice `args.newText` over `[startLine, startCharacter] – [endLine, endCharacter]` → `Diff.diffLines(original, modified)` → map to `DiffLine[]` with ±3 lines of context per hunk
- For `insert_code`: read file at `args.uri` → insert `args.code` at `args.line`/`args.character` → same diff pipeline
- Any other tool name → return `undefined`
- Any read/parse error → return `undefined` (silent fallback)

Called just before `requestToolApproval` for `replace_range` and `insert_code`; result passed as optional `diff` field in the approval message.

### `webview/src/components/ToolCallCard.tsx`
- When `approval.diff` is present: render `<DiffView>` with the diff lines and filename extracted from `args.uri`; `onDismiss` is a no-op (Allow/Deny buttons handle resolution)
- `DiffView`'s own Apply/Discard buttons are hidden in this context via a new `readOnly` prop
- When `approval.diff` is absent: keep existing args JSON dump

### `webview/src/stores/chat.ts`
- `handleToolApprovalRequest` already stores into `ToolApprovalData` — add `diff` field passthrough

---

## Data Flow

```
GATED_TOOLS hit (replace_range or insert_code)
  → computeToolDiff(toolName, args)
      → vscode.workspace.fs.readFile(uri)
      → apply change to string copy
      → Diff.diffLines(original, modified)
      → map to DiffLine[] with ±3 lines context
      → return DiffLine[]
  → requestToolApproval(toolName, args, diff, postMessage)
      → postMessage({ type: 'toolApprovalRequest', ..., diff })
  → webview renders ToolCallCard with DiffView
  → Allow → toolApprovalResponse(approved: true) → tool executes
  → Deny  → toolApprovalResponse(approved: false) → skipped
```

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| File read fails | `computeToolDiff` returns `undefined`; card shows args dump |
| `uri` arg missing or invalid | Same fallback |
| `newText` / `code` arg missing | Same fallback |
| Invalid range (out of bounds) | Same fallback |

---

## Testing

**`src/chat/message-handler.test.ts`**
- `replace_range` approval request includes non-empty `diff` when `vscode.workspace.fs.readFile` returns content
- `insert_code` approval request includes non-empty `diff` similarly
- File read failure → `diff` is `undefined` in the approval request
- `rename_symbol` and `apply_code_action` approval requests do NOT include `diff`

---

## Out of Scope

- Diff preview for `rename_symbol` or `apply_code_action`
- Multi-hunk collapsing / expand-all UI
- Syntax highlighting within the diff lines
