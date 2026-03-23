// Built-in skill content is inlined here so esbuild bundles it as module text —
// no runtime file I/O, survives extension packaging.
export const BUILTIN_SKILLS: readonly string[] = [
  `---
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
`,
  `---
name: clean-commits
description: Small, focused commits in conventional format — one logical change per commit
---

Each commit must:
- Contain exactly one logical change (one bug fix, one feature, one refactor)
- Use the format: \`type(scope): short description\` where type is feat/fix/refactor/test/docs/chore
- Have a subject line under 72 characters
- Never mix unrelated changes (e.g. fix + refactor in one commit)

Stage only files related to the current change. Use \`git add <specific-files>\`, not \`git add .\`.
Commit as soon as a logical unit of work is complete — do not accumulate changes.
`,
  `---
name: refactor
description: Safe refactoring: tests first, one change at a time, no behaviour changes
---

Refactoring rules:
1. Ensure tests exist and pass before touching any code
2. Make one structural change at a time (rename, extract, inline, move)
3. Run tests after each change — never batch multiple refactors before testing
4. A refactor must not change observable behaviour — if tests break, revert
5. Commit each refactor step separately with a \`refactor:\` prefix

If tests do not exist, write them first (use the \`tdd\` skill). Never refactor untested code.
`,
  `---
name: debugging
description: Systematic root-cause debugging — find the cause before attempting any fix
---

Phase 1 — Find the root cause (do this before writing any fix):
1. Read the error message completely, including the full stack trace
2. Reproduce the failure reliably — identify exact steps
3. Check recent changes that could be responsible (\`git log\`, \`git diff\`)
4. Add diagnostic output at each component boundary to locate where the failure originates
5. Trace data flow backward from the symptom until you find the source

Phase 2 — Fix:
1. Write a failing test that reproduces the bug
2. Make the minimum change that fixes the root cause
3. Verify the test passes and no other tests regress

Never attempt a fix before completing Phase 1. If three fixes have failed, stop and question the architecture.
`,
  `---
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
Prefix severity: \`[critical]\`, \`[important]\`, \`[suggestion]\`.
`,
  `---
name: documentation
description: Write minimal, accurate docs — no padding, no restating what the code says
---

Rules:
- Document WHY, not WHAT — the code shows what; the comment shows why
- If the code is self-explanatory, add no comment
- Function docs: describe what callers need to know (preconditions, side effects, return value)
- Never restate the function name in the doc ("Gets the user" for \`getUser\` is noise)
- Keep docs up to date — a wrong doc is worse than no doc
- Prefer short inline comments over large doc blocks for local context
`,
];
