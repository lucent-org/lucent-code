---
sidebar_position: 3
title: Model Selection
description: How to choose a provider, switch models, understand pricing, and get the most out of each AI provider.
---

# Model Selection

Lucent Code supports three AI providers. You choose a provider **and** a model from a single unified selector in the chat toolbar.

## The Provider & Model Selector

The button at the bottom-left of the chat panel shows:

```
OpenRouter · Claude Sonnet 4.6 · 23%
```

- **Provider name** — which backend is handling requests
- **Model name** — the currently selected model
- **Context fill %** — how full the context window is (turns red above 80%)

Click the button to open the two-level picker.

### Level 1 — Provider List

```
● OpenRouter      ✓  ⚙
  Anthropic        !  ⚙
  NVIDIA NIM       !  ⚙
```

- `●` filled dot = currently active provider
- `✓` = configured (API key present or OAuth connected)
- `!` = not configured — click `⚙` to set up
- `⚙` gear icon opens that provider's settings or auth flow

Click a provider row to browse its models.

### Level 2 — Model List

```
← Anthropic
  [search...]
  Claude Opus 4.6       $15.00 · $75.00 /1M
  Claude Sonnet 4.6 ✓   $3.00 · $15.00 /1M
  Claude Haiku 4.5      $0.25 · $1.25 /1M
```

- Search filters by name or model ID
- `✓` marks the active model
- Pricing is per million tokens (prompt · completion)
- `free` labels zero-cost models
- Selecting a model sets both the provider and the model

---

## The Three Providers

### OpenRouter

Access to 500+ models from every major provider — Anthropic, Google, OpenAI, Meta, Mistral, and more — with a single API key.

**Best for:**
- Exploring many models quickly
- Free-tier models (Llama, Mistral, Phi)
- Comparing providers side-by-side

**Set up:** Run **Lucent Code: Sign In** from the Command Palette to connect via OAuth, or **Lucent Code: Set API Key** to paste a key directly.

### Anthropic (native)

Direct connection to Anthropic's API — no routing layer. Models appear immediately when Anthropic ships them, with full feature support.

**Best for:**
- Latest Claude models the moment they launch
- Extended thinking (Claude's chain-of-thought reasoning)
- Best Claude performance and feature parity

> **Tip:** If you use Claude heavily, the native Anthropic provider is worth it. You get the full model spec, not a proxied version — features like extended thinking and all `supported_parameters` are fully available.

**Set up:** Open VS Code settings (`Ctrl+,`), search `lucentCode`, and set `lucentCode.providers.anthropic.apiKey`.

### NVIDIA NIM

Direct access to NVIDIA's hosted GPU inference endpoints — Nemotron and other NVIDIA-hosted models.

**Best for:**
- Nemotron models (high-quality code and reasoning)
- NVIDIA's latest research models
- Enterprise GPU inference without a cloud middleman

> **Tip:** NIM models are served on NVIDIA hardware with low latency. For Nemotron specifically, this is the canonical endpoint — use it instead of routing via OpenRouter for the best performance.

**Set up:** Open VS Code settings, set `lucentCode.providers.nvidianim.apiKey` (and optionally `baseUrl` for a custom NIM endpoint).

---

## Switching Providers

When you switch to a provider whose model list does not include your current model, Lucent Code automatically selects the first model on the new provider's list and shows a warning banner:

```
⚠ "nvidia/nemotron-super-49b-v1" not available in Anthropic
  Switching to Claude Sonnet 4.6
```

You can pick a different model before the banner disappears.

---

## Type `@model` to Switch Inline

Type `@model` anywhere in the chat input to open the model picker without using the toolbar button.

---

## Reasoning Models

Models that perform explicit chain-of-thought reasoning (like DeepSeek R1, o1, Claude with extended thinking) show a **`thinking` badge** in the picker.

Reasoning models:
- Give higher-quality answers on complex problems
- Are slower and cost more tokens
- Consume extra tokens for the reasoning trace (hidden but counted toward your budget)

---

## Choosing the Right Model

### For quick questions and iteration
**`google/gemini-flash-1.5`** or **`meta-llama/llama-3.1-8b-instruct:free`** via OpenRouter.
Fast, cheap, good for simple Q&A.

### For everyday coding
**Claude Sonnet 4.6** via Anthropic native — best balance of speed, quality, and cost. Or via OpenRouter if you prefer a single key.

### For complex reasoning and architecture
**Claude Opus 4.6** (Anthropic native) or **`deepseek/deepseek-r1`** (OpenRouter).
Use when you need deep analysis or hard bugs. Slower and more expensive.

### For GPU-inference models
**Nemotron Super** via NVIDIA NIM — high quality, direct inference, no middleman.

### For free usage
Models labelled `free` in the picker cost nothing. Meta's Llama models on OpenRouter are a good free starting point.

---

## Cost and Usage

After each response the status bar shows:
- **Last message cost** — USD for that request
- **Session cost** — total for this VS Code session
- **Credit balance** — remaining OpenRouter credits (OpenRouter provider only)

---

## Setting a Default Model

Open VS Code settings (`Ctrl+,`) and search `lucentCode`:
- `lucentCode.chat.model` — default model for chat
- `lucentCode.completions.model` — default model for inline completions
- `lucentCode.providers.override` — pin to a specific provider
