# UI Design Contract: Lucent Code Marketing Site

> **Purpose:** This contract defines the visual and interaction specification for the Lucent Code marketing site.
> It is produced by `ui-phase` before implementation and used by `ui-review` to audit the result.

**Date:** 2026-03-20
**Phase:** Marketing Site v1
**Design system:** `docs/design/MASTER.md`
**Marketing brief:** `docs/plans/2026-03-17-lucent-code-marketing.md`

---

## Design System

Design system sourced from `docs/design/MASTER.md`. Summary of key tokens:

### Colors

| Token | Value | Usage |
|---|---|---|
| `--color-primary` | `#6366F1` | CTAs, active states, key highlights |
| `--color-primary-hover` | `#4F46E5` | Button hover |
| `--color-secondary` | `#8B5CF6` | Feature accents, icon backgrounds |
| `--color-highlight` | `#22D3EE` | Code highlights, tag pills |
| `--color-dark-base` | `#08090F` | Hero, footer background |
| `--color-dark-surface` | `#0F1017` | Cards on dark sections |
| `--color-dark-fg` | `#F1F5F9` | Primary text on dark |
| `--color-dark-fg-muted` | `#94A3B8` | Secondary text on dark |
| `--color-background` | `#F8F9FC` | Light section backgrounds |
| `--color-surface` | `#FFFFFF` | Cards on light sections |
| `--color-text` | `#0F172A` | Primary text on light |
| `--color-text-muted` | `#64748B` | Secondary text on light |
| `--color-border` | `#E2E8F0` | Borders on light |
| `--color-dark-border` | `rgba(255,255,255,0.08)` | Borders on dark |
| `--gradient-brand` | `linear-gradient(135deg, #6366F1, #8B5CF6, #22D3EE)` | Brand gradient |
| `--gradient-text` | `linear-gradient(90deg, #818CF8, #C084FC, #22D3EE)` | Gradient text on hero |
| `--gradient-glow` | `radial-gradient(ellipse at 60% 0%, rgba(99,102,241,0.35), transparent 70%)` | Hero bg glow |

### Typography

| Role | Font | Size | Weight | Line-height |
|---|---|---|---|---|
| Display (hero) | Syne | 72–96px | 900 | 1.05 |
| H1 (section) | Syne | 48px | 800 | 1.1 |
| H2 | Syne | 36px | 700 | 1.2 |
| H3 (card title) | Syne | 24px | 700 | 1.3 |
| Body-lg (lead) | DM Sans | 18px | 400 | 1.7 |
| Body | DM Sans | 16px | 400 | 1.6 |
| Label / eyebrow | DM Sans | 12px | 600 | 1.4 |
| Mono | JetBrains Mono | 14px | 400 | 1.6 |

### Spacing

Base unit: 4px. Key marketing values:
- Section `padding-block`: 96px desktop / 64px tablet / 48px mobile
- Content `max-width`: 1200px centered
- Text column `max-width`: 720px

### Component Library

- [x] Custom CSS (CSS custom properties, no framework)

---

## UI Surface Area

Single-page site (`index.html`). One route, 8 sections rendered in order:

1. `<NavBar>` — sticky top navigation
2. `<HeroSection>` — full-viewport dark hero
3. `<SocialProofStrip>` — model logos / "works with" strip
4. `<CoreFeaturesGrid>` — 3-column light features section
5. `<DemoSection>` — dark "how it works" code showcase
6. `<AdvancedFeaturesGrid>` — 4-column light advanced features
7. `<CtaBanner>` — gradient CTA section
8. `<Footer>` — dark footer

---

## Components

### Component: `NavBar`

**Purpose:** Sticky top navigation bar — logo, nav links, primary install CTA.

**Props API:**

| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| `links` | `{ label: string; href: string }[]` | Yes | — | Nav link items |
| `ctaLabel` | `string` | No | `"Install free"` | Primary CTA button text |
| `ctaHref` | `string` | Yes | — | VS Code marketplace URL |

**Variants:**
- `transparent` — default (on dark hero background): transparent background, border-bottom hidden
- `solid` — scrolled state: `background: rgba(8,9,15,0.85)`, `backdrop-filter: blur(12px)`, thin border-bottom `var(--color-dark-border)`

**States:**
- Default (at top): transparent
- Scrolled (>80px): transitions to solid with blur — `transition: background 200ms ease`
- Mobile: hamburger menu replaces nav links

**Visual notes:**
- Height: 64px
- Logo: Lucent Code wordmark, `--color-dark-fg`, Syne weight 800, 18px
- Nav links: `--color-dark-fg-muted`, 14px DM Sans weight 500; hover: `--color-dark-fg`
- CTA button: primary variant, height 36px (compact in nav), `border-radius: var(--radius-md)`
- `position: sticky; top: 0; z-index: 50`

---

### Component: `HeroSection`

**Purpose:** Full-viewport opening section — headline, subtext, two CTAs, radial glow background.

**Props API:** None (static content section)

**Visual structure:**
```
[NavBar above]
┌─────────────────────────────────────────────────┐
│  Background: #08090F                            │
│  + radial glow: rgba(99,102,241,0.35) top-right │
│                                                 │
│  [Badge] "Now with MCP support"                 │
│                                                 │
│  Write code in a new [light]      ← display/900 │
│  (gradient on "light")                          │
│                                                 │
│  Other tools search your files.                 │
│  Lucent Code reads your code.     ← body-lg     │
│                                                 │
│  [Install for VS Code ▸]  [See how it works →]  │
│   primary btn              secondary btn        │
│                                                 │
│  [Code Showcase — chat panel screenshot/demo]   │
└─────────────────────────────────────────────────┘
```

**States:**
- Static (no loading state — content is hardcoded)
- Glow animation: subtle pulsing `opacity` on `--gradient-glow` layer, 4s ease-in-out infinite. Disabled with `prefers-reduced-motion`.

**Visual notes:**
- Min-height: 100vh
- Headline: display type, 72px desktop / 56px tablet / 42px mobile
- "light" in headline: `<GradientText>` component
- Hero subtext: body-lg, `--color-dark-fg-muted`, max-width 560px, centered
- CTA row: `gap: 16px; margin-top: 32px`; primary button height 52px, secondary height 52px
- Code showcase: rendered below CTAs, `margin-top: 64px`, max-width 860px, centered, has glow-card + glow-primary shadow
- Padding-top: 160px desktop (below navbar), 120px tablet, 96px mobile

---

### Component: `GradientText`

**Purpose:** Inline span that renders text with the brand gradient.

**Props API:**

| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| `children` | `JSX.Element` | Yes | — | Text content |

**Visual notes:**
- `background: var(--gradient-text); -webkit-background-clip: text; -webkit-text-fill-color: transparent`
- Inherits font size/weight from parent

---

### Component: `SocialProofStrip`

**Purpose:** Horizontal strip showing "Works with" AI model logos to establish trust/range.

**Props API:**

| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| `label` | `string` | No | `"Works with every major model"` | Strip label |
| `models` | `{ name: string; logo?: string }[]` | Yes | — | Model entries |

**Variants:**
- `dark` — on dark background (used here, immediately below hero)

**Visual notes:**
- Background: `--color-dark-elevated` (`#16171F`), `border-top` and `border-bottom: 1px solid var(--color-dark-border)`
- Padding: 24px vertical
- Label: 12px label style, `--color-dark-fg-muted`, centered above logos
- Models: grayscale logos or text badges (name-only fallback), rendered in a flex row, centered, `gap: 32px`
- Logos: opacity 0.5, hover opacity 0.9 — keeps focus on the headline content
- Models to include: Claude, GPT-4o, Gemini, Mistral, Llama, + "and more via OpenRouter"

---

### Component: `FeatureCard`

**Purpose:** Icon + heading + description card. Used in light-background feature grids.

**Props API:**

| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| `icon` | `string` | Yes | — | Emoji or SVG icon |
| `title` | `string` | Yes | — | Card heading (H3) |
| `description` | `string` | Yes | — | 2-line description (body) |
| `badge` | `string` | No | — | Optional badge label (e.g. "LSP-powered") |
| `variant` | `"light" \| "dark"` | No | `"light"` | Surface variant |

**Variants:**
- `light` — white background, border `--color-border`, shadow-md, lifts on hover
- `dark` — `--color-dark-surface` background, border `--color-dark-border`, glow-card shadow

**States:**
- Default
- Hover: `translateY(-2px)`, shadow-lg (light) or border glow (dark)

**Visual notes:**
- Padding: `var(--space-8)` (32px)
- Border-radius: `var(--radius-lg)` (12px) light / `var(--radius-xl)` (16px) dark
- Icon container: 48×48px, rounded-md, gradient background `rgba(99,102,241,0.15) → rgba(139,92,246,0.15)`, centered emoji/SVG
- Title: H3 style (24px Syne 700), `margin-top: 16px`
- Description: body (16px DM Sans 400), `--color-text-muted` (light) / `--color-dark-fg-muted` (dark)
- Badge (optional): rendered below description with `margin-top: 12px`

---

### Component: `CoreFeaturesGrid`

**Purpose:** Light-background 3-column grid showcasing the three core differentiators.

**Props API:** None (static content)

**Cards (3):**
1. **LSP-first intelligence** — "Understands your code the way VS Code does — symbols, types, references, and live diagnostics from your language server." Badge: "LSP-powered"
2. **Any model via OpenRouter** — "Switch between Claude, GPT-4o, Gemini, Mistral, Llama, and more with a single API key. No vendor lock-in." Badge: "Multi-model"
3. **Streaming chat panel** — "Fast side-panel chat with Markdown, syntax-highlighted code, copy/insert buttons, and real-time responses." Badge: "Built for VS Code"

**Visual notes:**
- Section background: `--color-background` (`#F8F9FC`)
- Eyebrow: "What makes it different"
- Section heading (H1): "The AI that reads code, not files"
- Section subtext: body-lg, max-width 600px, centered, `--color-text-muted`
- Grid: `display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px`
- Grid margin-top: 48px from heading

---

### Component: `DemoSection`

**Purpose:** Dark "how it works" section with a large code showcase and 3 annotated step callouts.

**Props API:** None (static content)

**Visual structure:**
```
┌─────────────────────────────────────────────────┐
│  Background: #08090F + subtle glow              │
│                                                 │
│  [Eyebrow] "See it in action"                   │
│  [H1] "Your language server, now in AI"         │
│  [Body-lg subtext]                              │
│                                                 │
│  ┌──────────────────┐  ┌───────────────────┐    │
│  │  CodeShowcase    │  │ Step callouts (3) │    │
│  │  (left, 55%)     │  │ (right, 40%)      │    │
│  └──────────────────┘  └───────────────────┘    │
└─────────────────────────────────────────────────┘
```

**Step callouts (3):**
1. "Ask a question" — "Type in the chat panel. The AI has full access to your language server."
2. "Get precise answers" — "Lucent Code resolves symbols and types — not guessed from text, but read from your LSP."
3. "Take action" — "Accept edits, apply quick fixes, rename symbols — with your approval at every step."

**Visual notes:**
- Layout: 2-column flex on desktop, stacked on tablet/mobile
- CodeShowcase: left column, glow-card + glow-primary shadow
- Step callouts: right column, vertically stacked with `gap: 32px`; each has a numbered circle (indigo, 32px), title H3, body text
- Numbered circle: `background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.3); color: #818CF8`

---

### Component: `CodeShowcase`

**Purpose:** Faux VS Code window frame containing a screenshot or rendered representation of the Lucent Code chat panel.

**Props API:**

| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| `imageSrc` | `string` | No | — | Screenshot path (lazy-loaded) |
| `children` | `JSX.Element` | No | — | Rendered content if no imageSrc |

**Visual notes:**
- Outer container: `--radius-xl` (16px), `overflow: hidden`, `border: 1px solid var(--color-dark-border)`, `box-shadow: var(--glow-card), var(--glow-primary)`
- Title bar: `--color-dark-elevated`, height 36px, flex row with 3 dot circles (12px, `var(--color-dark-border)`), optional filename label center
- Content area: `--color-dark-surface`, contains screenshot or inline demo
- If no screenshot available yet: render a placeholder with gradient background + "Chat panel screenshot" text in mono style

---

### Component: `AdvancedFeaturesGrid`

**Purpose:** Light-background 4-column (or 2×2) grid of advanced/secondary features.

**Props API:** None (static content)

**Cards (4):**
1. **Inline completions** — "Ghost-text suggestions as you type. Auto or manual trigger with `Alt+\`." Icon: ⚡
2. **Skills system** — "Load Claude Code-style skill sets from GitHub, npm, or the marketplace." Icon: 🧩
3. **MCP support** — "Connect external tools via Model Context Protocol." Icon: 🔌
4. **Git worktrees** — "Isolate AI sessions to git worktrees — keep your workspace clean." Icon: 🌿

**Visual notes:**
- Section background: `--color-background`
- Eyebrow: "And there's more"
- Section heading (H1): "Everything a modern AI assistant should be"
- Grid: `grid-template-columns: repeat(4, 1fr)` desktop, `repeat(2, 1fr)` tablet, `1fr` mobile; gap 24px
- Cards use FeatureCard `variant="light"`

---

### Component: `CtaBanner`

**Purpose:** Full-width gradient conversion section — large headline + primary CTA + trust signals.

**Props API:** None (static content)

**Visual structure:**
```
┌─────────────────────────────────────────────────┐
│  Background: var(--gradient-brand) + dark overlay│
│  or: dark base + gradient border top/bottom     │
│                                                 │
│  [H1] "Write code in a new light."              │
│  [Body-lg] "Free. No account needed. Install in │
│             seconds from the VS Code marketplace."│
│                                                 │
│  [Install for VS Code ▸]                        │
│  [No credit card required · Open source]        │
└─────────────────────────────────────────────────┘
```

**Visual notes:**
- Background option: `--color-dark-base` with `border-top: 1px solid; border-image: var(--gradient-brand) 1`
- OR: semi-transparent gradient overlay on dark base — `background: linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08), rgba(34,211,238,0.06))`
- Prefer the subtle overlay — avoids competing visually with hero
- Heading: H1 Syne 800, `--color-dark-fg`, centered
- CTA button: primary variant, height 52px, centered; below it a small trust line in `--color-dark-fg-muted` (12px)
- Trust line: "No credit card required · Free tier via OpenRouter · Open source"

---

### Component: `Footer`

**Purpose:** 4-column dark footer — logo, navigation groups, social links, legal.

**Props API:** None (static content)

**Column structure:**
```
Logo + tagline  |  Product       |  Resources      |  Connect
                |  Features      |  GitHub         |  Twitter/X
                |  Changelog     |  OpenRouter     |  VS Code Marketplace
                |  Roadmap       |  Docs (future)  |
                                                   |
──────────────────────────────────────────────────────────────
© 2026 Lucent Code · lucentcode.com · MIT License
```

**Visual notes:**
- Background: `--color-dark-base`
- `border-top: 1px solid var(--color-dark-border)`
- Column headings: 12px label style, `--color-dark-fg-muted`, uppercase, letter-spacing
- Links: 14px DM Sans, `--color-dark-fg-muted`; hover: `--color-dark-fg`
- Bottom bar: `border-top: 1px solid var(--color-dark-border)`, flex row, copyright left, legal links right
- Padding: `var(--space-24)` top, `var(--space-8)` bottom

---

### Component: `Button`

**Purpose:** Reusable CTA button with primary, secondary, and ghost variants.

**Props API:**

| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| `variant` | `"primary" \| "secondary" \| "ghost"` | No | `"primary"` | Visual style |
| `size` | `"sm" \| "md" \| "lg"` | No | `"md"` | Height: 36 / 44 / 52px |
| `href` | `string` | No | — | Renders as `<a>` if provided |
| `children` | `JSX.Element` | Yes | — | Button content |
| `disabled` | `boolean` | No | `false` | Disabled state |

**Visual notes:**
- Primary: `background: --color-primary`, glow-primary shadow, hover lifts 1px
- Secondary: transparent, `border: 1px solid --color-dark-border`, hover border indigo
- Ghost: no border/bg, text only, underline on hover
- All: `border-radius: var(--radius-md)`, `font-weight: 600`, `transition: 120ms`
- Disabled: `opacity: 0.4; cursor: not-allowed`

---

### Component: `Badge`

**Purpose:** Small pill label for feature tags and eyebrow callouts.

**Props API:**

| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| `variant` | `"primary" \| "cyan" \| "muted"` | No | `"primary"` | Color style |
| `children` | `JSX.Element` | Yes | — | Label text |

**Visual notes:** See MASTER.md badge patterns.

---

### Component: `Eyebrow`

**Purpose:** Small uppercase label displayed above section headings.

**Props API:**

| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| `children` | `JSX.Element` | Yes | — | Label text |

**Visual notes:** 12px DM Sans 600, `--color-primary`, `letter-spacing: 0.08em`, uppercase. See MASTER.md eyebrow pattern.

---

## Layout Specification

### Desktop (≥1280px)

```
┌─────────────────────────────────────────────────────┐
│  NavBar (sticky, 64px, transparent → blur-solid)    │
├─────────────────────────────────────────────────────┤
│  HeroSection                                        │
│  ┌──────────────────────────────────────────┐       │
│  │  [Badge]                                 │       │
│  │  HEADLINE (display, centered, 72px)      │       │
│  │  Subtext (body-lg, centered, max 560px)  │       │
│  │  [Primary CTA]  [Secondary CTA]          │       │
│  │  [CodeShowcase — centered, max 860px]    │       │
│  └──────────────────────────────────────────┘       │
├─────────────────────────────────────────────────────┤
│  SocialProofStrip (logos row, centered)             │
├─────────────────────────────────────────────────────┤
│  CoreFeaturesGrid (light bg, max-width 1200px)      │
│  [Eyebrow]  [H1 heading]  [Subtext]                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ Card 1   │  │ Card 2   │  │ Card 3   │           │
│  └──────────┘  └──────────┘  └──────────┘           │
├─────────────────────────────────────────────────────┤
│  DemoSection (dark bg, max-width 1200px)            │
│  [Eyebrow]  [H1]  [Subtext]                         │
│  ┌──────────────────────┐  ┌──────────────────┐     │
│  │  CodeShowcase (55%)  │  │  Step callouts   │     │
│  │                      │  │  1. Ask          │     │
│  │                      │  │  2. Get answers  │     │
│  │                      │  │  3. Take action  │     │
│  └──────────────────────┘  └──────────────────┘     │
├─────────────────────────────────────────────────────┤
│  AdvancedFeaturesGrid (light bg, max-width 1200px)  │
│  [Eyebrow]  [H1]                                    │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐            │
│  │ C 1  │  │ C 2  │  │ C 3  │  │ C 4  │            │
│  └──────┘  └──────┘  └──────┘  └──────┘            │
├─────────────────────────────────────────────────────┤
│  CtaBanner (dark + gradient overlay, centered)      │
│  [H1]  [Body-lg]  [Primary CTA]  [Trust line]       │
├─────────────────────────────────────────────────────┤
│  Footer (dark bg)                                   │
│  [Logo + tagline] [Product] [Resources] [Connect]   │
│  ─────────────────────────────────────────────────  │
│  [© 2026 Lucent Code]           [Legal links]       │
└─────────────────────────────────────────────────────┘
```

- Content max-width: 1200px, `margin: 0 auto; padding: 0 32px`
- Text columns: max-width 720px, centered

### Tablet (768px–1279px)

- NavBar: hamburger replaces nav links; links shown in full-width dropdown menu
- HeroSection: headline 56px; CodeShowcase max-width 600px
- SocialProofStrip: logos wrap if needed
- CoreFeaturesGrid: 3 columns → **2 columns** (card 3 centered on second row)
- DemoSection: 2-column flex → **stacked** (CodeShowcase above, step callouts below)
- AdvancedFeaturesGrid: 4 columns → **2×2 grid**
- CtaBanner: same, narrower padding
- Footer: 4 columns → **2×2 grid**

### Mobile (<768px)

- NavBar: hamburger, full-screen overlay menu on open
- HeroSection: headline 42px; single-column; CTAs stack vertically; CodeShowcase below CTAs, full-width
- SocialProofStrip: 2-column logo grid or horizontal scroll
- CoreFeaturesGrid: **1 column** (cards stacked)
- DemoSection: stacked; CodeShowcase full-width; step callouts below
- AdvancedFeaturesGrid: **1 column** (cards stacked)
- CtaBanner: centered, full-width CTA button
- Footer: **1 column** (sections stacked), logo first

**Touch targets:** All interactive elements minimum 44×44px.

---

## Interaction States

### NavBar
| State | Trigger | UI |
|---|---|---|
| Transparent | Page at top | No background |
| Solid | Scroll > 80px | `rgba(8,9,15,0.85)` + `backdrop-filter: blur(12px)` + border-bottom |
| Mobile open | Hamburger click | Full-screen overlay, links stacked, close button |
| Mobile closed | Close / nav link click | Overlay hidden |

### Buttons
| State | UI |
|---|---|
| Default | Per variant spec |
| Hover | Primary: lifts 1px + stronger glow; Secondary: border indigo tint |
| Active / pressed | `transform: translateY(0)`, slightly darker bg |
| Focus | `outline: 2px solid var(--color-primary); outline-offset: 2px` |
| Disabled | `opacity: 0.4; cursor: not-allowed` |

### Feature Cards
| State | UI |
|---|---|
| Default | Resting |
| Hover | `translateY(-2px)`, shadow-lg (light) / border glow (dark) |

### Hero glow
| State | UI |
|---|---|
| Default | Radial glow rendered |
| `prefers-reduced-motion` | Glow static (no animation) |

### No form states
This is a static marketing site — no forms, no loading states, no error states at the page level. The only dynamic behavior is:
- NavBar scroll state
- Mobile menu open/close
- Hover interactions on cards and buttons
- (Optional) Animated entrance on scroll via `IntersectionObserver` — fade-up, 400ms, staggered per card. Disabled with `prefers-reduced-motion`.

---

## Accessibility Requirements

- **Landmark roles:** `<header>` for NavBar, `<main>` for page content, `<footer>` for Footer, `<nav>` inside header
- **Headings hierarchy:** `<h1>` only once per page (hero headline); sections use `<h2>` for section headings, `<h3>` for card titles
- **Skip link:** `<a href="#main-content" class="skip-link">Skip to content</a>` as first element in `<body>`, visually hidden until focused
- **Keyboard navigation:**
  - All nav links and CTAs reachable by Tab
  - Mobile menu: trap focus within overlay when open; Escape closes it; return focus to hamburger button on close
  - Buttons: Enter and Space activate
- **ARIA:**
  - Hamburger button: `aria-label="Open menu"` / `aria-label="Close menu"`, `aria-expanded`
  - Mobile overlay: `aria-modal="true"`, `role="dialog"`, `aria-label="Navigation menu"`
  - Icon-only buttons (if any): `aria-label` required
  - GradientText span: no ARIA needed (presentational)
- **Color contrast:**
  - `--color-dark-fg` (#F1F5F9) on `--color-dark-base` (#08090F): ~14:1 — WCAG AAA
  - `--color-text` (#0F172A) on `--color-surface` (#FFFFFF): ~19:1 — WCAG AAA
  - `--color-primary` (#6366F1) on `--color-dark-base` (#08090F): ~4.6:1 — WCAG AA ✓
  - `--color-dark-fg-muted` (#94A3B8) on `--color-dark-base` (#08090F): ~6.2:1 — WCAG AA ✓
  - Badge text `#818CF8` on dark base: ~4.7:1 — WCAG AA ✓ — verify after implementation
- **Images:** Any product screenshots require `alt` text describing the UI shown
- **Reduced motion:** `@media (prefers-reduced-motion: reduce)` disables all animations and transitions (already in MASTER.md)
- **Font loading:** Use `font-display: swap` on Google Fonts import to prevent invisible text during load

---

## Open Questions

1. **CodeShowcase content** — Is a screenshot available? If not, should we render an animated/live demo, a static mockup, or a stylised code snippet? *(TBD — needs asset decision before implementation)*
2. **SocialProofStrip logos** — Do we have SVG assets for Claude, GPT-4o, Gemini, etc.? If not, use text-only badges as fallback. *(TBD)*
3. **VS Code Marketplace install link** — The primary CTA deep-links to the marketplace. Is the extension published? If not, CTA should say "Coming soon" or link to a waitlist. *(TBD)*
4. **Changelog / Roadmap pages** — Footer references these. Are they separate pages or anchors on the marketing page? *(Out of scope for v1 — footer links can be `#` placeholders)*
5. **Scroll entrance animations** — Include fade-up `IntersectionObserver` animations on feature cards? Nice touch but adds JS complexity. *(Optional — implement if time allows, skip for v1 if tight)*
