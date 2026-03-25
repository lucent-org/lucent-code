---
name: commit
description: Generate a conventional commit message from the current git diff
---

Generate a commit message for the current staged or unstaged changes.

Steps:
1. Call `run_terminal_command` with: `git diff --staged || git diff HEAD`
2. Read the diff output carefully
3. Write a commit message in conventional format: `type(scope): short description`
   - type: feat / fix / refactor / test / docs / chore / style
   - scope: the module or area affected (optional but helpful)
   - description: imperative mood, under 72 characters, no trailing period
4. If the diff contains multiple logical changes, note them as bullet points in the commit body
5. Do not include "Co-authored-by" or tool attribution lines

Your response must be the raw commit message text and nothing else.
Do not explain your reasoning. Do not describe what changed. Do not add any text before or after the commit message.
