---
name: doc
description: Generate documentation for selected code or the active file
---

Generate documentation for the selected code or the active function/class in the editor.

Rules:
- Match the language's doc format exactly: JSDoc for JavaScript/TypeScript, docstrings for Python, doc comments for Rust/Go
- First sentence: describe the behaviour from the caller's perspective (what it does, not what it is named)
- Document parameters (name, type, purpose) and return value
- Call out side effects and preconditions if any exist
- Do not restate the function name — "Gets the user" for `getUser` is noise
- If no code is selected, document the primary exported symbol in the active file
- Keep documentation concise — no padding, no filler phrases
