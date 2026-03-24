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
