---
name: tests
description: Generate tests for selected code using the project's existing test framework
---

Generate tests for the selected code or the active function/class.

Rules:
1. Identify the project's test framework from existing test files (Jest, Vitest, pytest, etc.)
2. Write tests that cover: happy path, edge cases (empty input, null, boundary values), and error cases
3. Each test has one assertion focus — do not bundle multiple behaviours in one test
4. Name tests descriptively: "returns empty array when input is null", not "test1"
5. Do not mock what you can test directly
