# Lucent Code Documentation Site — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Docusaurus 3.x documentation site in `docs-site/` at the repo root, styled with the Lucent Code brand, covering both end-user guides and developer reference, deployable to Cloudflare Pages.

**Architecture:** `docs-site/` is a self-contained npm package at the repo root. It reads no source from `src/` or `webview/` — all content is hand-written Markdown. Brand tokens are mapped from `marketing/src/styles/tokens.css` into Docusaurus `--ifm-*` CSS custom properties. Internal planning docs in `docs/` are untouched.

**Tech Stack:** Docusaurus 3.7, React 18, TypeScript, Google Fonts (Syne + DM Sans + JetBrains Mono), Cloudflare Pages static hosting.

**Reference files to read before starting:**
- `marketing/src/styles/tokens.css` — brand color tokens
- `images/icon.svg` — logo to copy into `docs-site/static/img/`
- `docs/plans/2026-03-24-lucent-code-docs-design.md` — approved design

---

## Task 1: Scaffold Docusaurus package

**Files:**
- Create: `docs-site/package.json`
- Create: `docs-site/tsconfig.json`
- Create: `docs-site/docusaurus.config.ts`
- Create: `docs-site/sidebars.ts`
- Create: `docs-site/.gitignore`

**Step 1: Create `docs-site/package.json`**

```json
{
  "name": "lucent-code-docs",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "docusaurus start",
    "build": "docusaurus build",
    "clear": "docusaurus clear",
    "serve": "docusaurus serve"
  },
  "dependencies": {
    "@docusaurus/core": "3.7.0",
    "@docusaurus/preset-classic": "3.7.0",
    "@mdx-js/react": "^3.0.0",
    "clsx": "^2.0.0",
    "prism-react-renderer": "^2.3.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "@docusaurus/module-type-aliases": "3.7.0",
    "@docusaurus/tsconfig": "3.7.0",
    "@docusaurus/types": "3.7.0",
    "typescript": "~5.2.2"
  },
  "engines": {
    "node": ">=18.0"
  }
}
```

**Step 2: Create `docs-site/tsconfig.json`**

```json
{
  "extends": "@docusaurus/tsconfig",
  "compilerOptions": {
    "baseUrl": "."
  }
}
```

**Step 3: Create `docs-site/docusaurus.config.ts`**

```typescript
import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Lucent Code',
  tagline: 'Write code in a new light',
  favicon: 'img/icon.svg',
  url: 'https://docs.lucentcode.dev',
  baseUrl: '/',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },
  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: 'docs',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],
  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
    image: 'img/icon.svg',
    navbar: {
      title: 'Lucent Code',
      logo: {
        alt: 'Lucent Code Logo',
        src: 'img/icon.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'userGuideSidebar',
          position: 'left',
          label: 'User Guide',
        },
        {
          type: 'docSidebar',
          sidebarId: 'developerSidebar',
          position: 'left',
          label: 'Developer',
        },
        {
          href: 'https://lucentcode.dev',
          label: 'lucentcode.dev',
          position: 'right',
        },
        {
          href: 'https://marketplace.visualstudio.com/items?itemName=lucentcode.lucent-code',
          label: 'Install',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Getting Started', to: '/docs/user-guide/getting-started' },
            { label: 'Skills & Commands', to: '/docs/user-guide/skills-and-commands' },
            { label: 'Developer Reference', to: '/docs/developer/architecture' },
          ],
        },
        {
          title: 'Links',
          items: [
            { label: 'lucentcode.dev', href: 'https://lucentcode.dev' },
            {
              label: 'VS Code Marketplace',
              href: 'https://marketplace.visualstudio.com/items?itemName=lucentcode.lucent-code',
            },
            { label: 'GitHub', href: 'https://github.com/lucent-org/lucent-code' },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Lucent Code.`,
    },
    prism: {
      theme: prismThemes.vsDark,
      darkTheme: prismThemes.vsDark,
      additionalLanguages: ['typescript', 'bash', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
```

**Step 4: Create `docs-site/sidebars.ts`**

```typescript
import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  userGuideSidebar: [
    {
      type: 'category',
      label: 'User Guide',
      collapsed: false,
      items: [
        'user-guide/getting-started',
        'user-guide/chat-interface',
        'user-guide/model-selection',
        'user-guide/skills-and-commands',
        'user-guide/file-attachments',
        'user-guide/autonomous-mode',
        'user-guide/mcp-servers',
      ],
    },
  ],
  developerSidebar: [
    {
      type: 'category',
      label: 'Developer Reference',
      collapsed: false,
      items: [
        'developer/architecture',
        'developer/adding-skills',
        'developer/openrouter-integration',
        'developer/tools-and-mcp',
        'developer/building-locally',
        'developer/contributing',
      ],
    },
  ],
};

export default sidebars;
```

**Step 5: Create `docs-site/.gitignore`**

```
node_modules/
build/
.docusaurus/
```

**Step 6: Install dependencies**

```bash
cd docs-site && npm install
```

Expected: `node_modules/` populated, no errors.

**Step 7: Verify dev server starts**

```bash
cd docs-site && npm start
```

Expected: Browser opens at `http://localhost:3000` with default Docusaurus site. Ctrl+C to stop.

**Step 8: Commit**

```bash
cd ..
git add docs-site/package.json docs-site/package-lock.json docs-site/tsconfig.json docs-site/docusaurus.config.ts docs-site/sidebars.ts docs-site/.gitignore
git commit -m "feat(docs): scaffold Docusaurus 3.7 in docs-site/"
```

---

## Task 2: Brand styling, logo, home page

**Files:**
- Create: `docs-site/src/css/custom.css`
- Create: `docs-site/src/pages/index.tsx`
- Create: `docs-site/src/pages/index.module.css`
- Create: `docs-site/static/img/icon.svg` (copy from `images/icon.svg`)

**Step 1: Copy logo**

```bash
cp images/icon.svg docs-site/static/img/icon.svg
```

Also create `docs-site/static/img/` if it doesn't exist yet.

**Step 2: Create `docs-site/src/css/custom.css`**

```css
/* ============================================================
   Lucent Code — Docusaurus brand overrides
   Tokens sourced from marketing/src/styles/tokens.css
   ============================================================ */

@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap');

/* ---- Light mode ---- */
:root {
  --ifm-color-primary: #6366f1;
  --ifm-color-primary-dark: #4f46e5;
  --ifm-color-primary-darker: #4338ca;
  --ifm-color-primary-darkest: #3730a3;
  --ifm-color-primary-light: #818cf8;
  --ifm-color-primary-lighter: #a5b4fc;
  --ifm-color-primary-lightest: #c7d2fe;

  --ifm-font-family-base: 'DM Sans', system-ui, -apple-system, sans-serif;
  --ifm-heading-font-family: 'Syne', system-ui, sans-serif;
  --ifm-font-family-monospace: 'JetBrains Mono', 'Fira Code', monospace;

  --ifm-code-font-size: 90%;
  --docusaurus-highlighted-code-line-bg: rgba(99, 102, 241, 0.1);
}

/* ---- Dark mode ---- */
[data-theme='dark'] {
  --ifm-color-primary: #818cf8;
  --ifm-color-primary-dark: #6366f1;
  --ifm-color-primary-darker: #4f46e5;
  --ifm-color-primary-darkest: #4338ca;
  --ifm-color-primary-light: #a5b4fc;
  --ifm-color-primary-lighter: #c7d2fe;
  --ifm-color-primary-lightest: #e0e7ff;

  --ifm-background-color: #08090f;
  --ifm-background-surface-color: #0f1017;
  --ifm-navbar-background-color: #0f1017;
  --ifm-footer-background-color: #08090f;
  --ifm-toc-border-color: rgba(255, 255, 255, 0.08);
  --ifm-color-content: #f1f5f9;
  --ifm-color-content-secondary: #94a3b8;
  --ifm-hr-border-color: rgba(255, 255, 255, 0.08);

  --docusaurus-highlighted-code-line-bg: rgba(129, 140, 248, 0.15);
}

/* ---- Typography ---- */
h1, h2, h3, h4, h5, h6 {
  font-family: var(--ifm-heading-font-family);
}

/* ---- Navbar ---- */
[data-theme='dark'] .navbar {
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.navbar__logo img {
  height: 28px;
  width: 28px;
}

/* ---- Sidebar ---- */
[data-theme='dark'] .menu {
  background-color: #0f1017;
}

/* ---- Code blocks ---- */
[data-theme='dark'] .prism-code {
  background-color: #16171f !important;
}

/* ---- Admonitions ---- */
[data-theme='dark'] .alert {
  border-left-color: var(--ifm-color-primary);
}

/* ---- Footer ---- */
[data-theme='dark'] .footer {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

/* ---- Gradient text utility (used on home page) ---- */
.gradient-text {
  background: linear-gradient(90deg, #818cf8, #c084fc, #22d3ee);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* ---- Cyan accent for links on dark ---- */
[data-theme='dark'] a:hover {
  color: #22d3ee;
}
```

**Step 3: Create `docs-site/src/pages/index.module.css`**

```css
.heroBanner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - var(--ifm-navbar-height));
  text-align: center;
  padding: 4rem 2rem;
  gap: 1.5rem;
}

.logo {
  width: 96px;
  height: 96px;
}

.title {
  font-size: 3rem;
  font-weight: 800;
  margin: 0;
  line-height: 1.1;
}

.tagline {
  font-size: 1.25rem;
  color: var(--ifm-color-content-secondary);
  margin: 0;
}

.buttons {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 0.5rem;
}
```

**Step 4: Create `docs-site/src/pages/index.tsx`**

```tsx
import React from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import styles from './index.module.css';

export default function Home(): React.JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title="Docs" description="Lucent Code documentation">
      <main className={styles.heroBanner}>
        <img src="img/icon.svg" alt="Lucent Code" className={styles.logo} />
        <h1 className={`${styles.title} gradient-text`}>{siteConfig.title}</h1>
        <p className={styles.tagline}>{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link
            className="button button--primary button--lg"
            to="/docs/user-guide/getting-started"
          >
            Get Started →
          </Link>
          <Link
            className="button button--secondary button--lg"
            href="https://lucentcode.dev"
          >
            ← lucentcode.dev
          </Link>
        </div>
      </main>
    </Layout>
  );
}
```

**Step 5: Verify build still works**

```bash
cd docs-site && npm run build
```

Expected: `build/` directory created, no TypeScript or broken-link errors.

**Step 6: Commit**

```bash
cd ..
git add docs-site/src/ docs-site/static/
git commit -m "feat(docs): apply Lucent Code brand styling and home page"
```

---

## Task 3: User Guide — Getting Started + Chat Interface

**Files:**
- Create: `docs-site/docs/user-guide/getting-started.md`
- Create: `docs-site/docs/user-guide/chat-interface.md`

**Step 1: Create `docs-site/docs/user-guide/getting-started.md`**

```markdown
---
sidebar_position: 1
title: Getting Started
description: Install Lucent Code, connect your OpenRouter account, and start your first AI-assisted coding session.
---

# Getting Started

Lucent Code is a VS Code extension that brings AI-assisted coding to your editor via [OpenRouter](https://openrouter.ai) — a unified API giving you access to hundreds of models from Anthropic, Google, OpenAI, Meta, and more.

## Requirements

- VS Code 1.85 or later
- An [OpenRouter](https://openrouter.ai) account (free tier available)

## Install the Extension

1. Open VS Code
2. Press `Ctrl+P` (or `Cmd+P` on macOS) and run:
   ```
   ext install lucentcode.lucent-code
   ```
   Or search **Lucent Code** in the Extensions sidebar.

3. Click **Install**.

## Get an OpenRouter API Key

1. Go to [openrouter.ai/keys](https://openrouter.ai/keys)
2. Click **Create Key**
3. Copy the key — it starts with `sk-or-v1-`

OpenRouter offers a free tier with access to many models. You only pay for what you use on paid models.

## Set Your API Key

After installing, VS Code will prompt you to enter your API key automatically. If you miss the prompt:

1. Open the Command Palette (`Ctrl+Shift+P`)
2. Run **Lucent Code: Set API Key**
3. Paste your key and press Enter

Your key is stored securely in VS Code's encrypted secret storage — it never leaves your machine in plaintext.

## Open the Chat Panel

- Click the **Lucent Code icon** in the Activity Bar (left sidebar)
- Or press `Ctrl+Shift+L` to focus the chat panel
- Or run **Lucent Code: Open Chat** from the Command Palette

## Select a Model

Click the model name button at the **bottom of the chat panel** to open the model picker. Type to search. Each model shows its price per million tokens. Start with a free model if you're just exploring.

See [Model Selection](./model-selection) for guidance on which model to choose.

## Start Chatting

Type a message and press **Enter** to send. The extension automatically includes:
- The file you're currently editing
- Your cursor position
- Any selected text
- Open editor tabs
- Active diagnostics (errors/warnings)

Try: *"Explain what this file does"* or *"Refactor this function to use async/await"*.

## Next Steps

- [Chat Interface](./chat-interface) — keyboard shortcuts, history, exporting
- [Model Selection](./model-selection) — picking the right model
- [Skills & Commands](./skills-and-commands) — slash commands like `/code-review`
- [Autonomous Mode](./autonomous-mode) — let the AI make edits directly
```

**Step 2: Create `docs-site/docs/user-guide/chat-interface.md`**

```markdown
---
sidebar_position: 2
title: Chat Interface
description: How to use the chat panel — sending messages, keyboard shortcuts, conversation history, and applying code.
---

# Chat Interface

## Sending Messages

- **Enter** — send message
- **Shift+Enter** — insert a newline
- The input grows automatically as you type

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+L` | Focus the chat input |
| `Ctrl+Shift+N` | Start a new chat |
| `Ctrl+Shift+P` → **Lucent Code: New Chat** | New chat via Command Palette |

## Context Mentions

Type `@` in the chat input to insert context:

| Mention | What it adds |
|---|---|
| `@terminal` | Last 200 lines of the active terminal |
| `@file` | Fuzzy-search and attach any workspace file |
| `@fix` | Prefixes your message with a focused fix prompt |
| `@explain` | Prefixes your message with an explain prompt |
| `@model` | Opens the model picker to switch model inline |
| `@codebase` | Semantic search across your indexed workspace |

## Skills (Slash Commands)

Type `/` to open the skills menu and invoke a built-in or custom skill. See [Skills & Commands](./skills-and-commands).

## Applying Code

When the AI responds with a code block, three action buttons appear:

- **Copy** — copy to clipboard
- **Insert at cursor** — paste at your current editor cursor position
- **Apply to file** — apply as a workspace edit with a diff preview

The **Apply** button shows an inline diff for single-change responses. For larger changes it opens VS Code's native diff editor so you can review before accepting.

## Conversation History

Every conversation is **automatically saved** with an AI-generated title.

Access history via the **conversation list** in the chat panel header. Click any conversation to load it.

**Delete** a conversation by hovering and clicking the trash icon.

**Export** a conversation via the `⋯` menu:
- **JSON** — full message history with metadata
- **Markdown** — readable format for sharing or archiving

## Cancelling a Response

Click the **Stop** button (appears while the AI is generating) to cancel mid-stream.

## Compacting a Conversation

Long conversations consume more of the model's context window and cost more per message. Use `/compact` to summarise and compress the history:

1. Type `/compact` and press Enter
2. The AI generates a summary of the conversation so far
3. A visual divider marks the compaction point
4. Future messages reference the summary rather than the full history

This is especially useful after a long debugging session where you want to keep going without starting fresh.

## Context Window Indicator

The model selector shows a **context fill percentage** (e.g. `· 42%`) that grows as your conversation gets longer. When it hits 80% the indicator turns red — a good signal to compact or start a new chat.
```

**Step 3: Verify no broken links**

```bash
cd docs-site && npm run build 2>&1 | tail -20
```

Expected: Build succeeds. Fix any broken link warnings before continuing.

**Step 4: Commit**

```bash
cd ..
git add docs-site/docs/user-guide/
git commit -m "docs: add getting-started and chat-interface pages"
```

---

## Task 4: User Guide — Model Selection + Skills

**Files:**
- Create: `docs-site/docs/user-guide/model-selection.md`
- Create: `docs-site/docs/user-guide/skills-and-commands.md`

**Step 1: Create `docs-site/docs/user-guide/model-selection.md`**

```markdown
---
sidebar_position: 3
title: Model Selection
description: How to choose and switch models, understand pricing, and pick the right model for the job.
---

# Model Selection

Lucent Code uses [OpenRouter](https://openrouter.ai) to give you access to hundreds of AI models from every major provider. You can switch models at any time — even mid-conversation.

## The Model Selector

The **model selector button** lives at the bottom of the chat panel. It shows:

- **Model name** — e.g. `Claude Sonnet 4.5`
- **Thinking badge** — a purple `thinking` pill appears on reasoning models (see below)
- **Context fill %** — how much of the model's context window is used (turns red above 80%)

Click the button to open the model picker. Type to search by name or model ID.

Each model in the list shows:
- Its display name
- Pricing: `$X.XX · $Y.YY /1M` (prompt tokens · completion tokens per million)
- `free` for zero-cost models

## Switching Model Inline

Type `@model` in the chat input to open the model picker without leaving the keyboard.

## Reasoning Models

Some models (like DeepSeek R1, o1, Gemini 2.0 Flash Thinking) perform explicit chain-of-thought reasoning before responding. These show a **`thinking` badge** in the model selector.

Reasoning models:
- Produce higher-quality answers on complex problems
- Are slower and more expensive
- Consume extra tokens for the reasoning process (hidden but counted toward your budget)

## Choosing the Right Model

### For quick questions and iteration
**`google/gemini-flash-1.5`** or **`meta-llama/llama-3.1-8b-instruct:free`**
Fast, cheap, good for simple Q&A, quick explanations, and first-draft code.

### For everyday coding
**`anthropic/claude-sonnet-4-5`** or **`deepseek/deepseek-coder-v2`**
Strong code understanding, good context handling, reasonable cost. Best for most tasks.

### For complex reasoning and architecture
**`anthropic/claude-opus-4`** or **`deepseek/deepseek-r1`**
Use when you need deep analysis, architectural decisions, or working through a hard bug. Slower and more expensive — worth it for the hard problems.

### For free usage
Models with `free` in the price field cost nothing. Quality varies — Meta's Llama models are a good free starting point.

### For long contexts
Check the model's context window length in the picker. Claude models support up to 200K tokens; Gemini supports up to 1M tokens.

## Cost and Usage

After each response, Lucent Code shows:
- **Last message cost** — USD cost for that request
- **Session cost** — total spend in the current VS Code session
- **Credit balance** — your remaining OpenRouter credits

These appear in the status bar at the bottom of VS Code.

## Saving a Default Model

Open VS Code settings (`Ctrl+,`) and search for `lucentCode`. Set:
- `lucentCode.chat.model` — default model for chat
- `lucentCode.completions.model` — default model for inline code completions
```

**Step 2: Create `docs-site/docs/user-guide/skills-and-commands.md`**

```markdown
---
sidebar_position: 4
title: Skills & Commands
description: Slash commands that guide the AI with structured prompts — code review, refactoring, commit messages, and more.
---

# Skills & Commands

**Skills** are structured prompt templates that guide the AI to perform a specific task with consistent, high-quality output. Invoke them with a `/` slash command.

## Invoking a Skill

1. Click in the chat input
2. Type `/` — the skill picker opens showing all available skills
3. Continue typing to filter by name
4. Press **Enter** or click to select

The skill name appears as a **chip** in the input. Add your own context after the chip, then send.

Example: type `/code-review`, then add `focus on the auth module` — the AI will use the code review framework but focus on what you specified.

## Built-in Skills

These ship with Lucent Code and are always available:

### `/code-review`
Structured code review in three levels: correctness, design, and style.

Output format:
```
[critical] file.ts:12 — problem — suggested fix
[important] file.ts:5 — problem — suggested fix
[suggestion] file.ts:8 — problem — suggested fix
```

Use it on: the current file, a pasted function, or any code you want reviewed.

### `/refactor`
Systematic refactoring with explicit Before/After blocks. The AI states what changed and why before presenting the refactored code.

### `/debugging`
Root-cause debugging. The AI investigates the symptom, forms a hypothesis, suggests a minimal test, then proposes a fix — avoiding random guesses.

### `/tests`
Write unit tests for a function or module. Covers: happy path, edge cases, error cases, and boundary conditions.

### `/doc`
Write a JSDoc / docstring for a function. First sentence describes the behaviour from the caller's perspective, then `@param` and `@returns`.

### `/documentation`
Write a comprehensive documentation section: overview, prerequisites, step-by-step usage, configuration reference, and troubleshooting.

### `/commit`
Generate a Conventional Commits message for staged changes. Returns just the commit message — paste it straight into your terminal.

### `/clean-commits`
Review a list of commits and suggest squash/reword operations to produce a clean, meaningful git history before merging.

### `/onboard`
Generate an onboarding guide for new contributors: what the codebase does, how it's structured, how to run it, and where to start.

### `/compact`
Summarise the current conversation to free context window. A divider marks the compaction point in the UI.

## How Skills Work

When you invoke a skill, the full skill prompt is sent to the AI as context for your message. The AI follows the skill's instructions to structure its response.

Skills are loaded **on demand** — only the name and description appear in the system prompt (no context bloat). The full content is fetched when you invoke the skill.

## Custom Skills

You can add your own skills from multiple sources:

### From `~/.claude/skills/`

Create a directory `~/.claude/skills/my-skill/` with a `SKILL.md` file:

```markdown
---
name: my-skill
description: What this skill does in one sentence
---

Your prompt content here. Write clear instructions for the AI.
```

Lucent Code auto-loads all skills from `~/.claude/skills/` on startup.

### From the Superpowers Marketplace

If you have [Claude Code](https://claude.ai/code) installed with superpowers plugins, Lucent Code automatically discovers and loads those skills too. They appear in the skill picker grouped by source.

### From GitHub, npm, or a local directory

Use the **Add Skill Source** command (`Ctrl+Shift+P` → **Lucent Code: Add Skill Source**) to add:
- A GitHub repository URL
- An npm package name
- A local directory path

### Refreshing Skills

Run **Lucent Code: Refresh Skills** from the Command Palette to reload all sources.

## Skill Sources in the Picker

The skill picker groups skills by source:
- **Built-in** — shipped with Lucent Code
- **Claude** — from `~/.claude/skills/` or plugin cache
- **GitHub / npm / marketplace / local** — from external sources you've added

## LUCENT.md Project Instructions

Add a `LUCENT.md` file to your workspace root to give the AI persistent instructions about your project. Any `@skill(name)` lines in `LUCENT.md` auto-activate those skills for every conversation in that workspace.

Lucent Code also reads `CLAUDE.md`, `.cursorrules`, and `.clinerules` — same format.
```

**Step 3: Verify build**

```bash
cd docs-site && npm run build 2>&1 | grep -E "error|Error|broken" | head -20
```

Expected: No errors.

**Step 4: Commit**

```bash
cd ..
git add docs-site/docs/user-guide/model-selection.md docs-site/docs/user-guide/skills-and-commands.md
git commit -m "docs: add model-selection and skills-and-commands pages"
```

---

## Task 5: User Guide — File Attachments, Autonomous Mode, MCP

**Files:**
- Create: `docs-site/docs/user-guide/file-attachments.md`
- Create: `docs-site/docs/user-guide/autonomous-mode.md`
- Create: `docs-site/docs/user-guide/mcp-servers.md`

**Step 1: Create `docs-site/docs/user-guide/file-attachments.md`**

```markdown
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
```

**Step 2: Create `docs-site/docs/user-guide/autonomous-mode.md`**

```markdown
---
sidebar_position: 6
title: Autonomous Mode
description: Let the AI make file edits, run commands, and use tools — with or without your approval on each action.
---

# Autonomous Mode

By default, Lucent Code asks for your approval before the AI makes any changes to your files or runs any commands. **Autonomous mode** bypasses these approval gates so the AI can work through multi-step tasks without interruption.

## Enabling Autonomous Mode

Click the **⚡ lightning bolt** toggle in the chat toolbar. When lit, autonomous mode is active for the current session.

To make it the persistent default:

```json
// .vscode/settings.json or user settings
{
  "lucentCode.chat.autonomousMode": true
}
```

## Tool Approval (Without Autonomous Mode)

When the AI wants to take an action — edit a file, run a shell command, make an HTTP request — an **approval card** appears in the chat:

```
┌─────────────────────────────────────────────┐
│ ⚙ write_file                                │
│ path: src/auth/token.ts                     │
│                                             │
│ [Show diff]  [Allow once]  [Allow always]   │
└─────────────────────────────────────────────┘
```

**Approval scopes:**

| Option | Behaviour |
|---|---|
| **Allow once** | Approve this single call |
| **Allow for workspace** | Approve all calls of this tool type in this workspace |
| **Allow always** | Approve this tool type globally, forever |
| **Deny** | Block this call; the AI will try a different approach |

For file edits, click **Show diff** to preview the exact changes before approving.

## Available Tools

When not in autonomous mode, the AI can request to use these tools (all require approval):

| Tool | What it does |
|---|---|
| `read_file` | Read any file in your workspace |
| `write_file` | Write or create a file |
| `rename_symbol` | Rename a symbol across the codebase via LSP |
| `apply_code_action` | Apply a VS Code quick fix or refactoring |
| `format_document` | Run the document formatter |
| `insert_code` | Insert code at a specific position |
| `replace_range` | Replace a specific code range |
| `search_web` | Search the web via DuckDuckGo |
| `fetch_url` | Fetch a URL and return it as Markdown |
| `http_request` | Make a GET/POST/PUT/DELETE HTTP request |
| `use_model` | Switch to a different model mid-conversation |
| `use_skill` | Load a skill's full content |

MCP server tools also appear here (see [MCP Servers](./mcp-servers)).

## Git Worktrees

For larger agentic tasks, Lucent Code can create a **git worktree** — an isolated copy of your repo on a new branch. The AI works in the worktree, keeping your working directory clean.

Start a worktree session via the **Start Worktree** button in the toolbar. When the task is done, you can merge, create a PR, or discard the worktree.

:::tip
Use autonomous mode + worktrees for tasks like *"refactor the entire auth module"* or *"add TypeScript types throughout this file"*. The AI works through the task, you review the result as a diff.
:::
```

**Step 3: Create `docs-site/docs/user-guide/mcp-servers.md`**

```markdown
---
sidebar_position: 7
title: MCP Servers
description: Extend the AI's capabilities with Model Context Protocol servers — connect databases, browsers, APIs, and more.
---

# MCP Servers

**MCP (Model Context Protocol)** is an open standard for giving AI models access to external tools and data sources. An MCP server exposes a set of tools the AI can call — anything from querying a database to controlling a browser.

## How It Works

When an MCP server is connected, its tools appear alongside Lucent Code's built-in editor tools. The AI can use them in conversation, subject to your approval (or bypassed in autonomous mode).

Tool calls are prefixed with the server name: `mcp__playwright__browser_navigate`, for example.

## Adding MCP Servers

Lucent Code reads MCP configuration from three locations, merged in this order (later wins on name collisions):

1. `~/.claude/settings.json` — shared across all Claude/Lucent sessions
2. `~/.lucentcode/settings.json` — Lucent Code-specific global config
3. `<workspace>/.mcp.json` — project-specific, checked into version control

### Via Claude Code CLI (Recommended)

If you have [Claude Code](https://claude.ai/code) installed:

```bash
claude mcp add playwright -- npx @playwright/mcp@latest
```

This writes to `~/.claude/settings.json`, making the server available in Lucent Code automatically.

### Manually in `.mcp.json`

Create `.mcp.json` in your workspace root:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"]
    }
  }
}
```

Changes to `.mcp.json` trigger an automatic reconnect — no restart needed.

## Useful MCP Servers

| Server | What it does | Install |
|---|---|---|
| `@playwright/mcp` | Browser automation — navigate, click, screenshot | `npx @playwright/mcp@latest` |
| `@upstash/context7-mcp` | Fetch up-to-date library docs | `npx -y @upstash/context7-mcp@latest` |
| `@modelcontextprotocol/server-filesystem` | Read/write filesystem outside workspace | npm |
| `@modelcontextprotocol/server-postgres` | Query a PostgreSQL database | npm |
| `@modelcontextprotocol/server-github` | GitHub API — issues, PRs, code search | npm |

Browse the full registry at [modelcontextprotocol.io](https://modelcontextprotocol.io).

## Server Status

The chat toolbar shows a status chip per MCP server:
- **Green dot** — connected and tools available
- **Red dot** — error (check the Output panel → Lucent Code for logs)

## Mentioning MCP Servers

Type `@server-name` in the chat input to direct a message to a specific MCP server. The AI will prioritise that server's tools when responding.

## MCP Tool Approval

All MCP tool calls require approval by default, regardless of your autonomous mode setting for editor tools. This is intentional — MCP servers can have significant side effects (browser actions, database writes, API calls).

To allow MCP calls without approval, enable full autonomous mode (⚡).
```

**Step 4: Verify build**

```bash
cd docs-site && npm run build 2>&1 | grep -E "error|broken" | head -10
```

Expected: No errors.

**Step 5: Commit**

```bash
cd ..
git add docs-site/docs/user-guide/file-attachments.md docs-site/docs/user-guide/autonomous-mode.md docs-site/docs/user-guide/mcp-servers.md
git commit -m "docs: add file-attachments, autonomous-mode, and mcp-servers pages"
```

---

## Task 6: Developer Reference — Architecture + Adding Skills

**Files:**
- Create: `docs-site/docs/developer/architecture.md`
- Create: `docs-site/docs/developer/adding-skills.md`

**Step 1: Create `docs-site/docs/developer/architecture.md`**

```markdown
---
sidebar_position: 1
title: Architecture
description: How the extension is structured — the VS Code host process, the SolidJS webview, and the postMessage protocol between them.
---

# Architecture

Lucent Code is a VS Code extension split into two processes that communicate via VS Code's webview postMessage API.

## High-Level Structure

```
┌─────────────────────────────────────────────────────────────┐
│ VS Code Extension Host (Node.js)                            │
│                                                             │
│  src/extension.ts          ← activation entry point        │
│  src/chat/chat-handler.ts  ← OpenRouter API calls          │
│  src/skills/               ← skill registry & sources      │
│  src/tools/                ← editor tool implementations   │
│  src/mcp/                  ← MCP client manager            │
│  src/context/              ← LSP context gatherer          │
│  src/search/               ← codebase indexer              │
└──────────────────┬──────────────────────────────────────────┘
                   │  postMessage (WebviewMessage / ExtensionMessage)
┌──────────────────▼──────────────────────────────────────────┐
│ Webview (SolidJS, bundled by esbuild)                       │
│                                                             │
│  webview/src/App.tsx           ← root component            │
│  webview/src/components/       ← UI components             │
│  webview/src/services/         ← vscode API bridge         │
└─────────────────────────────────────────────────────────────┘
```

## Message Protocol

All communication uses typed messages defined in `src/shared/types.ts`.

**Webview → Extension** (`WebviewMessage`):
```typescript
type WebviewMessage =
  | { type: 'sendMessage'; content: string; images?: string[]; model: string }
  | { type: 'getModels' }
  | { type: 'setModel'; modelId: string }
  | { type: 'toolApprovalResponse'; requestId: string; approved: boolean; scope?: ApprovalScope }
  | { type: 'listFiles'; query: string }
  | // ... more
```

**Extension → Webview** (`ExtensionMessage`):
```typescript
type ExtensionMessage =
  | { type: 'streamChunk'; content: string }
  | { type: 'streamEnd'; usage?: Usage }
  | { type: 'modelsLoaded'; models: OpenRouterModel[] }
  | { type: 'toolApprovalRequest'; requestId: string; toolName: string; args: Record<string, unknown>; diff?: DiffLine[] }
  | { type: 'usageUpdate'; lastMessageCost: number; sessionCost: number; creditsUsed: number }
  | // ... more
```

The webview sends messages via `vscode.postMessage()`. The extension sends messages via `panel.webview.postMessage()`.

## Key Source Files

| File | Purpose |
|---|---|
| `src/extension.ts` | Activation, panel creation, message routing |
| `src/chat/chat-handler.ts` | Builds prompts, calls OpenRouter API, streams responses, routes tool calls |
| `src/skills/skill-registry.ts` | Loads and indexes skills from all sources |
| `src/skills/sources/` | Skill source implementations (builtin, claude-code, github, npm, marketplace, local) |
| `src/tools/editor-tools.ts` | Implements editor tool calls (write_file, rename_symbol, etc.) |
| `src/mcp/mcp-client-manager.ts` | Spawns and manages MCP server subprocesses |
| `src/context/context-gatherer.ts` | Collects LSP context (file, selection, diagnostics) |
| `src/search/indexer.ts` | Vector indexing for @codebase search |
| `src/shared/types.ts` | **All shared types** — read this first |
| `webview/src/App.tsx` | Root SolidJS component, message handler |
| `webview/src/components/ChatMessage.tsx` | Renders a single message with markdown, code blocks, tool cards |
| `webview/src/components/ChatInput.tsx` | Input with @mentions, skill chips, file attachment |
| `webview/src/components/ModelSelector.tsx` | Model picker dropdown |

## Build System

esbuild bundles both the extension and the webview:

```bash
npm run build         # production build
npm run watch         # incremental rebuild on file change
```

Config: `esbuild.config.mjs`. Notable: `.md` files are loaded as text strings (used for built-in skills).

## Data Flow: Sending a Message

1. User types in `ChatInput.tsx` and presses Enter
2. Webview posts `{ type: 'sendMessage', content, model }` to extension
3. `extension.ts` routes to `ChatHandler`
4. `ChatHandler` builds the system prompt (active file, skills list, capabilities, LUCENT.md)
5. OpenRouter API called with streaming enabled
6. Each token streamed back as `{ type: 'streamChunk', content }`
7. If AI calls a tool: `{ type: 'toolApprovalRequest' }` sent to webview
8. User approves → webview posts `{ type: 'toolApprovalResponse', approved: true }`
9. Tool executed, result appended to messages, API called again
10. `{ type: 'streamEnd', usage }` sent when done; `{ type: 'usageUpdate' }` updates status bar
```

**Step 2: Create `docs-site/docs/developer/adding-skills.md`**

```markdown
---
sidebar_position: 2
title: Adding Skills
description: How to write a skill file, the frontmatter spec, and how skills are loaded from different sources.
---

# Adding Skills

A **skill** is a Markdown file with a YAML frontmatter header. The body is the prompt that gets sent to the AI when the skill is invoked.

## Skill File Format

```markdown
---
name: my-skill
description: One sentence describing what this skill does
---

Your prompt here. Write clear, structured instructions for the AI.

Include examples, output formats, and any constraints you want enforced.
```

**Frontmatter fields:**

| Field | Required | Description |
|---|---|---|
| `name` | Yes | Slug used in the `/` picker and for `use_skill` tool calls |
| `description` | Yes | Shown in the skill picker and system prompt — keep it to one sentence |

The `name` and `description` values may optionally be quoted (single or double quotes — both are stripped).

## Built-in Skills

Built-in skills live in `src/skills/builtin/` as individual `.md` files. They're bundled at build time by esbuild's text loader.

To add a new built-in skill:

1. Create `src/skills/builtin/your-skill.md` with frontmatter
2. Import it in `src/skills/builtin/index.ts`:
   ```typescript
   import yourSkill from './your-skill.md';
   export const BUILTIN_SKILLS: readonly string[] = [
     // ... existing skills ...
     yourSkill,
   ];
   ```
3. Build: `npm run build`

## User Skills (`~/.claude/skills/`)

Create a directory per skill:

```
~/.claude/skills/
  my-skill/
    SKILL.md       ← skill content (frontmatter + body)
  another-skill/
    SKILL.md
```

Lucent Code reads each subdirectory's `SKILL.md` on startup.

## Skill Sources

Skills are loaded from multiple sources, appearing in the picker grouped by source label:

| Label | Source |
|---|---|
| `builtin` | Bundled with the extension |
| `claude` | `~/.claude/skills/` and `~/.claude/plugins/cache/` |
| `github` | Fetched from a GitHub repository |
| `npm` | Fetched from an npm package via unpkg.com |
| `marketplace` | Fetched from the Superpowers registry |
| `local` | Loaded from a local directory path |

## SkillRegistry API

`src/skills/skill-registry.ts` — central registry:

```typescript
class SkillRegistry {
  load(content: string, source?: string): void    // parse and index one skill
  clear(): void                                    // reset all loaded skills
  get(name: string): Skill | undefined
  getSummaries(): SkillSummary[]                  // name + description + source
  getContent(name: string): string | undefined    // full body
}
```

`getSummaries()` is called when building the system prompt (lightweight — no body content). `getContent()` is called when the AI invokes `use_skill`.

## Writing Good Skills

- **Be specific about output format.** The AI will follow explicit format instructions. Vague instructions produce inconsistent output.
- **Show don't tell.** Include a concrete example of the expected output in the skill body.
- **Keep descriptions scannable.** The description appears in the AI's system prompt — one sentence is enough.
- **YAGNI.** Don't add instructions for edge cases that won't come up. Longer prompts don't mean better results.
```

**Step 3: Commit**

```bash
cd ..
git add docs-site/docs/developer/architecture.md docs-site/docs/developer/adding-skills.md
git commit -m "docs: add architecture and adding-skills developer pages"
```

---

## Task 7: Developer Reference — OpenRouter, Tools, Building, Contributing

**Files:**
- Create: `docs-site/docs/developer/openrouter-integration.md`
- Create: `docs-site/docs/developer/tools-and-mcp.md`
- Create: `docs-site/docs/developer/building-locally.md`
- Create: `docs-site/docs/developer/contributing.md`

**Step 1: Create `docs-site/docs/developer/openrouter-integration.md`**

```markdown
---
sidebar_position: 3
title: OpenRouter Integration
description: How Lucent Code calls the OpenRouter API — authentication, streaming, tool use, token tracking.
---

# OpenRouter Integration

Lucent Code calls [OpenRouter's chat completions API](https://openrouter.ai/docs) — a drop-in OpenAI-compatible endpoint that routes to hundreds of underlying models.

## API Key Storage

The API key is stored in VS Code's `SecretStorage` (OS keychain-backed, encrypted at rest). It is never stored in settings files or environment variables.

```typescript
// Read
const key = await context.secrets.get('openrouter.apiKey');

// Write
await context.secrets.store('openrouter.apiKey', value);
```

## Making a Chat Request

All requests go to `https://openrouter.ai/api/v1/chat/completions`.

```typescript
const body: ChatRequest = {
  model: 'anthropic/claude-sonnet-4-5',
  messages: conversationHistory,
  stream: true,
  max_tokens: settings.maxTokens,
  temperature: settings.temperature,
  tools: [...editorTools, ...mcpTools],  // merged tool list
};
```

`ChatRequest` and related types are in `src/shared/types.ts`.

## Streaming

Lucent Code uses SSE streaming (`stream: true`). The response is a `ReadableStream` of newline-delimited JSON chunks:

```typescript
for await (const chunk of response.body) {
  const parsed: ChatResponseChunk = JSON.parse(line.slice('data: '.length));
  const delta = parsed.choices[0].delta;

  if (delta.content) {
    panel.webview.postMessage({ type: 'streamChunk', content: delta.content });
  }

  if (delta.tool_calls) {
    // accumulate tool call arguments across chunks
  }

  if (parsed.usage) {
    // final chunk includes token counts
  }
}
```

## Tool Use

When the model returns `tool_calls` in a delta, the chat handler:

1. Accumulates the full tool call across streaming chunks
2. Sends `toolApprovalRequest` to the webview (unless autonomous mode is on)
3. Waits for `toolApprovalResponse`
4. Calls the appropriate handler (`EditorTools` or `McpClientManager`)
5. Appends a `tool` role message with the result
6. Makes another API call to continue the conversation

The loop continues until `finish_reason === 'stop'` (no more tool calls).

## Model Catalog

Models are fetched from `https://openrouter.ai/api/v1/models` on activation and cached for the session. The `OpenRouterModel` type:

```typescript
interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
  pricing: { prompt: string; completion: string };  // cost per token as string
  supported_parameters?: string[];                  // includes 'reasoning' for thinking models
  top_provider?: { max_completion_tokens?: number };
}
```

Pricing strings are per-token floats (e.g. `"0.000003"` = $3/1M tokens). Multiply by 1,000,000 to get the per-million price shown in the UI.

## Token Usage and Credits

The final streaming chunk includes a `usage` object:

```typescript
interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}
```

Cost is calculated as:
```
cost = (prompt_tokens * promptPricePerToken) + (completion_tokens * completionPricePerToken)
```

The credit balance is fetched from `https://openrouter.ai/api/v1/auth/key` and shown in the status bar alongside per-message and per-session cost.

## Error Handling

OpenRouter errors arrive in two forms:
- HTTP 4xx/5xx with a JSON body: `{ error: { code, message, metadata } }`
- Embedded in stream chunks: `{ error: { code, message } }` in a delta

Both are surfaced as `streamError` messages to the webview and shown as error notifications with a **Retry** action.
```

**Step 2: Create `docs-site/docs/developer/tools-and-mcp.md`**

```markdown
---
sidebar_position: 4
title: Tools & MCP
description: How editor tools are defined, how tool approval works, and how MCP server tools are merged into the tool list.
---

# Tools & MCP

## Editor Tools

Editor tools are defined as `ToolDefinition` objects (OpenAI-compatible function schema) and passed to every API call. They're implemented in `src/tools/editor-tools.ts`.

```typescript
interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;  // JSON Schema
  };
}
```

### Tool Approval Flow

When the model returns a `tool_calls` delta:

1. `ChatHandler` checks if autonomous mode is enabled
2. If not: sends `toolApprovalRequest` to webview:
   ```typescript
   { type: 'toolApprovalRequest'; requestId: string; toolName: string; args: Record<string, unknown>; diff?: DiffLine[] }
   ```
3. Webview shows approval card; user clicks Allow or Deny
4. Webview posts `toolApprovalResponse`:
   ```typescript
   { type: 'toolApprovalResponse'; requestId: string; approved: boolean; scope?: 'once' | 'workspace' | 'global' }
   ```
5. If `scope === 'workspace'` or `'global'`, the tool is added to the allow-list for future calls

Approved scopes are persisted to VS Code's workspace/global state so they survive restarts.

### Adding a New Editor Tool

1. Add the `ToolDefinition` to the `getEditorTools()` function in `src/tools/editor-tools.ts`
2. Add a handler case in the tool dispatch switch statement
3. If the tool makes destructive changes, generate a `DiffLine[]` preview and include it in the `toolApprovalRequest`

## MCP Client Manager

`src/mcp/mcp-client-manager.ts` manages MCP server subprocesses.

**Config loading order** (later wins on name collisions):
1. `~/.claude/settings.json`
2. `~/.lucentcode/settings.json`
3. `<workspace>/.mcp.json`

**Startup:** Each configured server is spawned as a stdio subprocess via `@modelcontextprotocol/sdk`'s `StdioClientTransport`. Tools are listed via the MCP `tools/list` method.

**Tool namespacing:** MCP tools are prefixed as `mcp__serverName__toolName` before being added to the tool list sent to the API. This avoids name collisions with editor tools.

**Tool routing:** When `ChatHandler` receives a tool call, it checks the name prefix:
- `mcp__*` → `McpClientManager.callTool(server, toolName, args)`
- everything else → `EditorTools.dispatch(toolName, args)`

**Error isolation:** If a server fails to start or crashes, it's marked as `error` and its tools are excluded. A `callTool` failure returns `{ isError: true, content: [{ type: 'text', text: errorMessage }] }` to the model, letting it handle the error gracefully.

## Diff Preview

For file-writing tools, `ChatHandler` generates a `DiffLine[]` before executing:

```typescript
interface DiffLine {
  type: 'context' | 'added' | 'removed';
  content: string;
}
```

The diff is computed by comparing the existing file content against the proposed content using a simple Myers diff algorithm. It's included in the `toolApprovalRequest` so the webview can render a preview before the user approves.
```

**Step 3: Create `docs-site/docs/developer/building-locally.md`**

```markdown
---
sidebar_position: 5
title: Building Locally
description: How to set up your development environment, run a debug build, and work with the esbuild bundler.
---

# Building Locally

## Prerequisites

- Node.js 20+
- VS Code 1.85+
- Git

## Setup

```bash
git clone https://github.com/lucent-org/lucent-code
cd lucent-code
npm install
```

This installs dependencies for both the extension host (`src/`) and the webview (`webview/`). They share a single root `package.json`.

## Development Build

Press **F5** in VS Code to launch the Extension Development Host — a separate VS Code window with the extension loaded from source.

Or manually:

```bash
npm run watch        # rebuild on every file change (esbuild incremental)
```

Then open the Command Palette (`Ctrl+Shift+P`) → **Developer: Reload Window** to pick up changes.

## Production Build

```bash
npm run build        # one-off production build
npm run package      # build + vsce package → .vsix file
```

Output:
- `dist/extension.js` — bundled extension host
- `dist/webview.js` — bundled webview

## esbuild Config

`esbuild.config.mjs` bundles both targets. Key configuration:

```javascript
// Extension host — CommonJS for VS Code
{
  entryPoints: ['src/extension.ts'],
  platform: 'node',
  format: 'cjs',
  external: ['vscode'],
  loader: { '.md': 'text' },   // built-in skills imported as strings
}

// Webview — ESM/browser
{
  entryPoints: ['webview/src/index.tsx'],
  platform: 'browser',
  format: 'iife',
}
```

The `.md` text loader allows skill files to be imported directly:
```typescript
import codeReview from './code-review.md';  // returns file content as string
```

## Shared Types

`src/shared/types.ts` is imported by both the extension host and the webview. It's the single source of truth for the message protocol, model types, and conversation types.

## TypeScript Declaration for `.md` Imports

`src/markdown.d.ts` declares the module type so TypeScript is happy:

```typescript
declare module '*.md' {
  const content: string;
  export default content;
}
```

## Testing

Run regression test scripts against a live OpenRouter API:

```bash
node scripts/test-skills-full.mjs        # test all built-in skills
node scripts/test-code-review.mjs        # test code-review skill specifically
```

These scripts call the OpenRouter API directly — you need `OPENROUTER_API_KEY` set in your environment (or a `.env` file).

## Packaging for Marketplace

```bash
npm run package
```

Generates `lucent-code-X.Y.Z.vsix`. Install locally with:

```bash
code --install-extension lucent-code-X.Y.Z.vsix
```
```

**Step 4: Create `docs-site/docs/developer/contributing.md`**

```markdown
---
sidebar_position: 6
title: Contributing
description: Commit style, PR process, how to add built-in skills, and running regression tests.
---

# Contributing

## Commit Style

Lucent Code uses [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

feat(chat): add @model mention for inline model switching
fix(skills): strip surrounding quotes from frontmatter values
docs: add getting-started page
refactor(mcp): extract tool namespacing into helper function
```

**Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`

**Scopes (optional):** `chat`, `skills`, `mcp`, `tools`, `search`, `webview`, `build`

Keep the subject line under 72 characters. Use the body for motivation and context when needed.

## Pull Requests

1. Fork the repo and create a feature branch: `git checkout -b feat/your-feature`
2. Make changes, commit with Conventional Commits style
3. Ensure `npm run build` succeeds with no TypeScript errors
4. Open a PR against `main`
5. Title the PR like a commit subject

Small, focused PRs are easier to review than large ones. If you're making a significant change, open an issue first to discuss the approach.

## Adding a Built-in Skill

1. Create `src/skills/builtin/your-skill.md`:

   ```markdown
   ---
   name: your-skill
   description: One sentence describing what this skill does
   ---

   Your prompt content here.
   ```

2. Import and export in `src/skills/builtin/index.ts`:

   ```typescript
   import yourSkill from './your-skill.md';

   export const BUILTIN_SKILLS: readonly string[] = [
     // existing skills...
     yourSkill,
   ];
   ```

3. Test against a live model before submitting:

   ```bash
   node scripts/test-skills-full.mjs
   ```

4. Commit:
   ```bash
   git commit -m "feat(skills): add your-skill built-in skill"
   ```

## Regression Testing Skills

`scripts/test-skills-full.mjs` tests every built-in skill by calling the OpenRouter API. It checks:
- Model returns a response (not empty)
- Response is within expected length bounds
- Response follows the skill's stated output format

Set your API key before running:
```bash
export OPENROUTER_API_KEY=sk-or-v1-...
node scripts/test-skills-full.mjs
```

## Code Style

- TypeScript strict mode (`"strict": true`)
- No `any` types
- Prefer `const` over `let`
- No default exports in `src/` (named exports only); webview components use default exports
- Shared types go in `src/shared/types.ts` — never duplicate types across files
- Messages between extension and webview must go through the typed protocol — no side channels

## Project Structure Conventions

- `src/` — extension host (Node.js / VS Code API)
- `webview/src/` — SolidJS UI
- `src/shared/` — types shared between host and webview
- `src/skills/builtin/` — built-in skill `.md` files
- `docs/plans/` — internal design and implementation plans (not public docs)
- `docs-site/` — this documentation site
- `marketing/` — lucentcode.dev marketing site
- `scripts/` — utility and test scripts
```

**Step 5: Verify full build**

```bash
cd docs-site && npm run build
```

Expected: `build/` created, no broken links, no TypeScript errors.

**Step 6: Commit**

```bash
cd ..
git add docs-site/docs/developer/
git commit -m "docs: add openrouter-integration, tools-and-mcp, building-locally, contributing pages"
```

---

## Task 8: Delete default Docusaurus content + final polish

Docusaurus scaffolding may create default tutorial content. Remove it and verify the final build.

**Files:**
- Delete: `docs-site/docs/intro.md` (if exists)
- Delete: `docs-site/docs/tutorial-basics/` (if exists)
- Delete: `docs-site/docs/tutorial-extras/` (if exists)
- Create: `docs-site/cloudflare.md` (deployment notes, not part of the site)

**Step 1: Remove default docs (only if they exist)**

```bash
cd docs-site
rm -f docs/intro.md
rm -rf docs/tutorial-basics docs/tutorial-extras
```

**Step 2: Verify the sidebar only references existing files**

```bash
npm run build 2>&1 | grep -i "broken\|error\|not found"
```

Expected: No broken link errors. If any appear, check `sidebars.ts` — each `id` must exactly match a file path relative to `docs/` (without `.md` extension).

**Step 3: Test the dev server looks correct**

```bash
npm start
```

Visit:
- `http://localhost:3000` — home page (logo, gradient title, two buttons)
- `http://localhost:3000/docs/user-guide/getting-started` — first doc page
- `http://localhost:3000/docs/developer/architecture` — first dev page
- Dark mode toggle in navbar — should switch correctly
- Navbar logo — icon.svg visible

**Step 4: Create Cloudflare Pages config note**

Create `docs-site/README.md` (not tracked in Docusaurus, just for ops):

```markdown
# Lucent Code Docs

Docusaurus 3.x documentation site.

## Local development

```bash
npm install
npm start        # dev server at http://localhost:3000
npm run build    # production build → build/
```

## Cloudflare Pages deployment

| Setting | Value |
|---|---|
| Root directory | `docs-site` |
| Build command | `npm run build` |
| Build output directory | `build` |
| Node.js version | `20` |

Set the `NODE_VERSION` environment variable to `20` in the Cloudflare Pages project settings.
```

**Step 5: Final commit**

```bash
cd ..
git add docs-site/README.md
git commit -m "docs: clean up defaults and add Cloudflare deployment notes"
```

---

## Verification Checklist

Before declaring done:

- [ ] `cd docs-site && npm run build` succeeds with zero errors
- [ ] Dev server shows home page with logo and gradient title
- [ ] All 7 user guide pages render in sidebar
- [ ] All 6 developer pages render in sidebar
- [ ] Dark mode default, light mode toggle works
- [ ] Navbar links to lucentcode.dev and Install work
- [ ] Mobile viewport: sidebar collapses to hamburger menu
- [ ] Code blocks use JetBrains Mono font
- [ ] Headings use Syne font
