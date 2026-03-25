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
