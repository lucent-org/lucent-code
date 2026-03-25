# Lucent Code Documentation Site — Design

## Goal

Build a Docusaurus 3.x documentation site for Lucent Code, covering both end-user guides and developer reference, styled with the Lucent Code brand, deployed to Cloudflare Pages.

## Architecture

**Location:** `docs-site/` at repo root — fully self-contained package, separate from internal planning docs in `docs/` and the marketing site in `marketing/`.

**Deployment:** Cloudflare Pages pointing at `docs-site/` with build command `npm run build`, output directory `build`, Node 20.

**Relationship to marketing site:** `lucentcode.dev` remains the primary public-facing site. The docs site links back to it. No marketing content is duplicated.

## Tech Stack

- Docusaurus 3.x (TypeScript config)
- `@docusaurus/preset-classic` with dark mode default
- Google Fonts: Syne (headings), DM Sans (body), JetBrains Mono (code)
- Cloudflare Pages for hosting

## Site Structure

```
docs-site/
  docusaurus.config.ts
  sidebars.ts
  src/
    css/custom.css          # Brand token overrides
    pages/index.tsx         # Docs home (logo + links, no marketing copy)
  docs/
    user-guide/
      getting-started.md
      chat-interface.md
      model-selection.md
      skills-and-commands.md
      file-attachments.md
      autonomous-mode.md
      mcp-servers.md
    developer/
      architecture.md
      adding-skills.md
      openrouter-integration.md
      tools-and-mcp.md
      building-locally.md
      contributing.md
  static/
    img/
      icon.svg              # copied from images/icon.svg
```

## Styling

Docusaurus CSS tokens mapped from the Lucent Code design system (`marketing/src/styles/tokens.css`):

| Docusaurus token | Value | Source token |
|---|---|---|
| `--ifm-color-primary` | `#6366F1` | `--color-primary` |
| `--ifm-color-primary-dark` | `#4F46E5` | `--color-primary-hover` |
| `--ifm-color-primary-darker` | `#4338CA` | — |
| `--ifm-color-primary-darkest` | `#3730A3` | — |
| `--ifm-color-primary-light` | `#818CF8` | — |
| `--ifm-color-primary-lighter` | `#A5B4FC` | — |
| `--ifm-color-primary-lightest` | `#C7D2FE` | — |
| `--ifm-background-color` (dark) | `#08090F` | `--color-dark-base` |
| `--ifm-navbar-background-color` (dark) | `#0F1017` | `--color-dark-surface` |
| `--ifm-font-family-base` | `'DM Sans'` | `--font-body` |
| `--ifm-heading-font-family` | `'Syne'` | `--font-display` |
| `--ifm-font-family-monospace` | `'JetBrains Mono'` | `--font-mono` |

Cyan `#22D3EE` used as link hover / active accent. Gradient text (`#818CF8 → #C084FC → #22D3EE`) on hero heading.

Dark mode is the default. Light mode supported using standard Docusaurus light palette with `--color-background: #F8F9FC`.

## Docs Home Page (`src/pages/index.tsx`)

Minimal — not a marketing page:
- Lucent Code logo (SVG) centered
- Tagline: "Write code in a new light"
- Two buttons: "Get Started →" (links to `/docs/user-guide/getting-started`) and "← lucentcode.dev"
- No feature lists, screenshots, or marketing copy

## Content Outline

### User Guide

| Page | Content |
|---|---|
| `getting-started.md` | Install from VS Code marketplace, set OpenRouter API key, start first chat |
| `chat-interface.md` | Conversations, history sidebar, compact conversation, export |
| `model-selection.md` | How model selector works, cost indicator, reasoning models ("thinking" badge), which model to use when |
| `skills-and-commands.md` | What skills are, `/` to invoke, full list of built-in skills, loading custom skills from `~/.claude/skills/`, superpowers marketplace |
| `file-attachments.md` | Attaching images, attach files via paperclip, `@codebase` search |
| `autonomous-mode.md` | Agentic mode, tool approval flow, approval scopes, git worktrees |
| `mcp-servers.md` | What MCP is, adding servers via `claude mcp add`, `@server` mentions in chat |

### Developer Reference

| Page | Content |
|---|---|
| `architecture.md` | Extension ↔ webview postMessage protocol, shared types, message flow diagram |
| `adding-skills.md` | Frontmatter spec (`name`, `description`), skill body format, skill sources (builtin / claude / github / npm / marketplace / local), adding custom skills |
| `openrouter-integration.md` | API key setup, streaming, token usage tracking, credit display, supported model parameters |
| `tools-and-mcp.md` | Tool definition format, approval request flow, MCP server bridge, tool result rendering |
| `building-locally.md` | Prerequisites, `npm install`, esbuild config, `F5` debug launch, `.md` text loader |
| `contributing.md` | Commit style, PR process, adding built-in skills, regression test scripts |

## Cloudflare Pages Config

```
Root directory:    docs-site
Build command:     npm run build
Build output:      build
Node version:      20
```

Add `docs-site` as build root in Cloudflare Pages dashboard. No `wrangler.toml` needed for static hosting.
