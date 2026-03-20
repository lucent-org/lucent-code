# Design System

**Product type:** Marketing site — VS Code extension (Lucent Code)
**Tech stack:** Generic Web (SolidJS + Vite)
**Generated:** 2026-03-20

---

## Design Philosophy

Lucent Code owns the word *light*. "Write code in a new light" isn't just a tagline — it's the visual thesis.

The VS Code marketplace is a sea of flat dark-gray pages. We break from that with a **luminous bold approach**: a deep-space hero that *glows*, alternating with clean white content sections that breathe. Not dark-for-dark's-sake — dark as a stage for light.

Target aesthetic: **Vercel × Raycast × Linear** — premium developer tool energy, bold typography, vivid accent gradients, no noise.

---

## Color Palette

### Brand Gradient (the "light beam")
The core visual motif — electric indigo bleeding into violet into cyan. Used in hero backgrounds, accent glows, gradient text on key phrases.

```
--gradient-brand: linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #22D3EE 100%);
--gradient-glow:  radial-gradient(ellipse at 60% 0%, rgba(99,102,241,0.35) 0%, transparent 70%);
--gradient-text:  linear-gradient(90deg, #818CF8, #C084FC, #22D3EE);
```

### Primary (Electric Indigo)
Chosen to stand apart from VS Code's `#007ACC` blue — indigo reads "intelligence" and "precision", not "Microsoft".

| Token | Value | Usage |
|---|---|---|
| `--color-primary` | `#6366F1` | CTAs, active states, key highlights |
| `--color-primary-hover` | `#4F46E5` | Button hover |
| `--color-primary-glow` | `rgba(99,102,241,0.25)` | Glow rings, focus shadows |
| `--color-primary-fg` | `#FFFFFF` | Text on primary background |

### Secondary (Violet)
Gradient partner to primary, used in feature icons, accent borders.

| Token | Value | Usage |
|---|---|---|
| `--color-secondary` | `#8B5CF6` | Feature accents, icon backgrounds |
| `--color-secondary-fg` | `#FFFFFF` | Text on secondary |

### Highlight (Cyan)
The "light" end of the gradient — used for inline code highlights, terminal-themed elements, and the worktree/LSP feature callouts.

| Token | Value | Usage |
|---|---|---|
| `--color-highlight` | `#22D3EE` | Code highlights, tag pills, light accents |
| `--color-highlight-muted` | `rgba(34,211,238,0.15)` | Subtle glows on dark backgrounds |

### Dark Surfaces (Hero / Dark Sections)
Deeper than the extension's `#0d0d1a` — creates true depth for the glow effects.

| Token | Value | Usage |
|---|---|---|
| `--color-dark-base` | `#08090F` | Hero section, footer background |
| `--color-dark-surface` | `#0F1017` | Card backgrounds on dark sections |
| `--color-dark-elevated` | `#16171F` | Hover/elevated cards on dark |
| `--color-dark-border` | `rgba(255,255,255,0.08)` | Borders on dark backgrounds |
| `--color-dark-fg` | `#F1F5F9` | Primary text on dark |
| `--color-dark-fg-muted` | `#94A3B8` | Secondary text on dark |

### Light Surfaces (Content Sections)
Off-white, not pure white — reduces eye strain for developer audiences.

| Token | Value | Usage |
|---|---|---|
| `--color-background` | `#F8F9FC` | Page background for light sections |
| `--color-surface` | `#FFFFFF` | Card backgrounds |
| `--color-surface-muted` | `#F1F4F9` | Alternate row, subtle fills |
| `--color-border` | `#E2E8F0` | Borders on light backgrounds |
| `--color-text` | `#0F172A` | Primary text |
| `--color-text-muted` | `#64748B` | Secondary text, descriptions |

### Semantic

| Token | Value | Usage |
|---|---|---|
| `--color-success` | `#10B981` | Positive states |
| `--color-warning` | `#F59E0B` | Warning states |
| `--color-error` | `#EF4444` | Error states |
| `--color-info` | `#6366F1` | Info — same as primary |

---

## Typography

### Font Pairing: Syne + DM Sans + JetBrains Mono

- **Syne** — Geometric display font, unusually bold in the dev-tool space. Stands out from every Inter/Geist clone in the marketplace. Signals "premium, opinionated tool".
- **DM Sans** — Friendly but precise. Great at 16–18px body. Complements Syne without competing.
- **JetBrains Mono** — The obvious monospace for a coding tool; recognized by developers instantly.

```html
<!-- Google Fonts -->
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

```css
--font-display: 'Syne', system-ui, sans-serif;
--font-body:    'DM Sans', system-ui, -apple-system, sans-serif;
--font-mono:    'JetBrains Mono', 'Fira Code', monospace;
```

### Type Scale

| Token | Size | Weight | Line-height | Font | Usage |
|---|---|---|---|---|---|
| `display` | 72–96px | 900 | 1.05 | Syne | Hero headline |
| `h1` | 48px | 800 | 1.1 | Syne | Section headlines |
| `h2` | 36px | 700 | 1.2 | Syne | Sub-section titles |
| `h3` | 24px | 700 | 1.3 | Syne | Feature card titles |
| `h4` | 20px | 600 | 1.4 | DM Sans | Small headings |
| `body-lg` | 18px | 400 | 1.7 | DM Sans | Hero subheading, lead text |
| `body` | 16px | 400 | 1.6 | DM Sans | Body copy |
| `body-sm` | 14px | 400 | 1.5 | DM Sans | Captions, secondary text |
| `label` | 12px | 600 | 1.4 | DM Sans | Eyebrows, badges, tags |
| `mono` | 14px | 400 | 1.6 | JetBrains Mono | Code snippets, version numbers |

### Gradient Text (Hero Only)
```css
.gradient-text {
  background: var(--gradient-text);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```
Apply to key words in the hero headline (e.g., the word "light" in "Write code in a new **light**").

---

## Spacing Scale

Base unit: 4px

| Token | Value | Usage |
|---|---|---|
| `--space-1` | 4px | Micro gaps |
| `--space-2` | 8px | Tight internal padding |
| `--space-3` | 12px | Compact component padding |
| `--space-4` | 16px | Default component padding |
| `--space-6` | 24px | Card padding, inline gaps |
| `--space-8` | 32px | Component group spacing |
| `--space-12` | 48px | Section internal spacing (mobile) |
| `--space-16` | 64px | Section vertical padding (mobile) |
| `--space-20` | 80px | Section vertical padding (tablet) |
| `--space-24` | 96px | Section vertical padding (desktop) |
| `--space-32` | 128px | Hero padding (desktop) |

**Marketing-specific rules:**
- Section `padding-block`: `var(--space-24)` desktop, `var(--space-16)` tablet, `var(--space-12)` mobile
- Content `max-width`: `1200px`, centered
- Text column `max-width`: `720px`

---

## Border Radius

| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | 4px | Badges, tags |
| `--radius-md` | 8px | Buttons, inputs |
| `--radius-lg` | 12px | Cards |
| `--radius-xl` | 16px | Feature panels, hero code block |
| `--radius-2xl` | 24px | Large showcase containers |
| `--radius-full` | 9999px | Pills, avatar rings |

---

## Shadows & Glow Effects

```css
/* Light sections */
--shadow-sm: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
--shadow-md: 0 4px 12px rgba(0,0,0,0.08);
--shadow-lg: 0 8px 24px rgba(0,0,0,0.10);

/* Dark sections — glow instead of shadow */
--glow-primary: 0 0 24px rgba(99,102,241,0.4), 0 0 48px rgba(99,102,241,0.2);
--glow-cyan:    0 0 24px rgba(34,211,238,0.3), 0 0 48px rgba(34,211,238,0.15);
--glow-card:    0 1px 0 rgba(255,255,255,0.05) inset, 0 8px 32px rgba(0,0,0,0.4);
```

---

## Component Patterns

### Primary CTA Button
The "Install for VS Code" button — highest visual weight on the page.

```css
.btn-primary {
  height: 52px;
  padding: 0 var(--space-8);
  background: var(--color-primary);
  color: var(--color-primary-fg);
  border-radius: var(--radius-md);
  font-family: var(--font-body);
  font-size: 16px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  box-shadow: var(--glow-primary);
  transition: transform 120ms ease, box-shadow 120ms ease;
}
.btn-primary:hover {
  background: var(--color-primary-hover);
  transform: translateY(-1px);
  box-shadow: 0 0 32px rgba(99,102,241,0.5), 0 0 64px rgba(99,102,241,0.25);
}
```

### Secondary CTA Button
"See how it works →" style.

```css
.btn-secondary {
  height: 52px;
  padding: 0 var(--space-6);
  background: transparent;
  color: var(--color-dark-fg);
  border: 1px solid var(--color-dark-border);
  border-radius: var(--radius-md);
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease;
}
.btn-secondary:hover {
  border-color: rgba(99,102,241,0.5);
  background: rgba(99,102,241,0.08);
}
```

### Feature Card (Light Section)
3-column grid. Icon + heading + 2-line description.

```css
.feature-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-8);
  box-shadow: var(--shadow-md);
  transition: box-shadow 200ms ease, transform 200ms ease;
}
.feature-card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
.feature-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15));
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--space-4);
  font-size: 22px;
}
```

### Feature Card (Dark Section)
Used for hero-adjacent "how it works" panels.

```css
.feature-card-dark {
  background: var(--color-dark-surface);
  border: 1px solid var(--color-dark-border);
  border-radius: var(--radius-xl);
  padding: var(--space-8);
  box-shadow: var(--glow-card);
}
.feature-card-dark:hover {
  border-color: rgba(99,102,241,0.3);
}
```

### Eyebrow Label
Small uppercase label above section headings.

```css
.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-primary);
  margin-bottom: var(--space-4);
}
```

### Code Showcase Block
Mimics the VS Code extension's own chat panel — used in hero/demo section as a product screenshot frame.

```css
.code-showcase {
  background: var(--color-dark-surface);
  border: 1px solid var(--color-dark-border);
  border-radius: var(--radius-xl);
  overflow: hidden;
  box-shadow: var(--glow-card), var(--glow-primary);
}
.code-showcase-bar {
  display: flex;
  gap: 6px;
  padding: var(--space-3) var(--space-4);
  background: var(--color-dark-elevated);
  border-bottom: 1px solid var(--color-dark-border);
}
.code-showcase-dot {
  width: 12px;
  height: 12px;
  border-radius: var(--radius-full);
  background: var(--color-dark-border);
}
```

### Tag / Badge
For feature labels like "LSP-powered", "Multi-model", "MCP support".

```css
.badge {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.badge-primary {
  background: rgba(99,102,241,0.12);
  color: #818CF8;
  border: 1px solid rgba(99,102,241,0.2);
}
.badge-cyan {
  background: rgba(34,211,238,0.1);
  color: #22D3EE;
  border: 1px solid rgba(34,211,238,0.2);
}
```

---

## Page Section Structure

The marketing site should follow this alternating rhythm:

| # | Section | Background | Notes |
|---|---|---|---|
| 1 | **Hero** | Dark (`#08090F` + glow) | Full viewport, gradient glow, headline + 2 CTAs |
| 2 | **Social proof strip** | Dark, slightly elevated | "Works with Claude, GPT-4o, Gemini, Llama..." logos |
| 3 | **Feature grid — Core** | Light (`#F8F9FC`) | 3-col cards: LSP-first, Multi-model, Streaming chat |
| 4 | **Demo / How it works** | Dark | Code showcase + step-by-step callouts |
| 5 | **Feature grid — Advanced** | Light | Skills system, MCP support, Worktrees, Inline completions |
| 6 | **CTA banner** | Primary gradient | "Install free for VS Code" — no credit card, etc. |
| 7 | **Footer** | Dark (`#08090F`) | Logo, nav, GitHub, legal |

---

## Stack-Specific Notes (Generic Web / SolidJS)

- Use CSS custom properties exclusively — no Tailwind or CSS-in-JS. Keeps the marketing site self-contained from the extension's build.
- SolidJS `createSignal` for any interactive demos (model selector animation, feature tab switching).
- Vite handles asset optimization — use `import.meta.url` for image paths.
- No SSR assumed — single-page or multi-page static is fine for a marketing site.
- Lazy-load any product screenshots/videos below the fold.
- Use `prefers-reduced-motion` media query to disable glow animations for accessibility.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Anti-Patterns

1. **Dark-only design** — Alternate dark/light sections. Pure dark loses the luminous contrast that makes "light" meaningful.
2. **VS Code blue (#007ACC) as primary** — We deliberately chose indigo to differentiate. Don't reintroduce the Microsoft palette.
3. **Inter or Geist as the display font** — Every dev tool uses them. Syne is the differentiator. Keep it.
4. **More than 2 CTAs competing in the hero** — One primary ("Install for VS Code"), one secondary ("See how it works"). Done.
5. **Stock photography** — Zero people photos. Product screenshots, code, abstract gradients only. Developer audiences distrust stock.
6. **Parallax effects** — Performance hit, accessibility problems, not needed when the glow effects do the work.
7. **Long text blocks without visual breaks** — Every paragraph after the hero should be ≤3 sentences before a visual element.
