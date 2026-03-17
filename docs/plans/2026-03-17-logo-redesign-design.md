# Logo Redesign — Design

**Date:** 2026-03-17
**Status:** Approved

---

## Overview

Replace the current icon (a glowing dot/orb) with a neural-network node cluster that subtly encodes `{ }` bracket negative space. The new icon is more distinctive, communicates both AI intelligence and code, and retains the existing colour palette.

---

## Concept

A neural net hero with brackets as hidden negative space. Two loose vertical bands of nodes fill the icon. The outer edges of each band curve inward at mid-height so the gap between them traces the silhouette of `{ }` — visible if you look for it, but not spelled out. The node cluster itself is the primary shape; the brackets are the reward for a second look.

---

## Composition

- **~14 nodes** arranged in two vertical bands (left and right of centre)
- Left band's right edge bows inward at mid-height → forms the `{` notch
- Right band's left edge bows inward at mid-height → forms the `}` notch
- Narrow gap at top and bottom, slightly wider at centre
- A few circuit traces cross the bracket gap diagonally (signals between halves)

---

## Visual Layers

| Layer | Element | Detail |
|-------|---------|--------|
| 1 | Background | Rounded rect `#0d0d1a`, rx=16, 128×128 |
| 2 | Connection traces | Thin straight lines between nearest neighbours, 15–25% opacity |
| 3 | Outer nodes | Small filled circles, `#38bdf8` (electric sky blue / cyan) |
| 4 | Mid nodes | Filled circles, `#a78bfa` (soft lavender-purple) |
| 5 | Core nodes (×2) | White `#ffffff` with soft SVG blur glow |

---

## Colour Palette

| Role | Colour | Description |
|------|--------|-------------|
| Background | `#0d0d1a` | Near-black navy |
| Outer nodes | `#38bdf8` | Electric sky blue / cyan |
| Mid nodes | `#a78bfa` | Soft lavender-purple |
| Core nodes | `#ffffff` | Pure white |

Unchanged from the existing icon — consistent with gallery banner (`color: "#0d0d1a"`) and extension branding.

---

## Glow Treatment

- Core 2 nodes: SVG `<filter>` with `feGaussianBlur` + `feComposite` for a soft bloom
- All other nodes: plain filled circles, no filter — keeps edges crisp at small sizes

---

## Size Behaviour

| Size | Behaviour |
|------|-----------|
| 128px (marketplace) | Full detail — bracket ghost legible, individual nodes distinct |
| 32px (extension list) | Node cluster reads as a clear diamond/hexagonal shape |
| 16px (activity bar) | Reduces to a bright white core on dark, distinctive blob shape |

---

## What Does NOT Change

- Colour palette (all existing hex values reused)
- Background colour and rounded-rect shape
- `package.json` icon path (`images/icon.png`)
- Gallery banner colour

---

## Implementation

The icon is hand-authored SVG in `images/icon.svg`. A build script (`scripts/generate-icon.mjs`) uses `sharp` (already a dev dependency) to rasterise it to `images/icon.png` at 128×128. The existing `sharp` dependency covers this with no new packages needed.
