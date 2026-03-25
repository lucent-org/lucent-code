# Credits Awareness Design

**Goal:** Make Lucent Code aware of OpenRouter credit usage — per-message cost on hover, session total in the status bar, account balance from the API, and a graceful no-credits state.

**Approach:** Extension-side cost calculation from stream `usage` data (A) + polling `/api/v1/auth/key` for account balance (C).

---

## Data Flow & Cost Calculation

The final chunk of each OpenRouter stream response contains:
```json
{ "usage": { "prompt_tokens": 800, "completion_tokens": 440, "total_tokens": 1240 } }
```

The `/models` response already includes per-model pricing:
```json
{ "pricing": { "prompt": "0.000001", "completion": "0.000002" } }
```

Cost per message = `(prompt_tokens × pricing.prompt) + (completion_tokens × pricing.completion)`

### Extension tracks:
- `sessionCost: number` — accumulated this session, reset on reload
- `lastMessageCost: number` — cost of the most recent response
- `accountBalance: { usage: number; limit: number | null }` — from `/api/v1/auth/key`

After each stream end, extension sends to webview:
```ts
{ type: 'usageUpdate', lastMessageCost: number, sessionCost: number, accountBalance: { usage: number; limit: number | null } }
```

Account balance is fetched once on startup and refreshed after each message.

---

## Status Bar Consolidation

Replace the two current "OpenRouter" status bar items with **one**:

| State | Display |
|-------|---------|
| Signed in | `⚡ OpenRouter · $0.0042` |
| Not signed in | `⚠ OpenRouter: Not signed in` |
| No credits | `⚠ OpenRouter: No credits` |

Clicking opens a QuickPick:
```
── Account ──────────────────────
  Signed in (sk-or-...abc)
  Credits remaining: $4.23
  Session cost: $0.0042

── Actions ──────────────────────
  Buy credits ↗
  Sign out
  Set API key manually
```

The indexer status bar item remains separate.

---

## Per-Message Cost (hover)

Each assistant message shows a small cost tooltip on hover, bottom-right:
```
· $0.0012  ·  1,240 tokens
```

Implemented as CSS `:hover` opacity reveal — no JS required.

The webview receives `lastMessageCost` and `tokenCount` via `usageUpdate` and stores them on the message object.

---

## No-Credits State

Triggered by:
- A 402 response from OpenRouter
- `accountBalance.usage >= accountBalance.limit` (when limit is set)

Behaviour:
- Chat input is **greyed out and disabled**
- Banner above input:
  ```
  ⚠ Insufficient credits — your account has no remaining balance.
  [Buy credits on OpenRouter ↗]
  ```
- Status bar shows `⚠ OpenRouter: No credits`
- Clears automatically if user re-authenticates or balance is topped up (next balance poll)
