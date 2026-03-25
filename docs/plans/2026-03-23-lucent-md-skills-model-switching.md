# LUCENT.md, Built-in Skills & Model Switching Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `LUCENT.md` project instructions with `@skill()` declarations, a built-in language-agnostic skill pack, a Claude Code adapter, pull-only skill loading (remove auto-matching), and a `use_model` tool + `@model()` mention for mid-conversation model switching.

**Architecture:** `InstructionsLoader` is extended to parse `@skill()` lines from `LUCENT.md` and expose activated skill names separately from prose. `SkillMatcher` auto-injection is removed — skills are pull-only via `use_skill`. A `ClaudeCodeSource` reads `~/.claude/skills/*/SKILL.md`. Six built-in skills ship in `src/skills/builtin/`. A new `use_model` tool routes through `APPROVAL_GATED_TOOLS` and the existing scoped-approval infrastructure; `@model()` is a new user-initiated mention type in the chat input.

**Tech Stack:** TypeScript, VS Code extension API, SolidJS webview, Vitest, Node `os.homedir()`, existing `SkillRegistry` / `parseFrontmatter` / `APPROVAL_GATED_TOOLS` infrastructure.

---

### Task 1: Update InstructionsLoader — new filenames + `@skill()` parser

**Files:**
- Modify: `src/core/instructions-loader.ts`
- Modify: `src/core/instructions-loader.test.ts`

**Background:** `InstructionsLoader` currently reads `.openrouter-instructions.md` or `.cursorrules`. We need to: (a) replace the filename list with `LUCENT.md`, `.clinerules`, `.cursorrules`, `CLAUDE.md`; (b) parse `@skill(name)` lines from the loaded content and expose them separately; (c) strip `@skill()` lines from the prose before it reaches the system prompt.

**Step 1: Write failing tests**

Add to `src/core/instructions-loader.test.ts`:

```ts
it('loads LUCENT.md first', async () => {
  mockReadFile.mockResolvedValueOnce(new TextEncoder().encode('# Instructions'));
  await loader.load();
  expect(loader.getInstructions()).toBe('# Instructions');
  // verify the path tried was LUCENT.md
  expect(mockReadFile.mock.calls[0][0]).toMatchObject({ path: expect.stringContaining('LUCENT.md') });
});

it('falls back to .clinerules', async () => {
  mockReadFile
    .mockRejectedValueOnce(new Error('not found')) // LUCENT.md
    .mockResolvedValueOnce(new TextEncoder().encode('be concise'));
  await loader.load();
  expect(loader.getInstructions()).toBe('be concise');
  expect(mockReadFile.mock.calls[1][0]).toMatchObject({ path: expect.stringContaining('.clinerules') });
});

it('falls back to CLAUDE.md last', async () => {
  mockReadFile
    .mockRejectedValueOnce(new Error()) // LUCENT.md
    .mockRejectedValueOnce(new Error()) // .clinerules
    .mockRejectedValueOnce(new Error()) // .cursorrules
    .mockResolvedValueOnce(new TextEncoder().encode('claude rules'));
  await loader.load();
  expect(loader.getInstructions()).toBe('claude rules');
});

it('does not load .openrouter-instructions.md', async () => {
  mockReadFile.mockRejectedValue(new Error('not found'));
  await loader.load();
  const tried = mockReadFile.mock.calls.map((c: any[]) => c[0].path as string);
  expect(tried.some((p) => p.includes('openrouter'))).toBe(false);
});

it('parses @skill() lines and strips them from instructions', async () => {
  const raw = 'Use small functions.\n\n@skill(tdd)\n@skill(clean-commits)\n\nEnd.';
  mockReadFile.mockResolvedValueOnce(new TextEncoder().encode(raw));
  await loader.load();
  expect(loader.getInstructions()).toBe('Use small functions.\n\nEnd.');
  expect(loader.getActivatedSkills()).toEqual(['tdd', 'clean-commits']);
});

it('returns empty activated skills when no @skill() lines present', async () => {
  mockReadFile.mockResolvedValueOnce(new TextEncoder().encode('Just prose.'));
  await loader.load();
  expect(loader.getActivatedSkills()).toEqual([]);
});
```

**Step 2: Run tests to verify they fail**

```bash
cd c:/Projects/Prive/OpenRouterChat && npx vitest run src/core/instructions-loader.test.ts
```

Expected: FAIL — wrong filenames and `getActivatedSkills` not defined.

**Step 3: Update `src/core/instructions-loader.ts`**

```ts
import * as vscode from 'vscode';

const FILENAMES = ['LUCENT.md', '.clinerules', '.cursorrules', 'CLAUDE.md'] as const;
const MAX_BYTES = 50 * 1024;
const SKILL_LINE_RE = /^@skill\(([^)]+)\)\s*$/gm;

export class InstructionsLoader {
  private instructions: string | undefined;
  private activatedSkills: string[] = [];
  private watcher?: vscode.FileSystemWatcher;

  async load(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      this.instructions = undefined;
      this.activatedSkills = [];
      return;
    }
    const root = folders[0].uri;

    for (const filename of FILENAMES) {
      const uri = vscode.Uri.joinPath(root, filename);
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        if (bytes.byteLength > MAX_BYTES) {
          vscode.window.showWarningMessage(
            `Lucent Code: ${filename} exceeds 50 KB and will be ignored.`
          );
          continue;
        }
        const raw = new TextDecoder().decode(bytes);
        this.activatedSkills = [];
        const prose = raw.replace(SKILL_LINE_RE, (_, name: string) => {
          this.activatedSkills.push(name.trim());
          return '';
        }).replace(/\n{3,}/g, '\n\n').trim();
        this.instructions = prose || undefined;
        return;
      } catch {
        // file does not exist — try next
      }
    }
    this.instructions = undefined;
    this.activatedSkills = [];
  }

  watch(): void {
    this.watcher?.dispose();
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return;
    const pattern = new vscode.RelativePattern(folder, `{${FILENAMES.join(',')}}`);
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const reload = () => this.load();
    this.watcher.onDidCreate(reload);
    this.watcher.onDidChange(reload);
    this.watcher.onDidDelete(reload);
  }

  getInstructions(): string | undefined { return this.instructions; }
  getActivatedSkills(): string[] { return this.activatedSkills; }

  dispose(): void {
    this.watcher?.dispose();
    this.instructions = undefined;
    this.activatedSkills = [];
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/core/instructions-loader.test.ts
```

Expected: all tests PASS.

**Step 5: Commit**

```bash
git add src/core/instructions-loader.ts src/core/instructions-loader.test.ts
git commit -m "feat(skills): update InstructionsLoader — LUCENT.md filenames + @skill() parser"
```

---

### Task 2: Add built-in skill pack

**Files:**
- Create: `src/skills/builtin/tdd.md`
- Create: `src/skills/builtin/clean-commits.md`
- Create: `src/skills/builtin/refactor.md`
- Create: `src/skills/builtin/debugging.md`
- Create: `src/skills/builtin/code-review.md`
- Create: `src/skills/builtin/documentation.md`
- Modify: `src/extension.ts`

**Background:** Six language-agnostic skills bundled with the extension. They are registered via the existing `skillRegistry.load()` path using a `PreloadedSource`. The `extension.ts` `loadSkills` function reads them from the extension's install directory.

**Step 1: Create the six skill files**

`src/skills/builtin/tdd.md`:
```markdown
---
name: tdd
description: Write the failing test first, then implement the minimum code to pass it
---

Always follow this order:
1. Write a failing test that describes the desired behaviour exactly
2. Run it to confirm it fails (never skip this — it proves the test is real)
3. Write the minimum implementation to make the test pass
4. Refactor only after the test is green
5. Commit test + implementation together

Never write implementation code before the failing test exists.
If you cannot write a test first, explain why before proceeding.
```

`src/skills/builtin/clean-commits.md`:
```markdown
---
name: clean-commits
description: Small, focused commits in conventional format — one logical change per commit
---

Each commit must:
- Contain exactly one logical change (one bug fix, one feature, one refactor)
- Use the format: `type(scope): short description` where type is feat/fix/refactor/test/docs/chore
- Have a subject line under 72 characters
- Never mix unrelated changes (e.g. fix + refactor in one commit)

Stage only files related to the current change. Use `git add <specific-files>`, not `git add .`.
Commit as soon as a logical unit of work is complete — do not accumulate changes.
```

`src/skills/builtin/refactor.md`:
```markdown
---
name: refactor
description: Safe refactoring: tests first, one change at a time, no behaviour changes
---

Refactoring rules:
1. Ensure tests exist and pass before touching any code
2. Make one structural change at a time (rename, extract, inline, move)
3. Run tests after each change — never batch multiple refactors before testing
4. A refactor must not change observable behaviour — if tests break, revert
5. Commit each refactor step separately with a `refactor:` prefix

If tests do not exist, write them first (use the `tdd` skill). Never refactor untested code.
```

`src/skills/builtin/debugging.md`:
```markdown
---
name: debugging
description: Systematic root-cause debugging — find the cause before attempting any fix
---

Phase 1 — Find the root cause (do this before writing any fix):
1. Read the error message completely, including the full stack trace
2. Reproduce the failure reliably — identify exact steps
3. Check recent changes that could be responsible (`git log`, `git diff`)
4. Add diagnostic output at each component boundary to locate where the failure originates
5. Trace data flow backward from the symptom until you find the source

Phase 2 — Fix:
1. Write a failing test that reproduces the bug
2. Make the minimum change that fixes the root cause
3. Verify the test passes and no other tests regress

Never attempt a fix before completing Phase 1. If three fixes have failed, stop and question the architecture.
```

`src/skills/builtin/code-review.md`:
```markdown
---
name: code-review
description: Structured review: correctness first, then design, then style
---

Review in this order — do not mix levels:

**Level 1 — Correctness**
- Does the code do what it claims?
- Are there edge cases, off-by-one errors, null/undefined paths?
- Are error cases handled?

**Level 2 — Design**
- Is the abstraction at the right level?
- Are responsibilities clearly separated?
- Would a future change require touching many places?

**Level 3 — Style**
- Naming clarity
- Unnecessary complexity
- Consistency with surrounding code

For each issue: state the file + line, describe the problem, suggest the fix.
Prefix severity: `[critical]`, `[important]`, `[suggestion]`.
```

`src/skills/builtin/documentation.md`:
```markdown
---
name: documentation
description: Write minimal, accurate docs — no padding, no restating what the code says
---

Rules:
- Document WHY, not WHAT — the code shows what; the comment shows why
- If the code is self-explanatory, add no comment
- Function docs: describe what callers need to know (preconditions, side effects, return value)
- Never restate the function name in the doc ("Gets the user" for `getUser` is noise)
- Keep docs up to date — a wrong doc is worse than no doc
- Prefer short inline comments over large doc blocks for local context
```

**Step 2: Register built-in skills in `extension.ts`**

In `src/extension.ts`, find the `loadSkills` function. Before the `skillRegistry.load(preloaded)` call, add loading of built-in skills:

```ts
// Load built-in skills from extension install directory
const builtinDir = context.extensionUri.fsPath
  ? nodePath.join(context.extensionUri.fsPath, 'src', 'skills', 'builtin')
  : '';
const builtinMarkdowns: string[] = [];
if (builtinDir) {
  const files = await fs.readdir(builtinDir).catch(() => [] as string[]);
  for (const file of files) {
    if (typeof file === 'string' && file.endsWith('.md')) {
      const content = await fs.readFile(nodePath.join(builtinDir, file), 'utf8').catch(() => '');
      if (content) builtinMarkdowns.push(content);
    }
  }
}

const builtinSource = builtinMarkdowns.length > 0
  ? [{ type: 'local' as const, content: new Map(builtinMarkdowns.map((md, i) => [String(i), md])) }]
  : [];
await skillRegistry.load([...builtinSource, ...preloaded]);
```

(Replace the existing `await skillRegistry.load(preloaded)` line.)

**Step 3: Run full test suite**

```bash
cd c:/Projects/Prive/OpenRouterChat && npm test
```

Expected: all tests PASS (no code path changes to existing logic).

**Step 4: Commit**

```bash
git add src/skills/builtin/ src/extension.ts
git commit -m "feat(skills): add 6 built-in language-agnostic skills"
```

---

### Task 3: Add ClaudeCodeSource adapter

**Files:**
- Create: `src/skills/sources/claude-code-source.ts`
- Create: `src/skills/sources/claude-code-source.test.ts`
- Modify: `src/extension.ts`

**Background:** Claude Code stores skills as `~/.claude/skills/<name>/SKILL.md`. The format is identical to ours (frontmatter + body). The adapter reads that directory and loads `SKILL.md` from each subdirectory.

**Step 1: Write failing tests**

`src/skills/sources/claude-code-source.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';

const { mockReaddir, mockReadFile } = vi.hoisted(() => ({
  mockReaddir: vi.fn(),
  mockReadFile: vi.fn(),
}));

vi.mock('fs/promises', () => ({ readdir: mockReaddir, readFile: mockReadFile }));

const { fetchClaudeCodeSkills } = await import('./claude-code-source');

describe('fetchClaudeCodeSkills', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array when ~/.claude/skills does not exist', async () => {
    mockReaddir.mockRejectedValue(new Error('ENOENT'));
    expect(await fetchClaudeCodeSkills()).toEqual([]);
  });

  it('reads SKILL.md from each subdirectory', async () => {
    mockReaddir.mockResolvedValueOnce([
      { name: 'tdd', isDirectory: () => true },
      { name: 'not-a-dir.md', isDirectory: () => false },
    ]);
    mockReadFile.mockResolvedValueOnce('---\nname: tdd\ndescription: test driven\n---\n# TDD');
    const result = await fetchClaudeCodeSkills();
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('name: tdd');
  });

  it('skips subdirectory when SKILL.md is missing', async () => {
    mockReaddir.mockResolvedValueOnce([{ name: 'broken', isDirectory: () => true }]);
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    expect(await fetchClaudeCodeSkills()).toEqual([]);
  });

  it('uses the correct path: ~/.claude/skills', async () => {
    mockReaddir.mockRejectedValue(new Error('ENOENT'));
    await fetchClaudeCodeSkills();
    const expectedDir = path.join(os.homedir(), '.claude', 'skills');
    expect(mockReaddir.mock.calls[0][0]).toBe(expectedDir);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/skills/sources/claude-code-source.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement `src/skills/sources/claude-code-source.ts`**

```ts
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const CLAUDE_SKILLS_DIR = path.join(os.homedir(), '.claude', 'skills');
const MAX_BYTES = 50 * 1024;

export async function fetchClaudeCodeSkills(): Promise<string[]> {
  try {
    const entries = await fs.readdir(CLAUDE_SKILLS_DIR, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory());
    const results: string[] = [];
    for (const dir of dirs) {
      const skillPath = path.join(CLAUDE_SKILLS_DIR, dir.name, 'SKILL.md');
      try {
        const content = await fs.readFile(skillPath, 'utf8');
        if (content.length <= MAX_BYTES) results.push(content);
      } catch {
        // SKILL.md missing — skip
      }
    }
    return results;
  } catch {
    return [];
  }
}
```

**Step 4: Wire into `extension.ts`**

In `loadSkills()`, after the existing source loop, add:

```ts
// Auto-detect Claude Code skills
const claudeCodeMarkdowns = await fetchClaudeCodeSkills();
ownMarkdowns.push(...claudeCodeMarkdowns);
```

Add the import at the top of `extension.ts`:
```ts
import { fetchClaudeCodeSkills } from './skills/sources/claude-code-source';
```

**Step 5: Run tests**

```bash
npm test
```

Expected: all tests PASS.

**Step 6: Commit**

```bash
git add src/skills/sources/claude-code-source.ts src/skills/sources/claude-code-source.test.ts src/extension.ts
git commit -m "feat(skills): add ClaudeCodeSource adapter — auto-loads ~/.claude/skills"
```

---

### Task 4: Wire `@skill()` activated skills into SkillRegistry + remove SkillMatcher

**Files:**
- Modify: `src/chat/message-handler.ts`
- Modify: `src/core/context-builder.ts`

**Background:** `getActivatedSkills()` from `InstructionsLoader` returns skill names declared in `LUCENT.md`. These must be surfaced in the skill advertisement so the AI knows they're especially relevant. `SkillMatcher` auto-injection (`skillBlocks`) is removed — pull-only from here on.

**Step 1: Remove SkillMatcher from `message-handler.ts`**

Find and delete:
- Line `import { SkillMatcher } from '../skills/skill-matcher';`
- Line `private readonly skillMatcher = new SkillMatcher();`
- The `skillMatches` / `skillBlocks` block (lines ~250–259):
  ```ts
  const skillMatches = this.skillRegistry
    ? this.skillMatcher.match(content, this.skillRegistry.getSummaries())
    : [];
  const skillBlocks = skillMatches
    .map(...)
    .join('\n\n');
  const baseContent = skillBlocks ? `${skillBlocks}\n\n${processedContent}` : processedContent;
  ```
  Replace with:
  ```ts
  const baseContent = processedContent;
  ```

**Step 2: Expose activated skills in the system prompt advertisement**

In the system prompt construction (around line 216), update the skill advertisement to highlight activated skills:

```ts
const skillSummaries = this.skillRegistry?.getSummaries() ?? [];
const activatedSkills = this.contextBuilder.getActivatedSkills?.() ?? [];

if (skillSummaries.length > 0) {
  const activated = activatedSkills.length > 0
    ? `\n\n**Project-activated skills** (preferred for this workspace): ${activatedSkills.join(', ')}`
    : '';
  const advertisement = `\n\n## Available Skills\nThe following skills are available. Use the \`use_skill\` tool when relevant.${activated}\n\n${skillSummaries.map((s) => `- **${s.name}**: ${s.description}`).join('\n')}`;
  systemMessage.content += advertisement;
}
```

**Step 3: Add `getActivatedSkills()` to `ContextBuilder`**

In `src/core/context-builder.ts`, add a delegating method that reads from the `InstructionsLoader`:

```ts
getActivatedSkills(): string[] {
  return this.instructionsLoader?.getActivatedSkills() ?? [];
}
```

(The `instructionsLoader` field already exists on `ContextBuilder` — check `context-builder.ts` to confirm the field name and add the method after `getCustomInstructions()`.)

**Step 4: Update tests in `message-handler.test.ts`**

Find any test that asserts on `skillBlocks` pre-injection and remove or update those assertions. Add a test that the system prompt advertisement mentions activated skills when `getActivatedSkills` returns a non-empty array.

**Step 5: Run full test suite**

```bash
npm test
```

Expected: all tests PASS.

**Step 6: Commit**

```bash
git add src/chat/message-handler.ts src/core/context-builder.ts
git commit -m "feat(skills): pull-only loading — remove SkillMatcher, surface activated skills"
```

---

### Task 5: Add `use_model` tool with approval guard

**Files:**
- Modify: `src/lsp/editor-tools.ts`
- Modify: `src/lsp/editor-tools.test.ts`
- Modify: `src/chat/message-handler.ts`
- Modify: `src/shared/types.ts`
- Modify: `webview/src/components/ToolCallCard.tsx`

**Background:** `use_model` is a new tool that routes through `APPROVAL_GATED_TOOLS`. The approval card shows the current model, the requested model, and a price delta. On approval the extension posts `modelChanged` back to the webview. Scopes are "this message" (once) and "rest of conversation" (session).

**Step 1: Add tool definition to `editor-tools.ts`**

Add to `TOOL_DEFINITIONS` array:

```ts
{
  type: 'function',
  function: {
    name: 'use_model',
    description: 'Switch to a different OpenRouter model for subsequent messages. Use when the task needs stronger reasoning (upgrade) or is simple enough for a cheaper model (downgrade).',
    parameters: {
      type: 'object',
      properties: {
        model_id: { type: 'string', description: 'OpenRouter model ID, e.g. "anthropic/claude-opus-4-6"' },
        reason:   { type: 'string', description: 'Why this model suits the current task better' },
      },
      required: ['model_id'],
    },
  },
},
```

Add `'use_model'` to `APPROVAL_GATED_TOOLS` in `message-handler.ts`:

```ts
private static readonly APPROVAL_GATED_TOOLS = new Set([
  'write_file',
  'delete_file',
  'run_terminal_command',
  'use_model',
]);
```

**Step 2: Extend `toolApprovalRequest` message with optional `currentModel` and `requestedModel` fields**

In `src/shared/types.ts`, update the `toolApprovalRequest` union member:

```ts
| {
    type: 'toolApprovalRequest';
    requestId: string;
    toolName: string;
    args: Record<string, unknown>;
    diff?: DiffLine[];
    currentModel?: string;
    requestedModelPricing?: { prompt: string; completion: string };
  }
```

**Step 3: Add `use_model` handler in `EditorToolExecutor`**

In `src/lsp/editor-tools.ts` `execute` switch:
```ts
case 'use_model':
  return await this.useModel(args);
```

Add private method:
```ts
private async useModel(args: Record<string, unknown>): Promise<ToolResult> {
  const modelId = args.model_id as string;
  // Actual model switch is handled by MessageHandler after approval.
  // This method is only called when approval was already granted.
  return { success: true, message: `Switched to model: ${modelId}` };
}
```

**Step 4: In `MessageHandler`, after approval for `use_model`, switch the model**

In the `APPROVAL_GATED_TOOLS` approval block in `message-handler.ts`, add special handling after approval:

```ts
if (approved && tc.function.name === 'use_model') {
  const newModelId = (args as { model_id: string }).model_id;
  model = newModelId;  // `model` is the local variable used for API calls in the loop
  postMessage({ type: 'modelChanged', modelId: newModelId });
  if (scope === 'once') {
    this.approvalManager.approveForSession('use_model');
  }
}
```

Also pass `currentModel` to the approval request for the card to show the price delta:

```ts
postMessage({
  type: 'toolApprovalRequest',
  requestId,
  toolName: tc.function.name,
  args,
  currentModel: model,  // pass current model
});
```

**Step 5: Update `ToolCallCard` to show price delta for `use_model`**

In `webview/src/components/ToolCallCard.tsx`, add a computed display for when `toolName === 'use_model'`:

```tsx
<Show when={props.approval.toolName === 'use_model'}>
  <div class="tool-call-model-switch">
    <span class="tool-call-model-switch__label">Switch model</span>
    <span class="tool-call-model-switch__to">{(props.approval.args.model_id as string)}</span>
    <Show when={(props.approval.args as any).reason}>
      <span class="tool-call-model-switch__reason">{(props.approval.args as any).reason}</span>
    </Show>
  </div>
</Show>
```

**Step 6: Write tests**

In `editor-tools.test.ts`, add `describe('use_model')` with a test that `execute('use_model', { model_id: 'x' })` returns `success: true`.

In `message-handler.test.ts`, add a test that when `use_model` is called and approved, `postMessage` receives `{ type: 'modelChanged', modelId: 'x' }`.

**Step 7: Run full test suite**

```bash
npm test && npm run build
```

Expected: all tests PASS, build succeeds.

**Step 8: Commit**

```bash
git add src/lsp/editor-tools.ts src/lsp/editor-tools.test.ts src/chat/message-handler.ts src/shared/types.ts webview/src/components/ToolCallCard.tsx
git commit -m "feat(tools): add use_model tool with scoped approval and model switch"
```

---

### Task 6: Add `@model()` mention to chat input

**Files:**
- Modify: `webview/src/components/ChatInput.tsx`
- Modify: `webview/src/App.tsx`
- Modify: `webview/src/stores/chat.ts`
- Modify: `src/shared/types.ts`

**Background:** Typing `@model(` in the chat input opens a fuzzy-search dropdown over the loaded model list. When the user selects a model, a chip is inserted and the model switches immediately on send — no approval needed because the user explicitly triggered it.

**Step 1: Add `@model` to `MENTION_SOURCES` in `ChatInput.tsx`**

```ts
const MENTION_SOURCES: MentionSource[] = [
  // ... existing entries ...
  { id: 'model', label: '@model', description: 'Switch to a different AI model', kind: 'action' },
];
```

**Step 2: Handle `@model` mention resolution**

In `ChatInput.tsx`, when the user selects the `model` mention, instead of resolving to a string, open a secondary model picker dropdown (reuse the existing `ModelSelector` dropdown logic or show a filtered list of `props.models`).

When a model is selected via `@model`:
- Insert a chip showing the model name
- On send, strip the chip from the message content and call `props.onSelectModel(modelId)` before `props.onSend`

The simplest implementation: treat `@model` as a special mention that, when clicked, opens the existing `ModelSelector` inline. On model selection, call `props.onSelectModel` and confirm with a small toast/label: "Model switched to X".

**Step 3: Expose model switching via message in `App.tsx`**

No change needed — `onSelectModel` already calls `chatStore.selectModel` which posts `setModel` to the extension.

**Step 4: Run full test suite**

```bash
npm test && npm run build
```

Expected: all tests PASS, build succeeds.

**Step 5: Commit**

```bash
git add webview/src/components/ChatInput.tsx
git commit -m "feat(chat): add @model() mention for user-initiated model switching"
```

---

### Task 7: Add CSS styles for `use_model` approval card

**Files:**
- Modify: `webview/src/styles.css`

**Step 1: Add styles**

```css
.tool-call-model-switch {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 10px;
  font-size: 12px;
}

.tool-call-model-switch__label {
  color: var(--vscode-descriptionForeground, #888);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.tool-call-model-switch__to {
  font-family: var(--vscode-editor-font-family, monospace);
  color: var(--vscode-foreground, #ccc);
}

.tool-call-model-switch__reason {
  color: var(--vscode-descriptionForeground, #888);
  font-style: italic;
}
```

**Step 2: Run full test suite**

```bash
npm test
```

Expected: all tests PASS.

**Step 3: Commit**

```bash
git add webview/src/styles.css
git commit -m "feat(chat): style use_model approval card"
```

---

### Task 8: Update docs and marketing site

**Files:**
- Modify: `docs/` — feature documentation
- Modify: marketing site files (check `website/` or `marketing/` directory)

**Step 1: Check marketing site location**

```bash
ls c:/Projects/Prive/OpenRouterChat/website 2>/dev/null || ls c:/Projects/Prive/OpenRouterChat/marketing 2>/dev/null || echo "check repo"
```

**Step 2: Add feature to docs**

Create `docs/features/lucent-md.md` documenting:
- `LUCENT.md` file format with `@skill()` syntax
- Built-in skill list with one-line descriptions
- Claude Code compatibility (auto-detects `~/.claude/skills/`)
- `use_model` usage and when to use it
- `@model()` mention

**Step 3: Update marketing copy**

Add to the marketing site's features section:
- **Smart skill system** — ship built-in coding skills, or bring your own from Claude Code or Cursor
- **Model-aware skills** — skills can recommend the best model for the task
- **`LUCENT.md`** — one file controls project conventions, compatible with `.cursorrules` and `CLAUDE.md`

**Step 4: Commit**

```bash
git add docs/ website/  # or marketing/
git commit -m "docs: document LUCENT.md, built-in skills, use_model feature"
```
