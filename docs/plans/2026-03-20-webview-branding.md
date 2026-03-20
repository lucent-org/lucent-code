# Webview Branding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Lucent Code brand identity to the VS Code extension webview — new `/` slash logo, toolbar wordmark, branded empty state, and fix duplicate ⚡ icons.

**Architecture:** Four independent tasks: (1) replace SVG logo files, (2) add toolbar wordmark in App.tsx + CSS, (3) update empty state in App.tsx + CSS, (4) change ⚡ → ⊙ for autonomous mode and ⚡ → `/` for skills. All webview functional UI colors remain deferred to VS Code theme variables — branding lives only in the identity zones.

**Tech Stack:** SolidJS 1.8, TypeScript, plain CSS, Vite 5 (webview build), SVG

**Design doc:** `docs/plans/2026-03-20-webview-branding-design.md`

---

### Task 1: New logo SVGs

Replace both icon files with the new `/` slash beam design.

**Files:**
- Modify: `images/icon.svg`
- Modify: `media/icon.svg`
- Modify: `package.json` (activity bar icon)

**Context:**
- `images/icon.svg` — shown in the VS Code marketplace and README. Uses full gradient treatment. Referenced by `package.json` `"icon"` field (as `.png` — we update the `.svg` source; the `.png` must be regenerated separately, noted below).
- `media/icon.svg` — used as the VS Code activity bar icon. VS Code renders SVG icons as CSS masks (single color), so gradients are ignored. Must be monochrome white on transparent background.
- `package.json` `viewsContainers.activitybar[].icon` currently uses `$(comment-discussion)` (built-in codicon). Change to `media/icon.svg` so the extension has its own icon in the activity bar.

**Step 1: Replace `images/icon.svg`**

Overwrite the file with this content:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="beam" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#6366F1"/>
      <stop offset="50%"  stop-color="#8B5CF6"/>
      <stop offset="100%" stop-color="#22D3EE"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="16" fill="#0d0d1a"/>
  <line x1="40" y1="100" x2="88" y2="28"
        stroke="url(#beam)" stroke-width="14" stroke-linecap="round"/>
</svg>
```

**Step 2: Replace `media/icon.svg`**

Overwrite with the monochrome version (no background — VS Code applies its own color as a mask):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <line x1="40" y1="100" x2="88" y2="28"
        stroke="#ffffff" stroke-width="14" stroke-linecap="round"/>
</svg>
```

**Step 3: Update activity bar icon in `package.json`**

Find:
```json
"icon": "$(comment-discussion)"
```

Replace with:
```json
"icon": "media/icon.svg"
```

This is inside the `contributes.viewsContainers.activitybar` array entry.

**Step 4: Verify SVG renders correctly**

Open `images/icon.svg` in a browser (drag-and-drop the file). You should see:
- Dark rounded square background (`#0d0d1a`)
- A bold diagonal slash from bottom-left to top-right
- Gradient: indigo at the bottom → violet mid → cyan at the top

**Step 5: Commit**

```bash
git add images/icon.svg media/icon.svg package.json
git commit -m "feat: replace logo with gradient slash beam mark"
```

---

### Task 2: Toolbar wordmark

Add a small branded logo mark + "Lucent Code" text to the left side of the toolbar in the webview.

**Files:**
- Modify: `webview/src/App.tsx` (around line 148)
- Modify: `webview/src/styles.css` (after line 42, inside the toolbar section)

**Context:**
The toolbar currently starts with `<ModelSelector .../>` at line 149. We insert a `.toolbar-brand` div before it. The SVG uses a unique gradient ID `toolbar-beam` to avoid clashing with the empty state SVG on the same page.

**Step 1: Add toolbar brand markup to `App.tsx`**

In `webview/src/App.tsx`, find:

```tsx
      <div class="toolbar">
        <ModelSelector
```

Replace with:

```tsx
      <div class="toolbar">
        <div class="toolbar-brand">
          <svg class="toolbar-brand__mark" width="14" height="14" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="toolbar-beam" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%"   stop-color="#6366F1"/>
                <stop offset="50%"  stop-color="#8B5CF6"/>
                <stop offset="100%" stop-color="#22D3EE"/>
              </linearGradient>
            </defs>
            <line x1="40" y1="100" x2="88" y2="28" stroke="url(#toolbar-beam)" stroke-width="14" stroke-linecap="round"/>
          </svg>
          <span class="toolbar-brand__name">Lucent Code</span>
        </div>
        <ModelSelector
```

**Step 2: Add CSS for toolbar brand**

In `webview/src/styles.css`, find:

```css
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid var(--border);
}
```

Replace with:

```css
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid var(--border);
}

.toolbar-brand {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-right: 4px;
}

.toolbar-brand__name {
  font-size: 11px;
  font-weight: 600;
  color: var(--vscode-foreground);
  opacity: 0.8;
  letter-spacing: 0.03em;
  white-space: nowrap;
}
```

**Step 3: Build the webview**

```bash
cd webview && npm run build
```

Expected: build completes with no TypeScript errors. Output goes to `webview/dist/`.

**Step 4: Commit**

```bash
git add webview/src/App.tsx webview/src/styles.css
git commit -m "feat: add toolbar wordmark to webview"
```

---

### Task 3: Branded empty state

Replace the `💬` emoji in the empty state with the gradient `/` SVG logo + brand name + tagline.

**Files:**
- Modify: `webview/src/App.tsx` (lines 203–204)
- Modify: `webview/src/styles.css` (lines 268–271, the `.empty-state-icon` block)

**Context:**
The empty state currently shows `<div class="empty-state-icon">&#x1F4AC;</div>` followed by `<div class="empty-state-title">Lucent Code</div>`. We replace the emoji div with an SVG and add a tagline below the title. The SVG uses gradient ID `empty-beam` — distinct from `toolbar-beam`.

**Step 1: Update empty state markup in `App.tsx`**

Find:

```tsx
          <div class="empty-state">
            <div class="empty-state-icon">&#x1F4AC;</div>
            <div class="empty-state-title">Lucent Code</div>
```

Replace with:

```tsx
          <div class="empty-state">
            <svg class="empty-state__logo" width="56" height="56" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="empty-beam" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%"   stop-color="#6366F1"/>
                  <stop offset="50%"  stop-color="#8B5CF6"/>
                  <stop offset="100%" stop-color="#22D3EE"/>
                </linearGradient>
              </defs>
              <line x1="40" y1="100" x2="88" y2="28" stroke="url(#empty-beam)" stroke-width="14" stroke-linecap="round"/>
            </svg>
            <div class="empty-state-title">Lucent Code</div>
            <div class="empty-state-tagline">Write code in a new light.</div>
```

**Step 2: Update CSS — replace `.empty-state-icon` with `.empty-state__logo`, add `.empty-state-tagline`**

In `webview/src/styles.css`, find:

```css
.empty-state-icon {
  font-size: 48px;
  opacity: 0.5;
}
```

Replace with:

```css
.empty-state__logo {
  opacity: 0.9;
}
```

Then find:

```css
.empty-state-hint {
  font-size: 0.9em;
  line-height: 1.6;
}
```

Replace with:

```css
.empty-state-tagline {
  font-size: 0.85em;
  color: var(--fg-secondary);
  margin-top: -6px;
  margin-bottom: 4px;
}

.empty-state-hint {
  font-size: 0.9em;
  line-height: 1.6;
}
```

**Step 3: Build the webview**

```bash
cd webview && npm run build
```

Expected: no errors.

**Step 4: Commit**

```bash
git add webview/src/App.tsx webview/src/styles.css
git commit -m "feat: branded empty state with slash logo and tagline"
```

---

### Task 4: Fix duplicate ⚡ icons

Two places use `⚡`. Change them to semantically distinct characters:
- Autonomous mode (toolbar): `⚡` → `⊙`
- Skills button (chat input): `⚡` → `/`
- Skill chips (attachment area): `⚡ {chip.name}` → `/ {chip.name}`

**Files:**
- Modify: `webview/src/App.tsx` (line 169)
- Modify: `webview/src/components/ChatInput.tsx` (lines 355 and 424)

**Step 1: Change autonomous mode icon in `App.tsx`**

Find (line ~169):

```tsx
          ⚡
        </button>
```

...inside the autonomous-button. The surrounding context is:

```tsx
        <button
          class={`autonomous-button ${chatStore.autonomousMode() ? 'active' : ''}`}
          onClick={() => vscode.postMessage({ type: 'setAutonomousMode', enabled: !chatStore.autonomousMode() })}
          title="Autonomous mode — all tools run without approval"
        >
          ⚡
        </button>
```

Replace `⚡` with `⊙`:

```tsx
        <button
          class={`autonomous-button ${chatStore.autonomousMode() ? 'active' : ''}`}
          onClick={() => vscode.postMessage({ type: 'setAutonomousMode', enabled: !chatStore.autonomousMode() })}
          title="Autonomous mode — all tools run without approval"
        >
          ⊙
        </button>
```

**Step 2: Change skills attach button in `ChatInput.tsx`**

Find (line ~424):

```tsx
        >⚡</button>
```

...inside the "Browse skills" button. Full context:

```tsx
        <button
          class="attach-button"
          aria-label="Browse skills"
          onClick={() => { setSkillFilter(''); setShowSkills(true); }}
          title="Browse skills (or type / in the input)"
          disabled={props.isStreaming || props.skills.length === 0}
        >⚡</button>
```

Replace `>⚡</button>` with `>/</button>`:

```tsx
        <button
          class="attach-button"
          aria-label="Browse skills"
          onClick={() => { setSkillFilter(''); setShowSkills(true); }}
          title="Browse skills (or type / in the input)"
          disabled={props.isStreaming || props.skills.length === 0}
        >/</button>
```

**Step 3: Change skill chip label in `ChatInput.tsx`**

Find (line ~355):

```tsx
                  <span class="attachment-name">⚡ {chip.name}</span>
```

Replace with:

```tsx
                  <span class="attachment-name">/ {chip.name}</span>
```

**Step 4: Build the webview**

```bash
cd webview && npm run build
```

Expected: no errors.

**Step 5: Commit**

```bash
git add webview/src/App.tsx webview/src/components/ChatInput.tsx
git commit -m "fix: differentiate dual lightning icons — autonomous mode ⊙, skills /"
```

---

## Manual step: regenerate `images/icon.png`

`package.json` references `images/icon.png` as the marketplace icon. After completing Task 1, regenerate the PNG from the new SVG:

- Open `images/icon.svg` in a browser, screenshot at 128×128, save as `images/icon.png`
- Or use: `npx sharp-cli -i images/icon.svg -o images/icon.png` (if sharp-cli is available)
- Or use Inkscape: `inkscape images/icon.svg --export-png=images/icon.png --export-width=128`

Commit: `git add images/icon.png && git commit -m "chore: regenerate icon.png from new slash beam logo"`
