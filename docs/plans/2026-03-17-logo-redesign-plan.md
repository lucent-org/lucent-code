# Logo Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current glowing-dot icon with a neural-network node cluster that hides `{ }` bracket negative space.

**Architecture:** Hand-authored SVG defines the icon. A one-off Node.js script (`scripts/generate-icon.mjs`) uses the `sharp` dev-dependency to rasterise it to `images/icon.png` at 128×128. Both files are committed. No new dependencies.

**Tech Stack:** SVG, Node.js ESM, `sharp` (already in devDependencies)

---

### Task 1: Replace images/icon.svg

**Files:**
- Modify: `images/icon.svg`

No automated tests for SVG appearance. Verify visually by opening the file in a browser.

**Step 1: Replace the entire contents of `images/icon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <filter id="core-glow" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="5" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="128" height="128" rx="16" fill="#0d0d1a"/>

  <!-- Left cluster — internal connection traces -->
  <g stroke="#a78bfa" stroke-width="1" fill="none" opacity="0.18">
    <line x1="22"  y1="20"  x2="44"  y2="28"/>
    <line x1="22"  y1="20"  x2="18"  y2="52"/>
    <line x1="44"  y1="28"  x2="34"  y2="64"/>
    <line x1="18"  y1="52"  x2="34"  y2="64"/>
    <line x1="18"  y1="52"  x2="18"  y2="76"/>
    <line x1="34"  y1="64"  x2="18"  y2="76"/>
    <line x1="18"  y1="76"  x2="44"  y2="100"/>
    <line x1="18"  y1="76"  x2="22"  y2="108"/>
    <line x1="44"  y1="100" x2="22"  y2="108"/>
  </g>

  <!-- Right cluster — internal connection traces -->
  <g stroke="#a78bfa" stroke-width="1" fill="none" opacity="0.18">
    <line x1="106" y1="20"  x2="84"  y2="28"/>
    <line x1="106" y1="20"  x2="110" y2="52"/>
    <line x1="84"  y1="28"  x2="94"  y2="64"/>
    <line x1="110" y1="52"  x2="94"  y2="64"/>
    <line x1="110" y1="52"  x2="110" y2="76"/>
    <line x1="94"  y1="64"  x2="110" y2="76"/>
    <line x1="110" y1="76"  x2="84"  y2="100"/>
    <line x1="110" y1="76"  x2="106" y2="108"/>
    <line x1="84"  y1="100" x2="106" y2="108"/>
  </g>

  <!-- Cross-gap traces (cyan, signals crossing between halves) -->
  <g stroke="#38bdf8" stroke-width="1" fill="none" opacity="0.22">
    <line x1="44"  y1="28"  x2="58"  y2="58"/>
    <line x1="34"  y1="64"  x2="58"  y2="58"/>
    <line x1="58"  y1="58"  x2="70"  y2="70"/>
    <line x1="70"  y1="70"  x2="94"  y2="64"/>
    <line x1="84"  y1="28"  x2="70"  y2="70"/>
    <line x1="44"  y1="100" x2="70"  y2="70"/>
  </g>

  <!-- Left cluster — outer nodes (electric sky blue) -->
  <g fill="#38bdf8">
    <circle cx="22"  cy="20"  r="4.5"/>
    <circle cx="18"  cy="52"  r="4.5"/>
    <circle cx="18"  cy="76"  r="4.5"/>
    <circle cx="22"  cy="108" r="4.5"/>
  </g>

  <!-- Left cluster — inner nodes (lavender-purple) -->
  <g fill="#a78bfa">
    <circle cx="44"  cy="28"  r="5.5"/>
    <circle cx="34"  cy="64"  r="5.5"/>
    <circle cx="44"  cy="100" r="5.5"/>
  </g>

  <!-- Right cluster — outer nodes (electric sky blue) -->
  <g fill="#38bdf8">
    <circle cx="106" cy="20"  r="4.5"/>
    <circle cx="110" cy="52"  r="4.5"/>
    <circle cx="110" cy="76"  r="4.5"/>
    <circle cx="106" cy="108" r="4.5"/>
  </g>

  <!-- Right cluster — inner nodes (lavender-purple) -->
  <g fill="#a78bfa">
    <circle cx="84"  cy="28"  r="5.5"/>
    <circle cx="94"  cy="64"  r="5.5"/>
    <circle cx="84"  cy="100" r="5.5"/>
  </g>

  <!-- Centre nodes — white with glow (float in the bracket gap) -->
  <circle cx="58" cy="58" r="7" fill="#ffffff" filter="url(#core-glow)"/>
  <circle cx="70" cy="70" r="7" fill="#ffffff" filter="url(#core-glow)"/>
</svg>
```

**How the bracket negative space works:**
- The inner-most left nodes are at x=44 (top/bottom) and x=34 (centre) — the left `{` notch
- The inner-most right nodes are at x=84 (top/bottom) and x=94 (centre) — the right `}` notch
- Gap at top/bottom: 40 px (narrow, like bracket arms)
- Gap at centre: 60 px (wide, like bracket opening)
- The two glowing white nodes float inside this gap

**Step 2: Open in a browser to verify visually**

Open `images/icon.svg` in any browser (drag-drop or `file://` URL). Check:
- Dark background with two clusters of nodes
- White glow visible at centre
- Purple nodes visible mid-cluster, cyan nodes at outer edges
- Subtle bracket shape visible in the gap

**Step 3: Commit**

```bash
git add images/icon.svg
git commit -m "feat: replace icon with neural-net node cluster (bracket negative space)"
```

---

### Task 2: Rasterise SVG → PNG and update build

**Files:**
- Create: `scripts/generate-icon.mjs`
- Modify: `images/icon.png` (regenerated artefact)
- Modify: `package.json` (add `build:icon` script)

No unit tests — verify by checking the output PNG exists and is 128×128.

**Step 1: Create `scripts/generate-icon.mjs`**

```js
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const svg = readFileSync(path.join(root, 'images', 'icon.svg'));

await sharp(svg)
  .resize(128, 128)
  .png()
  .toFile(path.join(root, 'images', 'icon.png'));

console.log('icon.png generated (128×128)');
```

**Step 2: Add `build:icon` script to `package.json`**

In the `"scripts"` block, add after `"test:watch"`:

```json
"build:icon": "node scripts/generate-icon.mjs"
```

**Step 3: Run the script**

```bash
npm run build:icon
```

Expected output:
```
icon.png generated (128×128)
```

**Step 4: Verify the PNG**

```bash
node -e "import('sharp').then(s => s.default('images/icon.png').metadata().then(m => console.log(m.width, m.height, m.format)))"
```

Expected: `128 128 png`

**Step 5: Commit**

```bash
git add scripts/generate-icon.mjs images/icon.png package.json
git commit -m "feat: add generate-icon script and rasterise new icon to PNG"
```
