# Logo Redesign v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the v1 neural-net icon with a cleaner design: explicit `{ }` bracket strokes framing a compact 8-node cluster.

**Architecture:** Two SVG tasks — rewrite `images/icon.svg`, then re-run the existing `scripts/generate-icon.mjs` script (added in v1) to regenerate `images/icon.png`. No new dependencies or scripts needed.

**Tech Stack:** SVG, Node.js (`npm run build:icon` already wired up)

---

### Task 1: Rewrite images/icon.svg

**Files:**
- Modify: `images/icon.svg`

No automated tests — verify visually by opening in a browser.

**Step 1: Replace the entire contents of `images/icon.svg` with the following**

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

  <!-- Left { bracket -->
  <path
    d="M 40,20 L 28,20 Q 22,20 22,30 L 22,56 Q 22,64 14,64 Q 22,64 22,72 L 22,98 Q 22,108 28,108 L 40,108"
    fill="none" stroke="#ffffff" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round" opacity="0.35"/>

  <!-- Right } bracket -->
  <path
    d="M 88,20 L 100,20 Q 106,20 106,30 L 106,56 Q 106,64 114,64 Q 106,64 106,72 L 106,98 Q 106,108 100,108 L 88,108"
    fill="none" stroke="#ffffff" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round" opacity="0.35"/>

  <!-- Connection traces (7 lines) -->
  <g stroke="#ffffff" stroke-width="1" fill="none" opacity="0.20">
    <line x1="52" y1="34" x2="57" y2="52"/>
    <line x1="76" y1="34" x2="71" y2="52"/>
    <line x1="57" y1="52" x2="71" y2="52"/>
    <line x1="57" y1="52" x2="71" y2="76"/>
    <line x1="57" y1="76" x2="71" y2="76"/>
    <line x1="57" y1="76" x2="52" y2="94"/>
    <line x1="71" y1="76" x2="76" y2="94"/>
  </g>

  <!-- Cyan outer nodes -->
  <g fill="#38bdf8">
    <circle cx="52" cy="34" r="4.5"/>
    <circle cx="76" cy="34" r="4.5"/>
    <circle cx="52" cy="94" r="4.5"/>
    <circle cx="76" cy="94" r="4.5"/>
  </g>

  <!-- Purple lower-centre nodes -->
  <g fill="#a78bfa">
    <circle cx="57" cy="76" r="5.5"/>
    <circle cx="71" cy="76" r="5.5"/>
  </g>

  <!-- White glowing upper-centre nodes -->
  <circle cx="57" cy="52" r="7" fill="#ffffff" filter="url(#core-glow)"/>
  <circle cx="71" cy="52" r="7" fill="#ffffff" filter="url(#core-glow)"/>
</svg>
```

**Step 2: Open in a browser to verify visually**

Open `images/icon.svg` in any browser. Check:
- Dark background
- Two clearly readable `{ }` bracket strokes in white
- 8 nodes clustered between the brackets (2 glowing white at top-centre, 2 purple mid, 4 cyan at corners)
- Diagonal trace visible crossing from upper-left to lower-right

**Step 3: Commit**

```bash
git add images/icon.svg
git commit -m "feat: icon v2 — explicit { } brackets with compact 8-node neural net"
```

---

### Task 2: Regenerate icon.png

**Files:**
- Modify: `images/icon.png` (regenerated artefact)

**Step 1: Run the existing rasterisation script**

```bash
npm run build:icon
```

Expected output:
```
icon.png generated (128x128)
```

**Step 2: Verify dimensions**

```bash
node -e "import('sharp').then(s => s.default('images/icon.png').metadata().then(m => console.log(m.width, m.height, m.format)))"
```

Expected: `128 128 png`

**Step 3: Commit**

```bash
git add images/icon.png
git commit -m "chore: regenerate icon.png from v2 SVG"
```
