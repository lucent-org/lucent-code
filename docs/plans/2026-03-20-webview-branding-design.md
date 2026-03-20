# Webview Branding & Logo Design

## Goal

Add Lucent Code brand identity to the VS Code extension webview and create a new logo, while keeping all functional UI colors deferred to VS Code's active theme.

## Constraints

- Functional UI colors (buttons, inputs, text, borders) must continue using `--vscode-*` CSS variables — no brand overrides on interactive elements.
- Branding appears only in designated identity zones: logo assets, toolbar wordmark, and empty state.
- All webview text uses VS Code theme colors (`--vscode-foreground`, `--vscode-descriptionForeground`, etc.).

---

## 1. New Logo — `/` Slash Beam

**Concept:** A single bold `/` stroke on a dark background, filled with the Lucent Code brand gradient (indigo → violet → cyan). The slash communicates code (the skills trigger character, a universal coding symbol) and light (a beam at an angle). Unique in the VS Code marketplace.

**Gradient:** `linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #22D3EE 100%)`

**Files to produce:**

### `images/icon.svg` (marketplace / README / extension icon)
- 128×128 viewBox
- Background: `#0d0d1a` rounded rect (rx=16)
- Stroke: bold `/` path from bottom-left to top-right, stroke-width=14, rounded linecaps
- Fill: SVG `linearGradient` definition, `id="beam"`, applied as `stroke="url(#beam)"`
- No other elements

### `media/icon.svg` (VS Code SVG icon — rendered as mask)
- Same 128×128 shape, no background rect
- Stroke fill: `#ffffff` (VS Code applies its own color as mask)
- VS Code ignores gradients in SVG mask icons — white ensures correct rendering

### `images/icon.png`
- 128×128 PNG exported from `images/icon.svg`
- Referenced in `package.json` `"icon"` field

---

## 2. Toolbar Wordmark

**Location:** Left side of the `.toolbar` in `App.tsx`, before the model selector.

**Structure:**
```html
<div class="toolbar-brand">
  <svg class="toolbar-brand__mark" ...> <!-- inline /  slash SVG, 14×14 --> </svg>
  <span class="toolbar-brand__name">Lucent Code</span>
</div>
```

**CSS:**
- `.toolbar-brand` — `display: flex; align-items: center; gap: 6px;`
- `.toolbar-brand__mark` — 14×14px inline SVG of the `/` slash with gradient
- `.toolbar-brand__name` — `font-size: 12px; font-weight: 600; color: var(--vscode-foreground); opacity: 0.85; letter-spacing: 0.02em;`

The SVG gradient works inline in HTML — no fallback needed.

---

## 3. Empty State

**Location:** The `.empty-state` div in `App.tsx`, shown when there are no messages.

**Current:** `💬` emoji at 48px + "Start a conversation" text.

**New structure:**
```html
<div class="empty-state">
  <svg class="empty-state__logo" ...> <!-- /  slash, ~56×56 --> </svg>
  <p class="empty-state__name">Lucent Code</p>
  <p class="empty-state__tagline">Write code in a new light.</p>
</div>
```

**CSS:**
- `.empty-state__logo` — 56×56px, the gradient `/` SVG
- `.empty-state__name` — `font-size: 16px; font-weight: 600; color: var(--vscode-foreground);`
- `.empty-state__tagline` — `font-size: 13px; color: var(--vscode-descriptionForeground);`
- Remove `.empty-state-icon` emoji styles

---

## 4. Dual ⚡ Fix

Two places in the webview currently use `⚡`:

| Location | Current | New | Rationale |
|---|---|---|---|
| Toolbar — autonomous mode toggle | `⚡` | `⊙` | Circle-dot reads as "focus/autopilot"; distinct from skills |
| ChatInput — skills trigger button | `⚡` | `/` | Exact trigger character; reinforces brand slash mark |

**Files to change:**
- `webview/src/App.tsx` — toolbar autonomous mode button label
- `webview/src/components/ChatInput.tsx` — skills attach button label
- `webview/src/styles.css` — update any `.attach-button` or autonomous button tooltip/aria-label text

---

## 5. Activity Bar Icon (optional improvement)

The activity bar currently uses VS Code built-in `$(comment-discussion)`. Optionally update `package.json` `viewsContainers.activitybar[].icon` to point to `media/icon.svg` (the white monochrome slash). This gives the extension its own recognisable icon in the activity bar instead of a generic chat bubble.

This is a `package.json` change only — no webview code needed.

---

## Files Changed

| File | Change |
|---|---|
| `images/icon.svg` | Replace with gradient `/` slash logo |
| `media/icon.svg` | Replace with monochrome `/` slash (mask-safe) |
| `images/icon.png` | Regenerated PNG — manual step or scripted |
| `webview/src/App.tsx` | Add `.toolbar-brand`, update empty state, change `⚡` → `⊙` in autonomous button |
| `webview/src/components/ChatInput.tsx` | Change skills `⚡` → `/` |
| `webview/src/styles.css` | Add `.toolbar-brand`, `.toolbar-brand__mark`, `.toolbar-brand__name`, `.empty-state__logo`, `.empty-state__name`, `.empty-state__tagline`; remove `.empty-state-icon` |
| `package.json` | (optional) Update activity bar icon to `media/icon.svg` |
