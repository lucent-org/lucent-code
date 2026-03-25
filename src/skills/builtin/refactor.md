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
