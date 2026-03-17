# Logo Redesign v2 — Design

**Date:** 2026-03-17
**Status:** Approved

---

## Overview

Revise the icon to make the `{ }` brackets explicitly visible and reduce visual noise. The brackets are drawn as thin stroked SVG paths; a compact 8-node neural-net cluster sits in the space between them.

---

## Composition

**Brackets** — two `{ }` paths as thin white strokes (~35% opacity, 2px width, rounded caps). Each spans the full height of the icon (y=20 to y=108). The left `{` notch points left; the right `}` notch points right. Inner edges sit at approximately x=22 and x=106, leaving an 84px gap for the neural net.

**Neural net (8 nodes)** — a compact diamond cluster centred at (64, 64):

| Position | Coords | Colour | Radius |
|----------|--------|--------|--------|
| Top-left | (52, 34) | cyan `#38bdf8` | 4.5 |
| Top-right | (76, 34) | cyan `#38bdf8` | 4.5 |
| Upper-centre-left | (57, 52) | white `#ffffff` + glow | 7 |
| Upper-centre-right | (71, 52) | white `#ffffff` + glow | 7 |
| Lower-centre-left | (57, 76) | purple `#a78bfa` | 5.5 |
| Lower-centre-right | (71, 76) | purple `#a78bfa` | 5.5 |
| Bottom-left | (52, 94) | cyan `#38bdf8` | 4.5 |
| Bottom-right | (76, 94) | cyan `#38bdf8` | 4.5 |

**7 connection traces** — white at 20% opacity:
1. (52,34)→(57,52)
2. (76,34)→(71,52)
3. (57,52)→(71,52) — horizontal across glow pair
4. (57,52)→(71,76) — diagonal crossing (the "signal" trace)
5. (57,76)→(71,76) — horizontal across purple pair
6. (57,76)→(52,94)
7. (71,76)→(76,94)

---

## Bracket SVG Paths

Left `{` (centerline, strokeWidth=2, fill=none):
```
M 40,20  L 28,20  Q 22,20 22,30  L 22,56  Q 22,64 14,64  Q 22,64 22,72  L 22,98  Q 22,108 28,108  L 40,108
```

Right `}` (mirrored):
```
M 88,20  L 100,20  Q 106,20 106,30  L 106,56  Q 106,64 114,64  Q 106,64 106,72  L 106,98  Q 106,108 100,108  L 88,108
```

---

## Colour Palette

Unchanged from v1 — `#0d0d1a` bg, `#38bdf8` cyan, `#a78bfa` purple, `#ffffff` white.

---

## What Changes vs v1

| v1 | v2 |
|----|-----|
| 14 nodes | 8 nodes |
| 15 traces | 7 traces |
| Bracket = negative space only (invisible) | Bracket = explicit stroked paths (visible) |
| Two clusters separated by a gap | Single centred cluster inside `{ }` |
