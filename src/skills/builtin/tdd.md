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
