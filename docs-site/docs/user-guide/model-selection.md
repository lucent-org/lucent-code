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
