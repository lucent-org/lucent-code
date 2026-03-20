# Lucent Code Marketing Site — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a single-page SolidJS marketing site for the Lucent Code VS Code extension that stands out in the marketplace with a bold luminous design.

**Architecture:** Standalone Vite + SolidJS app in `marketing/` — completely separate from the VS Code extension and webview builds. Uses pure CSS custom properties (no Tailwind) per the design system. Static output, no SSR.

**Tech Stack:** SolidJS 1.8, Vite 5, TypeScript, CSS custom properties, Vitest + @solidjs/testing-library for component tests

**Design references:**
- Design system: `docs/design/MASTER.md`
- UI contract: `docs/plans/2026-03-20-marketing-site-ui-contract.md`
- Marketing copy: `docs/plans/2026-03-17-lucent-code-marketing.md`

---

### Task 1: Scaffold the marketing project

**Files:**
- Create: `marketing/package.json`
- Create: `marketing/vite.config.ts`
- Create: `marketing/tsconfig.json`
- Create: `marketing/index.html`
- Create: `marketing/src/index.tsx`
- Create: `marketing/src/App.tsx`

**Step 1: Create `marketing/package.json`**

```json
{
  "name": "lucent-code-marketing",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "solid-js": "^1.8.0"
  },
  "devDependencies": {
    "@solidjs/testing-library": "^0.8.0",
    "@testing-library/jest-dom": "^6.0.0",
    "@types/node": "^20.0.0",
    "jsdom": "^24.0.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0",
    "vite-plugin-solid": "^2.8.0",
    "vitest": "^2.0.0"
  }
}
```

**Step 2: Create `marketing/vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solidPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
```

**Step 3: Create `marketing/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    "strict": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

**Step 4: Create `marketing/src/test-setup.ts`**

```typescript
import '@testing-library/jest-dom';
```

**Step 5: Create `marketing/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="The only VS Code AI that uses your language server — not text search. Chat, completions, and code intelligence in one." />
    <title>Lucent Code — Write code in a new light.</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
    <script type="module" src="/src/index.tsx"></script>
  </head>
  <body>
    <a href="#main-content" class="skip-link">Skip to content</a>
    <div id="root"></div>
  </body>
</html>
```

**Step 6: Create `marketing/src/index.tsx`**

```tsx
import { render } from 'solid-js/web';
import App from './App';
import './styles/tokens.css';
import './styles/base.css';

render(() => <App />, document.getElementById('root')!);
```

**Step 7: Create `marketing/src/App.tsx`** (stub — populated in Task 12)

```tsx
export default function App() {
  return <main id="main-content"><p>Lucent Code</p></main>;
}
```

**Step 8: Install dependencies**

```bash
cd marketing && npm install
```

**Step 9: Verify dev server starts**

```bash
cd marketing && npm run dev
```
Expected: Vite dev server running, browser shows "Lucent Code"

**Step 10: Commit**

```bash
git add marketing/
git commit -m "feat(marketing): scaffold SolidJS marketing site"
```

---

### Task 2: CSS design tokens and base styles

**Files:**
- Create: `marketing/src/styles/tokens.css`
- Create: `marketing/src/styles/base.css`

**Step 1: Create `marketing/src/styles/tokens.css`**

All tokens from `docs/design/MASTER.md`:

```css
:root {
  /* Brand gradients */
  --gradient-brand: linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #22D3EE 100%);
  --gradient-glow: radial-gradient(ellipse at 60% 0%, rgba(99,102,241,0.35) 0%, transparent 70%);
  --gradient-text: linear-gradient(90deg, #818CF8, #C084FC, #22D3EE);

  /* Primary */
  --color-primary: #6366F1;
  --color-primary-hover: #4F46E5;
  --color-primary-glow: rgba(99, 102, 241, 0.25);
  --color-primary-fg: #FFFFFF;

  /* Secondary */
  --color-secondary: #8B5CF6;
  --color-secondary-fg: #FFFFFF;

  /* Highlight */
  --color-highlight: #22D3EE;
  --color-highlight-muted: rgba(34, 211, 238, 0.15);

  /* Dark surfaces */
  --color-dark-base: #08090F;
  --color-dark-surface: #0F1017;
  --color-dark-elevated: #16171F;
  --color-dark-border: rgba(255, 255, 255, 0.08);
  --color-dark-fg: #F1F5F9;
  --color-dark-fg-muted: #94A3B8;

  /* Light surfaces */
  --color-background: #F8F9FC;
  --color-surface: #FFFFFF;
  --color-surface-muted: #F1F4F9;
  --color-border: #E2E8F0;
  --color-text: #0F172A;
  --color-text-muted: #64748B;

  /* Semantic */
  --color-success: #10B981;
  --color-warning: #F59E0B;
  --color-error: #EF4444;

  /* Typography */
  --font-display: 'Syne', system-ui, sans-serif;
  --font-body: 'DM Sans', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;
  --space-24: 96px;
  --space-32: 128px;

  /* Border radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-2xl: 24px;
  --radius-full: 9999px;

  /* Shadows (light sections) */
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
  --shadow-lg: 0 8px 24px rgba(0,0,0,0.10);

  /* Glow (dark sections) */
  --glow-primary: 0 0 24px rgba(99,102,241,0.4), 0 0 48px rgba(99,102,241,0.2);
  --glow-cyan: 0 0 24px rgba(34,211,238,0.3), 0 0 48px rgba(34,211,238,0.15);
  --glow-card: 0 1px 0 rgba(255,255,255,0.05) inset, 0 8px 32px rgba(0,0,0,0.4);
}
```

**Step 2: Create `marketing/src/styles/base.css`**

```css
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  scroll-behavior: smooth;
}

body {
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.6;
  background: var(--color-dark-base);
  color: var(--color-dark-fg);
  -webkit-font-smoothing: antialiased;
}

/* Skip link */
.skip-link {
  position: absolute;
  top: -100%;
  left: var(--space-4);
  padding: var(--space-2) var(--space-4);
  background: var(--color-primary);
  color: var(--color-primary-fg);
  border-radius: var(--radius-md);
  font-weight: 600;
  z-index: 9999;
  text-decoration: none;
}
.skip-link:focus {
  top: var(--space-4);
}

/* Container */
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--space-8);
}

@media (max-width: 768px) {
  .container {
    padding: 0 var(--space-4);
  }
}

/* Section padding */
.section {
  padding-block: var(--space-24);
}
@media (max-width: 1279px) {
  .section { padding-block: var(--space-16); }
}
@media (max-width: 768px) {
  .section { padding-block: var(--space-12); }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

**Step 3: Write token test**

Create `marketing/src/styles/tokens.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

// Smoke test: verify the CSS files exist and are importable
// (actual token values are verified visually via ui-review)
describe('design tokens', () => {
  it('tokens.css file exists', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const file = path.resolve(__dirname, 'tokens.css');
    expect(fs.existsSync(file)).toBe(true);
  });

  it('base.css file exists', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const file = path.resolve(__dirname, 'base.css');
    expect(fs.existsSync(file)).toBe(true);
  });
});
```

**Step 4: Run test**

```bash
cd marketing && npm test
```
Expected: 2 tests pass

**Step 5: Commit**

```bash
git add marketing/src/styles/
git commit -m "feat(marketing): add CSS design tokens and base styles"
```

---

### Task 3: Shared primitive components — Button, Badge, Eyebrow, GradientText

**Files:**
- Create: `marketing/src/components/Button.tsx`
- Create: `marketing/src/components/Button.css`
- Create: `marketing/src/components/Badge.tsx`
- Create: `marketing/src/components/Eyebrow.tsx`
- Create: `marketing/src/components/GradientText.tsx`
- Create: `marketing/src/components/primitives.test.tsx`

**Step 1: Write failing tests**

Create `marketing/src/components/primitives.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@solidjs/testing-library';
import Button from './Button';
import Badge from './Badge';
import Eyebrow from './Eyebrow';
import GradientText from './GradientText';

describe('Button', () => {
  it('renders children', () => {
    render(() => <Button>Install free</Button>);
    expect(screen.getByText('Install free')).toBeInTheDocument();
  });

  it('renders as anchor when href provided', () => {
    render(() => <Button href="https://example.com">Install</Button>);
    const el = screen.getByText('Install');
    expect(el.closest('a')).toHaveAttribute('href', 'https://example.com');
  });

  it('applies secondary variant class', () => {
    render(() => <Button variant="secondary">See how</Button>);
    const el = screen.getByText('See how');
    expect(el.closest('button, a')).toHaveClass('btn--secondary');
  });

  it('is disabled when disabled prop set', () => {
    render(() => <Button disabled>Disabled</Button>);
    expect(screen.getByText('Disabled').closest('button')).toBeDisabled();
  });
});

describe('Badge', () => {
  it('renders label text', () => {
    render(() => <Badge>LSP-powered</Badge>);
    expect(screen.getByText('LSP-powered')).toBeInTheDocument();
  });

  it('applies cyan variant', () => {
    render(() => <Badge variant="cyan">MCP</Badge>);
    expect(screen.getByText('MCP')).toHaveClass('badge--cyan');
  });
});

describe('Eyebrow', () => {
  it('renders text', () => {
    render(() => <Eyebrow>What makes it different</Eyebrow>);
    expect(screen.getByText('What makes it different')).toBeInTheDocument();
  });
});

describe('GradientText', () => {
  it('renders children', () => {
    render(() => <GradientText>light</GradientText>);
    expect(screen.getByText('light')).toBeInTheDocument();
  });
});
```

**Step 2: Run to confirm failure**

```bash
cd marketing && npm test
```
Expected: FAIL — modules not found

**Step 3: Create `marketing/src/components/GradientText.tsx`**

```tsx
import { JSX } from 'solid-js';

interface Props { children: JSX.Element }

export default function GradientText(props: Props) {
  return <span class="gradient-text">{props.children}</span>;
}
```

Add to `base.css`:
```css
.gradient-text {
  background: var(--gradient-text);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

**Step 4: Create `marketing/src/components/Eyebrow.tsx`**

```tsx
import { JSX } from 'solid-js';

interface Props { children: JSX.Element }

export default function Eyebrow(props: Props) {
  return <p class="eyebrow">{props.children}</p>;
}
```

Add to `base.css`:
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

**Step 5: Create `marketing/src/components/Badge.tsx`**

```tsx
import { JSX } from 'solid-js';

interface Props {
  children: JSX.Element;
  variant?: 'primary' | 'cyan' | 'muted';
}

export default function Badge(props: Props) {
  const variant = () => props.variant ?? 'primary';
  return <span class={`badge badge--${variant()}`}>{props.children}</span>;
}
```

Add to `base.css`:
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
.badge--primary {
  background: rgba(99, 102, 241, 0.12);
  color: #818CF8;
  border: 1px solid rgba(99, 102, 241, 0.2);
}
.badge--cyan {
  background: rgba(34, 211, 238, 0.1);
  color: #22D3EE;
  border: 1px solid rgba(34, 211, 238, 0.2);
}
.badge--muted {
  background: rgba(255, 255, 255, 0.06);
  color: var(--color-dark-fg-muted);
  border: 1px solid var(--color-dark-border);
}
```

**Step 6: Create `marketing/src/components/Button.tsx`**

```tsx
import { JSX, splitProps } from 'solid-js';

interface Props {
  children: JSX.Element;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  href?: string;
  disabled?: boolean;
  class?: string;
  onClick?: () => void;
}

export default function Button(props: Props) {
  const [local, rest] = splitProps(props, ['children', 'variant', 'size', 'href', 'class']);
  const variant = () => local.variant ?? 'primary';
  const size = () => local.size ?? 'md';
  const classes = () => `btn btn--${variant()} btn--${size()}${local.class ? ` ${local.class}` : ''}`;

  if (local.href) {
    return <a href={local.href} class={classes()} {...rest}>{local.children}</a>;
  }
  return <button class={classes()} {...rest}>{local.children}</button>;
}
```

Create `marketing/src/components/Button.css`:
```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  border: none;
  border-radius: var(--radius-md);
  font-family: var(--font-body);
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease, border-color 120ms ease;
  white-space: nowrap;
}
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }

/* Sizes */
.btn--sm { height: 36px; padding: 0 var(--space-4); font-size: 14px; }
.btn--md { height: 44px; padding: 0 var(--space-6); font-size: 15px; }
.btn--lg { height: 52px; padding: 0 var(--space-8); font-size: 16px; }

/* Primary */
.btn--primary {
  background: var(--color-primary);
  color: var(--color-primary-fg);
  box-shadow: var(--glow-primary);
}
.btn--primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
  transform: translateY(-1px);
  box-shadow: 0 0 32px rgba(99,102,241,0.5), 0 0 64px rgba(99,102,241,0.25);
}

/* Secondary */
.btn--secondary {
  background: transparent;
  color: var(--color-dark-fg);
  border: 1px solid var(--color-dark-border);
}
.btn--secondary:hover:not(:disabled) {
  border-color: rgba(99, 102, 241, 0.5);
  background: rgba(99, 102, 241, 0.08);
}

/* Ghost */
.btn--ghost {
  background: transparent;
  color: var(--color-dark-fg-muted);
  border: none;
}
.btn--ghost:hover:not(:disabled) { color: var(--color-dark-fg); }
```

Import Button.css in index.tsx (add to existing imports):
```tsx
import './components/Button.css';
```

**Step 7: Run tests**

```bash
cd marketing && npm test
```
Expected: all tests pass

**Step 8: Commit**

```bash
git add marketing/src/components/
git commit -m "feat(marketing): add Button, Badge, Eyebrow, GradientText components"
```

---

### Task 4: NavBar component

**Files:**
- Create: `marketing/src/components/NavBar.tsx`
- Create: `marketing/src/components/NavBar.css`
- Create: `marketing/src/components/NavBar.test.tsx`

**Step 1: Write failing test**

Create `marketing/src/components/NavBar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@solidjs/testing-library';
import NavBar from './NavBar';

const links = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#demo' },
];

describe('NavBar', () => {
  it('renders logo text', () => {
    render(() => <NavBar links={links} ctaHref="#install" />);
    expect(screen.getByText('Lucent Code')).toBeInTheDocument();
  });

  it('renders nav links on desktop (hidden on mobile via CSS — present in DOM)', () => {
    render(() => <NavBar links={links} ctaHref="#install" />);
    expect(screen.getByText('Features')).toBeInTheDocument();
    expect(screen.getByText('How it works')).toBeInTheDocument();
  });

  it('renders CTA button', () => {
    render(() => <NavBar links={links} ctaHref="https://marketplace.visualstudio.com" />);
    const cta = screen.getByRole('link', { name: /install free/i });
    expect(cta).toHaveAttribute('href', 'https://marketplace.visualstudio.com');
  });

  it('hamburger button has aria-expanded=false by default', () => {
    render(() => <NavBar links={links} ctaHref="#" />);
    expect(screen.getByRole('button', { name: /open menu/i })).toHaveAttribute('aria-expanded', 'false');
  });

  it('hamburger toggles mobile menu open/closed', () => {
    render(() => <NavBar links={links} ctaHref="#" />);
    const btn = screen.getByRole('button', { name: /open menu/i });
    fireEvent.click(btn);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close menu/i })).toBeInTheDocument();
  });
});
```

**Step 2: Run to confirm failure**

```bash
cd marketing && npm test -- NavBar
```
Expected: FAIL

**Step 3: Create `marketing/src/components/NavBar.tsx`**

```tsx
import { createSignal, onCleanup, onMount } from 'solid-js';
import Button from './Button';

interface NavLink { label: string; href: string; }
interface Props {
  links: NavLink[];
  ctaHref: string;
  ctaLabel?: string;
}

export default function NavBar(props: Props) {
  const [scrolled, setScrolled] = createSignal(false);
  const [menuOpen, setMenuOpen] = createSignal(false);

  const handleScroll = () => setScrolled(window.scrollY > 80);

  onMount(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
  });
  onCleanup(() => {
    window.removeEventListener('scroll', handleScroll);
  });

  return (
    <header class={`navbar${scrolled() ? ' navbar--scrolled' : ''}`} role="banner">
      <nav class="navbar__inner container" aria-label="Main navigation">
        <a href="/" class="navbar__logo" aria-label="Lucent Code home">
          Lucent Code
        </a>

        <ul class="navbar__links" role="list">
          {props.links.map(link => (
            <li><a href={link.href} class="navbar__link">{link.label}</a></li>
          ))}
        </ul>

        <div class="navbar__actions">
          <Button href={props.ctaHref} size="sm">
            {props.ctaLabel ?? 'Install free'}
          </Button>
        </div>

        <button
          class="navbar__hamburger"
          aria-label={menuOpen() ? 'Close menu' : 'Open menu'}
          aria-expanded={String(menuOpen())}
          onClick={() => setMenuOpen(o => !o)}
        >
          <span class="navbar__hamburger-icon">{menuOpen() ? '✕' : '☰'}</span>
        </button>
      </nav>

      {menuOpen() && (
        <div
          class="navbar__mobile-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <button
            class="navbar__close"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          >✕</button>
          <ul class="navbar__mobile-links" role="list">
            {props.links.map(link => (
              <li>
                <a
                  href={link.href}
                  class="navbar__mobile-link"
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <Button href={props.ctaHref} size="lg" class="navbar__mobile-cta">
            {props.ctaLabel ?? 'Install free'}
          </Button>
        </div>
      )}
    </header>
  );
}
```

**Step 4: Create `marketing/src/components/NavBar.css`**

```css
.navbar {
  position: sticky;
  top: 0;
  z-index: 50;
  background: transparent;
  transition: background 200ms ease, border-color 200ms ease;
  border-bottom: 1px solid transparent;
}
.navbar--scrolled {
  background: rgba(8, 9, 15, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom-color: var(--color-dark-border);
}
.navbar__inner {
  display: flex;
  align-items: center;
  height: 64px;
  gap: var(--space-8);
}
.navbar__logo {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 800;
  color: var(--color-dark-fg);
  text-decoration: none;
  flex-shrink: 0;
}
.navbar__links {
  display: flex;
  list-style: none;
  gap: var(--space-8);
  flex: 1;
}
.navbar__link {
  color: var(--color-dark-fg-muted);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: color 120ms ease;
}
.navbar__link:hover { color: var(--color-dark-fg); }
.navbar__actions { margin-left: auto; }
.navbar__hamburger {
  display: none;
  background: none;
  border: none;
  color: var(--color-dark-fg);
  cursor: pointer;
  padding: var(--space-2);
  margin-left: auto;
  font-size: 20px;
}
/* Mobile overlay */
.navbar__mobile-overlay {
  position: fixed;
  inset: 0;
  background: var(--color-dark-base);
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-6);
  padding: var(--space-8);
}
.navbar__close {
  position: absolute;
  top: var(--space-4);
  right: var(--space-4);
  background: none;
  border: none;
  color: var(--color-dark-fg);
  font-size: 24px;
  cursor: pointer;
  padding: var(--space-2);
}
.navbar__mobile-links { list-style: none; text-align: center; }
.navbar__mobile-link {
  display: block;
  padding: var(--space-4);
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 700;
  color: var(--color-dark-fg);
  text-decoration: none;
}
.navbar__mobile-cta { width: 100%; max-width: 320px; margin-top: var(--space-4); }

@media (max-width: 768px) {
  .navbar__links, .navbar__actions { display: none; }
  .navbar__hamburger { display: block; }
}
```

Import in `index.tsx`:
```tsx
import './components/NavBar.css';
```

**Step 5: Run tests**

```bash
cd marketing && npm test -- NavBar
```
Expected: all 5 NavBar tests pass

**Step 6: Commit**

```bash
git add marketing/src/components/NavBar.tsx marketing/src/components/NavBar.css marketing/src/components/NavBar.test.tsx
git commit -m "feat(marketing): add NavBar component with scroll state and mobile menu"
```

---

### Task 5: HeroSection component

**Files:**
- Create: `marketing/src/sections/HeroSection.tsx`
- Create: `marketing/src/sections/HeroSection.css`
- Create: `marketing/src/sections/HeroSection.test.tsx`

**Step 1: Write failing tests**

Create `marketing/src/sections/HeroSection.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@solidjs/testing-library';
import HeroSection from './HeroSection';

describe('HeroSection', () => {
  it('renders the headline', () => {
    render(() => <HeroSection ctaHref="#" />);
    expect(screen.getByText(/write code in a new/i)).toBeInTheDocument();
  });

  it('renders gradient text on "light"', () => {
    render(() => <HeroSection ctaHref="#" />);
    const gradients = document.querySelectorAll('.gradient-text');
    expect(gradients.length).toBeGreaterThan(0);
  });

  it('renders the primary CTA', () => {
    render(() => <HeroSection ctaHref="https://marketplace.example.com" />);
    const cta = screen.getByRole('link', { name: /install for vs code/i });
    expect(cta).toHaveAttribute('href', 'https://marketplace.example.com');
  });

  it('renders the secondary CTA', () => {
    render(() => <HeroSection ctaHref="#" />);
    expect(screen.getByRole('link', { name: /see how it works/i })).toBeInTheDocument();
  });

  it('renders the differentiator tagline', () => {
    render(() => <HeroSection ctaHref="#" />);
    expect(screen.getByText(/other tools search your files/i)).toBeInTheDocument();
  });
});
```

**Step 2: Run to confirm failure**

```bash
cd marketing && npm test -- HeroSection
```
Expected: FAIL

**Step 3: Create `marketing/src/sections/HeroSection.tsx`**

```tsx
import Button from '../components/Button';
import GradientText from '../components/GradientText';
import Badge from '../components/Badge';

interface Props { ctaHref: string; }

export default function HeroSection(props: Props) {
  return (
    <section class="hero" aria-labelledby="hero-heading">
      <div class="hero__glow" aria-hidden="true" />
      <div class="container hero__content">
        <Badge variant="primary">Now with MCP support</Badge>

        <h1 class="hero__heading" id="hero-heading">
          Write code in a new <GradientText>light</GradientText>
        </h1>

        <p class="hero__subtext">
          Other tools search your files. Lucent Code reads your code.<br />
          Symbols, types, references, and live diagnostics — straight from your language server.
        </p>

        <div class="hero__cta-row">
          <Button href={props.ctaHref} size="lg">
            Install for VS Code ›
          </Button>
          <Button href="#demo" variant="secondary" size="lg">
            See how it works →
          </Button>
        </div>

        <div class="hero__showcase-placeholder" aria-label="Lucent Code chat panel demo">
          <div class="code-showcase">
            <div class="code-showcase__bar" aria-hidden="true">
              <span class="code-showcase__dot" />
              <span class="code-showcase__dot" />
              <span class="code-showcase__dot" />
              <span class="code-showcase__title">Lucent Code</span>
            </div>
            <div class="code-showcase__content">
              <p class="code-showcase__placeholder-text">Chat panel screenshot</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
```

**Step 4: Create `marketing/src/sections/HeroSection.css`**

```css
.hero {
  position: relative;
  min-height: 100vh;
  background: var(--color-dark-base);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.hero__glow {
  position: absolute;
  inset: 0;
  background: var(--gradient-glow);
  pointer-events: none;
}
.hero__content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding-top: 160px;
  padding-bottom: var(--space-32);
}
.hero__heading {
  font-family: var(--font-display);
  font-size: 72px;
  font-weight: 900;
  line-height: 1.05;
  color: var(--color-dark-fg);
  margin-top: var(--space-6);
  max-width: 900px;
}
.hero__subtext {
  font-size: 18px;
  font-weight: 400;
  line-height: 1.7;
  color: var(--color-dark-fg-muted);
  max-width: 560px;
  margin-top: var(--space-6);
}
.hero__cta-row {
  display: flex;
  gap: var(--space-4);
  margin-top: var(--space-8);
  flex-wrap: wrap;
  justify-content: center;
}
.hero__showcase-placeholder {
  margin-top: var(--space-16);
  width: 100%;
  max-width: 860px;
}

/* Code showcase */
.code-showcase {
  background: var(--color-dark-surface);
  border: 1px solid var(--color-dark-border);
  border-radius: var(--radius-xl);
  overflow: hidden;
  box-shadow: var(--glow-card), var(--glow-primary);
}
.code-showcase__bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  background: var(--color-dark-elevated);
  border-bottom: 1px solid var(--color-dark-border);
}
.code-showcase__dot {
  width: 12px;
  height: 12px;
  border-radius: var(--radius-full);
  background: var(--color-dark-border);
  display: block;
}
.code-showcase__title {
  font-size: 12px;
  color: var(--color-dark-fg-muted);
  margin-left: var(--space-2);
  font-family: var(--font-mono);
}
.code-showcase__content {
  min-height: 320px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.code-showcase__placeholder-text {
  color: var(--color-dark-fg-muted);
  font-family: var(--font-mono);
  font-size: 14px;
}

/* Responsive */
@media (max-width: 1279px) {
  .hero__heading { font-size: 56px; }
  .hero__content { padding-top: 120px; }
}
@media (max-width: 768px) {
  .hero__heading { font-size: 42px; }
  .hero__content { padding-top: 96px; }
  .hero__cta-row { flex-direction: column; align-items: stretch; }
  .hero__showcase-placeholder { max-width: 100%; }
}
```

Import in `index.tsx`:
```tsx
import './sections/HeroSection.css';
```

**Step 5: Run tests**

```bash
cd marketing && npm test -- HeroSection
```
Expected: all 5 pass

**Step 6: Commit**

```bash
git add marketing/src/sections/
git commit -m "feat(marketing): add HeroSection with gradient headline and CTA"
```

---

### Task 6: SocialProofStrip

**Files:**
- Create: `marketing/src/sections/SocialProofStrip.tsx`
- Create: `marketing/src/sections/SocialProofStrip.css`
- Create: `marketing/src/sections/SocialProofStrip.test.tsx`

**Step 1: Write failing test**

```tsx
// SocialProofStrip.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@solidjs/testing-library';
import SocialProofStrip from './SocialProofStrip';

const models = [
  { name: 'Claude' }, { name: 'GPT-4o' }, { name: 'Gemini' },
  { name: 'Mistral' }, { name: 'Llama' },
];

describe('SocialProofStrip', () => {
  it('renders the label', () => {
    render(() => <SocialProofStrip models={models} />);
    expect(screen.getByText(/works with every major model/i)).toBeInTheDocument();
  });

  it('renders all model names', () => {
    render(() => <SocialProofStrip models={models} />);
    for (const m of models) {
      expect(screen.getByText(m.name)).toBeInTheDocument();
    }
  });
});
```

**Step 2: Run to confirm failure**

```bash
cd marketing && npm test -- SocialProofStrip
```

**Step 3: Implement**

Create `marketing/src/sections/SocialProofStrip.tsx`:

```tsx
interface Model { name: string; logo?: string; }
interface Props {
  models: Model[];
  label?: string;
}

export default function SocialProofStrip(props: Props) {
  return (
    <div class="proof-strip">
      <p class="proof-strip__label">{props.label ?? 'Works with every major model'}</p>
      <ul class="proof-strip__models" role="list">
        {props.models.map(m => (
          <li class="proof-strip__model">
            {m.logo
              ? <img src={m.logo} alt={m.name} class="proof-strip__logo" />
              : <span class="proof-strip__model-name">{m.name}</span>
            }
          </li>
        ))}
        <li class="proof-strip__model">
          <span class="proof-strip__model-name proof-strip__model-name--muted">+ more via OpenRouter</span>
        </li>
      </ul>
    </div>
  );
}
```

Create `marketing/src/sections/SocialProofStrip.css`:

```css
.proof-strip {
  background: var(--color-dark-elevated);
  border-top: 1px solid var(--color-dark-border);
  border-bottom: 1px solid var(--color-dark-border);
  padding: var(--space-6) 0;
  text-align: center;
}
.proof-strip__label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-dark-fg-muted);
  margin-bottom: var(--space-4);
}
.proof-strip__models {
  list-style: none;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: var(--space-8);
}
.proof-strip__model-name {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 700;
  color: var(--color-dark-fg);
  opacity: 0.5;
  transition: opacity 200ms ease;
}
.proof-strip__model:hover .proof-strip__model-name { opacity: 0.9; }
.proof-strip__model-name--muted {
  font-family: var(--font-body);
  font-weight: 400;
  font-size: 13px;
}
.proof-strip__logo {
  height: 24px;
  opacity: 0.5;
  filter: grayscale(1);
  transition: opacity 200ms ease;
}
.proof-strip__model:hover .proof-strip__logo { opacity: 0.9; }
```

**Step 4: Run tests**

```bash
cd marketing && npm test -- SocialProofStrip
```
Expected: 2 tests pass

**Step 5: Commit**

```bash
git add marketing/src/sections/SocialProofStrip.tsx marketing/src/sections/SocialProofStrip.css marketing/src/sections/SocialProofStrip.test.tsx
git commit -m "feat(marketing): add SocialProofStrip model logos section"
```

---

### Task 7: FeatureCard + CoreFeaturesGrid

**Files:**
- Create: `marketing/src/components/FeatureCard.tsx`
- Create: `marketing/src/components/FeatureCard.css`
- Create: `marketing/src/sections/CoreFeaturesGrid.tsx`
- Create: `marketing/src/sections/CoreFeaturesGrid.css`
- Create: `marketing/src/components/FeatureCard.test.tsx`

**Step 1: Write failing tests**

Create `marketing/src/components/FeatureCard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@solidjs/testing-library';
import FeatureCard from './FeatureCard';

describe('FeatureCard', () => {
  it('renders icon, title and description', () => {
    render(() => (
      <FeatureCard icon="🔍" title="LSP Intelligence" description="Reads your language server." />
    ));
    expect(screen.getByText('🔍')).toBeInTheDocument();
    expect(screen.getByText('LSP Intelligence')).toBeInTheDocument();
    expect(screen.getByText('Reads your language server.')).toBeInTheDocument();
  });

  it('renders optional badge', () => {
    render(() => (
      <FeatureCard icon="🔍" title="LSP" description="..." badge="LSP-powered" />
    ));
    expect(screen.getByText('LSP-powered')).toBeInTheDocument();
  });

  it('applies dark variant class', () => {
    const { container } = render(() => (
      <FeatureCard icon="🔍" title="LSP" description="..." variant="dark" />
    ));
    expect(container.querySelector('.feature-card--dark')).toBeTruthy();
  });
});
```

**Step 2: Run to confirm failure**

```bash
cd marketing && npm test -- FeatureCard
```

**Step 3: Create `marketing/src/components/FeatureCard.tsx`**

```tsx
import Badge from './Badge';

interface Props {
  icon: string;
  title: string;
  description: string;
  badge?: string;
  variant?: 'light' | 'dark';
}

export default function FeatureCard(props: Props) {
  const variant = () => props.variant ?? 'light';
  return (
    <article class={`feature-card feature-card--${variant()}`}>
      <div class="feature-card__icon" aria-hidden="true">{props.icon}</div>
      <h3 class="feature-card__title">{props.title}</h3>
      <p class="feature-card__description">{props.description}</p>
      {props.badge && <Badge variant="primary">{props.badge}</Badge>}
    </article>
  );
}
```

Create `marketing/src/components/FeatureCard.css`:

```css
.feature-card {
  border-radius: var(--radius-lg);
  padding: var(--space-8);
  transition: transform 200ms ease, box-shadow 200ms ease;
}
.feature-card--light {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-md);
}
.feature-card--light:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}
.feature-card--dark {
  background: var(--color-dark-surface);
  border: 1px solid var(--color-dark-border);
  border-radius: var(--radius-xl);
  box-shadow: var(--glow-card);
}
.feature-card--dark:hover {
  border-color: rgba(99, 102, 241, 0.3);
}
.feature-card__icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  margin-bottom: var(--space-4);
}
.feature-card__title {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 700;
  line-height: 1.3;
  margin-bottom: var(--space-3);
}
.feature-card--light .feature-card__title { color: var(--color-text); }
.feature-card--dark .feature-card__title { color: var(--color-dark-fg); }
.feature-card__description {
  font-size: 16px;
  line-height: 1.6;
  margin-bottom: var(--space-4);
}
.feature-card--light .feature-card__description { color: var(--color-text-muted); }
.feature-card--dark .feature-card__description { color: var(--color-dark-fg-muted); }
```

**Step 4: Create `marketing/src/sections/CoreFeaturesGrid.tsx`**

```tsx
import Eyebrow from '../components/Eyebrow';
import FeatureCard from '../components/FeatureCard';

const CORE_FEATURES = [
  {
    icon: '🔍',
    title: 'LSP-first intelligence',
    description: 'Understands your code the way VS Code does — symbols, types, references, and live diagnostics from your language server.',
    badge: 'LSP-powered',
  },
  {
    icon: '🔄',
    title: 'Any model via OpenRouter',
    description: 'Switch between Claude, GPT-4o, Gemini, Mistral, Llama, and more with a single API key. No vendor lock-in.',
    badge: 'Multi-model',
  },
  {
    icon: '💬',
    title: 'Streaming chat panel',
    description: 'Fast side-panel chat with Markdown, syntax-highlighted code, copy/insert buttons, and real-time responses.',
    badge: 'Built for VS Code',
  },
];

export default function CoreFeaturesGrid() {
  return (
    <section class="core-features section" id="features" aria-labelledby="core-features-heading">
      <div class="container">
        <div class="section-header">
          <Eyebrow>What makes it different</Eyebrow>
          <h2 class="section-heading" id="core-features-heading">
            The AI that reads code, not files
          </h2>
          <p class="section-subtext">
            While other tools grep through your files, Lucent Code resolves symbols and reads
            diagnostics directly from your language server — giving the AI the same picture your editor has.
          </p>
        </div>
        <ul class="feature-grid feature-grid--3" role="list">
          {CORE_FEATURES.map(f => (
            <li><FeatureCard {...f} /></li>
          ))}
        </ul>
      </div>
    </section>
  );
}
```

Create `marketing/src/sections/CoreFeaturesGrid.css`:

```css
.section-header {
  text-align: center;
  max-width: 720px;
  margin: 0 auto var(--space-12);
}
.section-heading {
  font-family: var(--font-display);
  font-size: 48px;
  font-weight: 800;
  line-height: 1.1;
  margin-bottom: var(--space-4);
}
.section-subtext {
  font-size: 18px;
  line-height: 1.7;
}
.core-features { background: var(--color-background); }
.core-features .section-heading { color: var(--color-text); }
.core-features .section-subtext { color: var(--color-text-muted); }

.feature-grid {
  list-style: none;
  display: grid;
  gap: var(--space-6);
}
.feature-grid--3 { grid-template-columns: repeat(3, 1fr); }
.feature-grid--4 { grid-template-columns: repeat(4, 1fr); }

@media (max-width: 1279px) {
  .section-heading { font-size: 36px; }
  .feature-grid--4 { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 768px) {
  .feature-grid--3, .feature-grid--4 { grid-template-columns: 1fr; }
  .section-heading { font-size: 32px; }
}
```

**Step 5: Run tests**

```bash
cd marketing && npm test -- FeatureCard
```
Expected: 3 tests pass

**Step 6: Commit**

```bash
git add marketing/src/components/FeatureCard.tsx marketing/src/components/FeatureCard.css marketing/src/components/FeatureCard.test.tsx marketing/src/sections/CoreFeaturesGrid.tsx marketing/src/sections/CoreFeaturesGrid.css
git commit -m "feat(marketing): add FeatureCard component and CoreFeaturesGrid section"
```

---

### Task 8: DemoSection

**Files:**
- Create: `marketing/src/sections/DemoSection.tsx`
- Create: `marketing/src/sections/DemoSection.css`
- Create: `marketing/src/sections/DemoSection.test.tsx`

**Step 1: Write failing test**

```tsx
// DemoSection.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@solidjs/testing-library';
import DemoSection from './DemoSection';

describe('DemoSection', () => {
  it('renders the section heading', () => {
    render(() => <DemoSection />);
    expect(screen.getByText(/your language server, now in ai/i)).toBeInTheDocument();
  });

  it('renders all 3 step callouts', () => {
    render(() => <DemoSection />);
    expect(screen.getByText('Ask a question')).toBeInTheDocument();
    expect(screen.getByText('Get precise answers')).toBeInTheDocument();
    expect(screen.getByText('Take action')).toBeInTheDocument();
  });

  it('renders step numbers 1-3', () => {
    render(() => <DemoSection />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
```

**Step 2: Run to confirm failure**

```bash
cd marketing && npm test -- DemoSection
```

**Step 3: Create `marketing/src/sections/DemoSection.tsx`**

```tsx
import Eyebrow from '../components/Eyebrow';

const STEPS = [
  {
    title: 'Ask a question',
    description: 'Type in the chat panel. The AI has full access to your language server — symbols, types, and live diagnostics included.',
  },
  {
    title: 'Get precise answers',
    description: 'Lucent Code resolves symbols and types — not guessed from text, but read from your LSP. Accurate answers, every time.',
  },
  {
    title: 'Take action',
    description: 'Accept edits, apply quick fixes, rename symbols — with your approval at every step. You stay in control.',
  },
];

export default function DemoSection() {
  return (
    <section class="demo section" id="demo" aria-labelledby="demo-heading">
      <div class="container">
        <div class="section-header">
          <Eyebrow>See it in action</Eyebrow>
          <h2 class="section-heading demo__heading" id="demo-heading">
            Your language server, now in AI
          </h2>
          <p class="section-subtext demo__subtext">
            Every response is grounded in real code intelligence — not pattern matching on text.
          </p>
        </div>

        <div class="demo__layout">
          <div class="demo__showcase">
            <div class="code-showcase">
              <div class="code-showcase__bar" aria-hidden="true">
                <span class="code-showcase__dot" />
                <span class="code-showcase__dot" />
                <span class="code-showcase__dot" />
                <span class="code-showcase__title">Lucent Code</span>
              </div>
              <div class="code-showcase__content">
                <p class="code-showcase__placeholder-text">Chat panel screenshot</p>
              </div>
            </div>
          </div>

          <ol class="demo__steps" aria-label="How Lucent Code works">
            {STEPS.map((step, i) => (
              <li class="demo__step">
                <div class="demo__step-number" aria-hidden="true">{i + 1}</div>
                <div class="demo__step-content">
                  <h3 class="demo__step-title">{step.title}</h3>
                  <p class="demo__step-description">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
```

Create `marketing/src/sections/DemoSection.css`:

```css
.demo {
  background: var(--color-dark-base);
  position: relative;
}
.demo__heading { color: var(--color-dark-fg); }
.demo__subtext { color: var(--color-dark-fg-muted); }
.demo__layout {
  display: flex;
  gap: var(--space-12);
  align-items: flex-start;
  margin-top: var(--space-12);
}
.demo__showcase {
  flex: 0 0 55%;
  min-width: 0;
}
.demo__steps {
  flex: 1;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}
.demo__step {
  display: flex;
  gap: var(--space-4);
  align-items: flex-start;
}
.demo__step-number {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  background: rgba(99, 102, 241, 0.15);
  border: 1px solid rgba(99, 102, 241, 0.3);
  color: #818CF8;
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.demo__step-title {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  color: var(--color-dark-fg);
  margin-bottom: var(--space-2);
}
.demo__step-description {
  font-size: 15px;
  line-height: 1.6;
  color: var(--color-dark-fg-muted);
}

@media (max-width: 1279px) {
  .demo__layout { flex-direction: column; }
  .demo__showcase { flex: none; width: 100%; }
}
```

**Step 4: Run tests**

```bash
cd marketing && npm test -- DemoSection
```
Expected: 3 tests pass

**Step 5: Commit**

```bash
git add marketing/src/sections/DemoSection.tsx marketing/src/sections/DemoSection.css marketing/src/sections/DemoSection.test.tsx
git commit -m "feat(marketing): add DemoSection with code showcase and step callouts"
```

---

### Task 9: AdvancedFeaturesGrid + CtaBanner + Footer

**Files:**
- Create: `marketing/src/sections/AdvancedFeaturesGrid.tsx`
- Create: `marketing/src/sections/CtaBanner.tsx`
- Create: `marketing/src/sections/CtaBanner.css`
- Create: `marketing/src/sections/Footer.tsx`
- Create: `marketing/src/sections/Footer.css`
- Create: `marketing/src/sections/remaining.test.tsx`

**Step 1: Write failing tests**

Create `marketing/src/sections/remaining.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@solidjs/testing-library';
import AdvancedFeaturesGrid from './AdvancedFeaturesGrid';
import CtaBanner from './CtaBanner';
import Footer from './Footer';

describe('AdvancedFeaturesGrid', () => {
  it('renders all 4 advanced feature cards', () => {
    render(() => <AdvancedFeaturesGrid />);
    expect(screen.getByText('Inline completions')).toBeInTheDocument();
    expect(screen.getByText('Skills system')).toBeInTheDocument();
    expect(screen.getByText('MCP support')).toBeInTheDocument();
    expect(screen.getByText('Git worktrees')).toBeInTheDocument();
  });
});

describe('CtaBanner', () => {
  it('renders headline and CTA', () => {
    render(() => <CtaBanner ctaHref="#" />);
    expect(screen.getByRole('link', { name: /install for vs code/i })).toBeInTheDocument();
    expect(screen.getByText(/no credit card required/i)).toBeInTheDocument();
  });
});

describe('Footer', () => {
  it('renders copyright', () => {
    render(() => <Footer />);
    expect(screen.getByText(/2026 lucent code/i)).toBeInTheDocument();
  });

  it('renders logo', () => {
    render(() => <Footer />);
    expect(screen.getAllByText('Lucent Code').length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run to confirm failure**

```bash
cd marketing && npm test -- remaining
```

**Step 3: Create `marketing/src/sections/AdvancedFeaturesGrid.tsx`**

```tsx
import Eyebrow from '../components/Eyebrow';
import FeatureCard from '../components/FeatureCard';

const ADVANCED_FEATURES = [
  {
    icon: '⚡',
    title: 'Inline completions',
    description: 'Ghost-text suggestions as you type. Auto or manual trigger with Alt+\\.',
  },
  {
    icon: '🧩',
    title: 'Skills system',
    description: 'Load Claude Code-style skill sets from GitHub, npm, or the marketplace.',
  },
  {
    icon: '🔌',
    title: 'MCP support',
    description: 'Connect external tools via Model Context Protocol for extended capabilities.',
  },
  {
    icon: '🌿',
    title: 'Git worktrees',
    description: 'Isolate AI sessions to git worktrees — keep your workspace clean.',
  },
];

export default function AdvancedFeaturesGrid() {
  return (
    <section class="advanced-features section" aria-labelledby="advanced-features-heading">
      <div class="container">
        <div class="section-header">
          <Eyebrow>And there's more</Eyebrow>
          <h2 class="section-heading advanced-features__heading" id="advanced-features-heading">
            Everything a modern AI assistant should be
          </h2>
        </div>
        <ul class="feature-grid feature-grid--4" role="list">
          {ADVANCED_FEATURES.map(f => (
            <li><FeatureCard {...f} /></li>
          ))}
        </ul>
      </div>
    </section>
  );
}
```

Add to `CoreFeaturesGrid.css` (reuse):
```css
.advanced-features { background: var(--color-background); }
.advanced-features .section-heading { color: var(--color-text); }
```

**Step 4: Create `marketing/src/sections/CtaBanner.tsx`**

```tsx
import Button from '../components/Button';

interface Props { ctaHref: string; }

export default function CtaBanner(props: Props) {
  return (
    <section class="cta-banner section" aria-labelledby="cta-heading">
      <div class="container cta-banner__inner">
        <h2 class="cta-banner__heading" id="cta-heading">
          Write code in a new light.
        </h2>
        <p class="cta-banner__subtext">
          Free. No account needed. Install in seconds from the VS Code marketplace.
        </p>
        <Button href={props.ctaHref} size="lg">
          Install for VS Code ›
        </Button>
        <p class="cta-banner__trust">
          No credit card required · Free tier via OpenRouter · Open source
        </p>
      </div>
    </section>
  );
}
```

Create `marketing/src/sections/CtaBanner.css`:

```css
.cta-banner {
  background: var(--color-dark-base);
  position: relative;
  border-top: 1px solid;
  border-image: var(--gradient-brand) 1;
}
.cta-banner__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-6);
}
.cta-banner__heading {
  font-family: var(--font-display);
  font-size: 48px;
  font-weight: 800;
  line-height: 1.1;
  color: var(--color-dark-fg);
  max-width: 600px;
}
.cta-banner__subtext {
  font-size: 18px;
  line-height: 1.7;
  color: var(--color-dark-fg-muted);
  max-width: 480px;
}
.cta-banner__trust {
  font-size: 13px;
  color: var(--color-dark-fg-muted);
  margin-top: calc(-1 * var(--space-3));
}

@media (max-width: 768px) {
  .cta-banner__heading { font-size: 32px; }
}
```

**Step 5: Create `marketing/src/sections/Footer.tsx`**

```tsx
export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer class="footer" role="contentinfo">
      <div class="container footer__grid">
        <div class="footer__brand">
          <p class="footer__logo">Lucent Code</p>
          <p class="footer__tagline">Write code in a new light.</p>
        </div>
        <nav class="footer__nav" aria-label="Product links">
          <p class="footer__nav-heading">Product</p>
          <ul role="list">
            <li><a href="#features" class="footer__link">Features</a></li>
            <li><a href="#demo" class="footer__link">How it works</a></li>
            <li><a href="#" class="footer__link">Changelog</a></li>
            <li><a href="#" class="footer__link">Roadmap</a></li>
          </ul>
        </nav>
        <nav class="footer__nav" aria-label="Resources links">
          <p class="footer__nav-heading">Resources</p>
          <ul role="list">
            <li><a href="https://github.com/lucentcode/lucent-code" class="footer__link">GitHub</a></li>
            <li><a href="https://openrouter.ai" class="footer__link">OpenRouter</a></li>
          </ul>
        </nav>
        <nav class="footer__nav" aria-label="Connect links">
          <p class="footer__nav-heading">Connect</p>
          <ul role="list">
            <li><a href="#" class="footer__link">Twitter / X</a></li>
            <li><a href="#" class="footer__link">VS Code Marketplace</a></li>
          </ul>
        </nav>
      </div>
      <div class="footer__bottom">
        <div class="container footer__bottom-inner">
          <p class="footer__copyright">© {year} Lucent Code · MIT License</p>
          <p class="footer__legal">
            <a href="#" class="footer__link">Privacy</a>
          </p>
        </div>
      </div>
    </footer>
  );
}
```

Create `marketing/src/sections/Footer.css`:

```css
.footer {
  background: var(--color-dark-base);
  border-top: 1px solid var(--color-dark-border);
  padding-top: var(--space-24);
}
.footer__grid {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  gap: var(--space-8);
  padding-bottom: var(--space-12);
}
.footer__logo {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 800;
  color: var(--color-dark-fg);
  margin-bottom: var(--space-2);
}
.footer__tagline {
  font-size: 14px;
  color: var(--color-dark-fg-muted);
}
.footer__nav-heading {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-dark-fg-muted);
  margin-bottom: var(--space-4);
}
.footer__nav ul { list-style: none; display: flex; flex-direction: column; gap: var(--space-3); }
.footer__link {
  font-size: 14px;
  color: var(--color-dark-fg-muted);
  text-decoration: none;
  transition: color 120ms ease;
}
.footer__link:hover { color: var(--color-dark-fg); }
.footer__bottom {
  border-top: 1px solid var(--color-dark-border);
  padding: var(--space-6) 0 var(--space-8);
}
.footer__bottom-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.footer__copyright { font-size: 13px; color: var(--color-dark-fg-muted); }

@media (max-width: 1279px) {
  .footer__grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 768px) {
  .footer__grid { grid-template-columns: 1fr; }
}
```

**Step 6: Run tests**

```bash
cd marketing && npm test -- remaining
```
Expected: all pass

**Step 7: Commit**

```bash
git add marketing/src/sections/
git commit -m "feat(marketing): add AdvancedFeaturesGrid, CtaBanner, and Footer sections"
```

---

### Task 10: Assemble the page + full test run

**Files:**
- Modify: `marketing/src/App.tsx`

**Step 1: Update `marketing/src/App.tsx`**

```tsx
import NavBar from './components/NavBar';
import HeroSection from './sections/HeroSection';
import SocialProofStrip from './sections/SocialProofStrip';
import CoreFeaturesGrid from './sections/CoreFeaturesGrid';
import DemoSection from './sections/DemoSection';
import AdvancedFeaturesGrid from './sections/AdvancedFeaturesGrid';
import CtaBanner from './sections/CtaBanner';
import Footer from './sections/Footer';

// TODO: Replace with actual VS Code marketplace URL when published
const MARKETPLACE_URL = 'https://marketplace.visualstudio.com/items?itemName=lucentcode.lucent-code';

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#demo' },
  { label: 'GitHub', href: 'https://github.com/lucentcode/lucent-code' },
];

const MODELS = [
  { name: 'Claude' },
  { name: 'GPT-4o' },
  { name: 'Gemini' },
  { name: 'Mistral' },
  { name: 'Llama' },
];

export default function App() {
  return (
    <>
      <NavBar links={NAV_LINKS} ctaHref={MARKETPLACE_URL} />
      <main id="main-content">
        <HeroSection ctaHref={MARKETPLACE_URL} />
        <SocialProofStrip models={MODELS} />
        <CoreFeaturesGrid />
        <DemoSection />
        <AdvancedFeaturesGrid />
        <CtaBanner ctaHref={MARKETPLACE_URL} />
      </main>
      <Footer />
    </>
  );
}
```

**Step 2: Import remaining CSS in `index.tsx`**

Add missing CSS imports:
```tsx
import './sections/HeroSection.css';
import './sections/SocialProofStrip.css';
import './sections/CoreFeaturesGrid.css';
import './sections/DemoSection.css';
import './sections/CtaBanner.css';
import './sections/Footer.css';
import './components/FeatureCard.css';
```

**Step 3: Run all tests**

```bash
cd marketing && npm test
```
Expected: all tests pass

**Step 4: Verify build succeeds**

```bash
cd marketing && npm run build
```
Expected: `marketing/dist/` populated, no errors

**Step 5: Verify dev server renders the page**

```bash
cd marketing && npm run dev
```
Open browser — verify all 8 sections render, no console errors.

**Step 6: Commit**

```bash
git add marketing/src/App.tsx marketing/src/index.tsx
git commit -m "feat(marketing): assemble full single-page marketing site"
```

---

### Task 11: Accessibility pass

**Files:**
- Modify: `marketing/index.html` (verify skip link)
- Modify: any components with missing ARIA

**Step 1: Verify landmark structure in browser DevTools**

Open the page, open DevTools → Accessibility tree. Confirm:
- `<header>` contains `<nav aria-label="Main navigation">`
- `<main id="main-content">` wraps all sections
- `<footer role="contentinfo">` at the bottom
- Skip link appears when tabbing from address bar

**Step 2: Verify heading hierarchy**

Confirm via DevTools:
- One `<h1>` (hero heading)
- Multiple `<h2>` (section headings)
- `<h3>` inside feature cards

**Step 3: Run keyboard navigation check**

Tab through the entire page in browser:
- Skip link reachable and functional
- NavBar links and CTA focusable
- All buttons show focus ring
- Mobile hamburger toggle works with keyboard
- All footer links reachable

**Step 4: Verify reduced motion**

In DevTools → Rendering → Emulate `prefers-reduced-motion: reduce`:
- Hero glow has no animation
- Card hover transitions are instant

**Step 5: Commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(marketing): accessibility pass — landmarks, focus, reduced motion"
```

---

## Open Questions (from UI contract)

These must be resolved before deployment — they don't block the build:

1. **CodeShowcase content** — Replace `code-showcase__placeholder-text` with a real screenshot (`<img>`) or animated demo once the asset is available. Update `CodeShowcase` image src in `HeroSection.tsx` and `DemoSection.tsx`.
2. **Model logo SVGs** — If SVG assets are acquired, add `logo` prop to `MODELS` array in `App.tsx`.
3. **Marketplace URL** — Replace `MARKETPLACE_URL` constant in `App.tsx` with the live link when published.
4. **Scroll entrance animations** — Optional: add `IntersectionObserver` fade-up on `.feature-card` and `.demo__step` after v1 ships.
