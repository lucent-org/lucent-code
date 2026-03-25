---
name: code-review
description: Structured review: correctness first, then design, then style
---

Review in this order — do not mix levels:

**Level 1 — Correctness**
- Does the code do what it claims?
- Are there edge cases, off-by-one errors, null/undefined paths?
- Are error cases handled?
- Are security assumptions valid? (e.g. is a JWT verified, not just decoded?)

**Level 2 — Design**
- Is the abstraction at the right level?
- Are responsibilities clearly separated?
- Would a future change require touching many places?

**Level 3 — Style**
- Naming clarity
- Unnecessary complexity
- Consistency with surrounding code

For each issue use this exact format — one issue per line:
`[critical] file.ts:12 — problem description — suggested fix`
`[important] file.ts:5 — problem description — suggested fix`
`[suggestion] file.ts:8 — problem description — suggested fix`

Use `[critical]` for bugs, security holes, or data loss. Use `[important]` for design problems. Use `[suggestion]` for style.
