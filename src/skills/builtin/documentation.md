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
