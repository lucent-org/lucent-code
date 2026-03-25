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
