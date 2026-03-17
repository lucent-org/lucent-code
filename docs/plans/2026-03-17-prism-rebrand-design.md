# Prism — Rebrand Design

**Date:** 2026-03-17
**Status:** Approved

---

## Goal

Rename and reposition the extension from "OpenRouter Chat" to **Prism** — a distinct, visually memorable brand that stands out in the VS Code marketplace AI category and communicates our core differentiator: LSP-first code understanding over text search.

---

## Name

**Prism**

- Publisher ID: `prismcode`
- Extension ID: `prismcode.prism`
- Display name: `Prism`

### Why Prism

A prism *refracts* — it separates what looks uniform (source text) into its true components (types, symbols, definitions, references). That is exactly what LSP does compared to grep. The name carries the LSP differentiation story visually without requiring jargon.

Short, single-word, memorable — same tier as Cursor, Cody, Continue.

---

## Marketplace Positioning

### Short description (shown in search results, ~120 chars)

```
The only VS Code AI that uses your language server — not text search. Chat, completions, and code intelligence in one.
```

### Category

`AI`

### Tags

```
ai, chat, lsp, code-intelligence, completions, openrouter,
inline-completions, semantic, all-in-one, chat-assistant
```

---

## Visual Identity

### Gallery banner

```json
{
  "color": "#0d0d1a",
  "theme": "dark"
}
```

Dark background — the **only** dark banner in the VS Code AI category. Every competitor (Copilot, Continue, Cody, Windsurf) uses the default light gray `#eff1f3`. This alone makes Prism visually distinctive in any search results list.

### Icon concept

- Triangular prism (2D side-on silhouette), dark background
- White/light beam entering the left face
- Spectrum fan (violet → blue → green → yellow → orange) exiting the right face
- Spectrum ray colors echo syntax highlighting — the LSP story told visually
- Scales cleanly to 16×16 (triangle silhouette with color hint), 32×32, 128×128
- SVG source + PNG exports at 128×128 (marketplace) and 32×32 (activity bar)
- File: `images/icon.svg` (source), `images/icon.png` (128×128 marketplace)

---

## Files to Change

| File | Change |
|---|---|
| `package.json` | `name`, `displayName`, `description`, `publisher`, `galleryBanner`, `icon`, `keywords` |
| `images/icon.svg` | New — prism SVG source |
| `images/icon.png` | New — 128×128 PNG export for marketplace |
| `webview/index.html` | Page `<title>` updated to `Prism` |
| `webview/src/App.tsx` (or equivalent) | Any hardcoded "OpenRouter Chat" display strings |
| `README.md` | Full rewrite for marketplace listing — name, tagline, feature sections, screenshots |
| `CHANGELOG.md` | New entry for rebrand |

### Strings to find and replace globally

| Old | New |
|---|---|
| `OpenRouter Chat` | `Prism` |
| `openrouter-chat` | `prism` (extension ID parts) |
| `openRouterChat` | `prism` (command/setting prefixes — with migration note) |

> **Note:** VSCode command IDs and setting keys (`openRouterChat.*`) are public API surface. A transition period with both old and new IDs, or a clear CHANGELOG entry, is advisable if users have keybindings set.

---

## What Does NOT Change

- All functionality — LSP tools, HITL approval, web search, history, OAuth
- Architecture, file structure, test suite
- OpenRouter as the backend (stays in description, not name)
- The `--vscode-*` CSS variable pattern in the webview

---

## Tagline Hierarchy

| Context | Text |
|---|---|
| Marketplace short description | *The only VS Code AI that uses your language server — not text search. Chat, completions, and code intelligence in one.* |
| README hero line | *See your code in a new light.* |
| Activity bar tooltip | `Prism` |
| Empty state heading (webview) | `Prism` |
