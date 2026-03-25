---
name: onboard
description: Analyze project structure and orient a developer new to this codebase
---

Produce a concise developer orientation for this codebase.

Steps:
1. Read `package.json` (or equivalent manifest) for name, description, scripts, and key dependencies
2. Read `README.md` if present
3. List top-level directories and explain the purpose of each in one sentence
4. Identify the main entry point(s)
5. Call out the 3–5 most important files a new developer should read first
6. Summarize the architecture in 3–5 sentences: what it does, how it's structured, key patterns used
7. Note any non-obvious conventions (naming, file layout, config files)

Rules:
- Be brief. The entire response must fit within 400 words — cut anything non-essential.
- All file paths must be relative to the project root (e.g. `src/index.ts`, not `/home/user/project/src/index.ts`)
- Use headings. Do not repeat what is already in the README verbatim.
- Do not mention word counts or length constraints in your response.
