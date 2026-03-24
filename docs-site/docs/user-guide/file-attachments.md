---
sidebar_position: 5
title: File Attachments
description: Attach images, source files, and search your entire codebase with @codebase.
---

# File Attachments

## Attaching Files

Click the **paperclip icon** (📎) in the chat input toolbar to attach a file from your filesystem.

Supported:
- **Images** — PNG, JPG, GIF, WebP (pasted or attached)
- **Text files** — any source file up to 5 MB

Paste an image directly with `Ctrl+V` — it attaches automatically.

## @file Mention

Type `@file` in the chat input to fuzzy-search across all workspace files and attach one as context:

1. Type `@file`
2. Continue typing to filter by filename
3. Press Enter to attach

The file content is included in your message. Useful when you want to ask about a specific file without it being your active editor.

## @codebase — Semantic Search

Type `@codebase` followed by your query to search the entire workspace using semantic (vector) search:

```
@codebase how does authentication work?
```

Lucent Code indexes your workspace in the background when you open a folder. The `@codebase` mention retrieves the most relevant code snippets and injects them as context.

The status bar shows the index state: **Indexing…**, **Indexed**, or **Not indexed**.

:::note
`@codebase` requires your workspace to be indexed. Indexing runs automatically but may take a minute for large repos. You can trigger it manually with **Lucent Code: Index Workspace** from the Command Palette.
:::

## @terminal Mention

Type `@terminal` to inject the last 200 lines from your active integrated terminal. Useful for sharing error output or build logs with the AI.
