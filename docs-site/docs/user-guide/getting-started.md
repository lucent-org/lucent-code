---
sidebar_position: 1
title: Getting Started
description: Install Lucent Code, connect a provider, and start your first AI-assisted coding session.
---

# Getting Started

Lucent Code is a VS Code extension that brings AI-assisted coding to your editor. It supports three AI providers — pick whichever fits your workflow:

| Provider | Best for | Sign-up |
|---|---|---|
| **OpenRouter** | 500+ models, free tier, single key | [openrouter.ai](https://openrouter.ai) |
| **Anthropic** | Latest Claude, native features | [console.anthropic.com](https://console.anthropic.com) |
| **NVIDIA NIM** | Nemotron and NVIDIA GPU models | [build.nvidia.com](https://build.nvidia.com) |

You can configure multiple providers and switch between them at any time.

## Requirements

- VS Code 1.85 or later
- An API key from at least one provider above

## Install the Extension

1. Open VS Code
2. Press `Ctrl+P` (or `Cmd+P` on macOS) and run:
   ```
   ext install lucentcode.lucent-code
   ```
   Or search **Lucent Code** in the Extensions sidebar.
3. Click **Install**.

## Connect a Provider

### OpenRouter (recommended to start)

OpenRouter gives you access to hundreds of models with a single key and has a free tier.

1. Go to [openrouter.ai/keys](https://openrouter.ai/keys) and create a key
2. Open the Command Palette (`Ctrl+Shift+P`) and run **Lucent Code: Sign In** (OAuth) or **Lucent Code: Set API Key**
3. Paste your key

### Anthropic (for best Claude experience)

Use Anthropic's native API to get the latest Claude models with full feature support.

1. Get an API key at [console.anthropic.com](https://console.anthropic.com)
2. Open VS Code settings (`Ctrl+,`), search `lucentCode`
3. Set `lucentCode.providers.anthropic.apiKey`

### NVIDIA NIM (for Nemotron models)

1. Get an API key at [build.nvidia.com](https://build.nvidia.com)
2. Open VS Code settings, set `lucentCode.providers.nvidianim.apiKey`

Your keys are stored in VS Code's encrypted secret storage — they never leave your machine in plaintext.

## Open the Chat Panel

- Click the **Lucent Code icon** in the Activity Bar (left sidebar)
- Or press `Ctrl+Shift+L`
- Or run **Lucent Code: Open Chat** from the Command Palette

## Select a Provider and Model

Click the **provider · model** button at the bottom of the chat panel. A two-level picker opens:
1. **Level 1** — choose a provider (shows which are configured)
2. **Level 2** — search and select a model from that provider

Each model shows its price per million tokens. Start with a free model if you're just exploring.

See [Model Selection](./model-selection) for provider guidance and model recommendations.

## Start Chatting

Type a message and press **Enter**. The extension automatically includes:
- The file you're currently editing
- Your cursor position and any selected text
- Open editor tabs
- Active diagnostics (errors/warnings)

Try: *"Explain what this file does"* or *"Refactor this function to use async/await"*.

## Next Steps

- [Model Selection](./model-selection) — providers, picking the right model, pricing
- [Chat Interface](./chat-interface) — keyboard shortcuts, history, exporting
- [Skills & Commands](./skills-and-commands) — slash commands like `/code-review`
- [Autonomous Mode](./autonomous-mode) — let the AI make edits directly

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
