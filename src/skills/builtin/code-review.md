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
