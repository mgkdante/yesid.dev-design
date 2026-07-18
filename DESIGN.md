---
version: alpha
name: yesid.dev
description: Digital infrastructure that moves. Edge-to-edge, dark-first, four-color infrastructure doctrine (orange signage · yellow wayfinding · reflective white · structural black), motion-with-intent.

# GENERATED FROM packages/tokens/tokens.json — DO NOT EDIT
# Run `bun run tokens:build` to regenerate.

colors:
  primary: "#E07800"
  primary-hover: "#C96A00"
  accent: "#FFB627"
  accent-hover: "#E5A220"
  reflective: "#F5F5F0"
  glow: "#E07800"
  hazard-a: "#FFB627"
  hazard-b: "#1C1814"
  signage-bg: "#1C1814"
  signage-text: "#FFB627"
  background: "#141414"
  foreground: "#F5F5F0"
  muted: "#1E1E1E"
  muted-foreground: "#949494"
  card: "#1a1a1a"
  popover: "#2A2A2A"
  secondary-foreground: "#999999"
  terminal: "#141414"
  manifesto: "#0f0d0a"
  border: "#3A3A3A"
  border-subtle: "#2f2f2f"
  border-strong: "#4A4A4A"
  destructive: "#ff5f57"
  destructive-foreground: "#1B0F0D"
  success: "#28c840"
  accent-text: "#FFB627"
  accent-foreground: "#1A1714"
  input: "#75664F"
  terminal-chrome: "#0E0E0E"
  terminal-ink: "#E9E2D2"
  terminal-ink-muted: "#A89E8D"
  signal-lunar: "#DAD2C2"
  lamp-bezel: "#060403"
  line-amber: "#FFB627"
  accent-surface: "#332812"

typography:
  hero:
    fontSize: "8.125rem"
  hero-mobile:
    fontSize: "4rem"
  display:
    fontSize: "4rem"
  title:
    fontSize: "2.5rem"
  heading:
    fontSize: "1.5rem"
  subheading:
    fontSize: "1.1875rem"
  body:
    fontSize: "1.0625rem"
  small:
    fontSize: "0.9375rem"
  mono:
    fontSize: "0.875rem"
  caption:
    fontSize: "0.8125rem"
  card-title:
    fontSize: "1.25rem"
  card-body:
    fontSize: "1.0625rem"
  card-meta:
    fontSize: "0.9375rem"
  control:
    fontSize: "0.9375rem"
  tag:
    fontSize: "0.9375rem"
  back-link:
    fontSize: "0.9375rem"
  detail-meta:
    fontSize: "1.0625rem"
  detail-kicker:
    fontSize: "0.75rem"
  menu-subtitle:
    fontSize: "1rem"
  micro:
    fontSize: "0.6875rem"

rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  pill: "9999px"

spacing:
  "page-x": "clamp(1.5rem, 4vw, 5rem)"
  "section-y": "clamp(3rem, 8vw, 6rem)"
  "card-gap": "clamp(1rem, 2vw, 1.5rem)"

components:
  BlueprintShell: {}
  ChevronToggle: {}
  MetroStation: {}
  SectionLabel: {}
  StickyPanel: {}
  StopLabel: {}
  TerminalCursor: {}
  TocBadge: {}
---

## Overview

yesid.dev is a freelance digital-infrastructure brand. The design language is edge-to-edge,
dark-first, governed by the four-color infrastructure doctrine below. Every visual decision
traces back to one of five principles: edge-to-edge layout, dark-first surfaces, one-orange
interactivity (orange is the clickable hue — with a single doctrinal exception: yellow
conversion buttons, see Colors), motion-with-intent, no fluff.
Full narrative and implementation rules: Notion → Business → Brand.

## Colors

**THE FOUR-COLOR INFRASTRUCTURE DOCTRINE** (constitutional). Real infrastructure speaks four
colors — orange signage, yellow hazard stripes (with black), reflective white, black tape and
structure. Each holds a named role; every component usage maps to exactly one:

- **ORANGE — interactive/signage** (`primary` `#E07800`, light `#A05500`): links, buttons,
  CTAs, focus rings, active/hover states, signage accents. The clickable hue for everything
  except conversion (below).
- **YELLOW — wayfinding & hazard & highlight** (`accent` `#FFB627` as surface/art;
  `accent-text` as AA text, light `#815D00`; `line-amber`; `accent-surface`): section
  labels/overlines (`.label-station`), departure-board and status readouts, metric/number
  callouts, data-viz/diagram amber, selected/highlight states, hazard tape. Round 5c —
  THE YELLOW-CONVERSION RULE: yellow holds exactly ONE clickable job, "talk to Yesid"
  conversion buttons (contact submit, hero contact, about send, closer CTA) drawn as the
  theme-invariant signage pair (`accent` `#FFB627` ground / `signage-bg` `#1C1814` ink,
  ~10:1, hover `accent-hover`), at most one per view. Every other yellow stays unclickable.
- **WHITE — reflective** (`reflective` `#F5F5F0`, theme-invariant; dark `foreground`):
  key headline words on dark, catch-lights (`edge-highlight`), white-core métro dots and
  reflective chips over guaranteed-dark grounds.
- **BLACK — tape/structure** (`hazard-b` / `signage-bg` `#1C1814`; light `border-strong`
  joins the family): hazard stripe pairing, signage chip grounds, light-mode strong
  structural rules drawn as black tape on paper. Dark mode's deep board IS the black voice.

Semantic tokens (`background`, `foreground`, `card`, `muted`, etc.) carry theme-switching
responsibility. Contrast verified on dark first, then light — all pairs script-computed.

## Typography

Inter Variable for headings + body; JetBrains Mono Variable for code, terminals, mono labels.
Self-hosted (no Google Fonts CDN). Type scale uses `clamp()` for fluid sizing across breakpoints.
Hard floors: body ≥ 16px, mono ≥ 13px, labels ≥ 12px, micro for chrome only.

## Layout

Four CSS Grid recipes: Full-Bleed · Contained · Content+Sidebars · Edge-Title-Grid. Container
widths cap at `64rem` (content) / `72rem` (wide). Page gutters scale via `--space-page-x`.
Section spacing scales via `--space-section-y`. Detailed recipes: Notion → Business → Brand.

## Elevation & Depth

Shadow tokens use `color-mix(in srgb, var(--primary) N%, transparent)` for brand-connected
glows. Six tiers: `glow-sm`, `glow-md`, `glow-lg`, `card`, `section`, `nav`. No raw
`box-shadow` in components.

## Shapes

Five radius tokens: `sm` (4px), `md` (8px, default), `lg` (12px), `xl` (16px), `pill` (9999px).
Borders use semantic tokens (`border`, `border-subtle`, `border-strong`).

## Components

See `@yesid/ui/brand` (8 components: `BlueprintShell`, `ChevronToggle`, `MetroStation`, `SectionLabel`, `StickyPanel`, `StopLabel`, `TerminalCursor`, `TocBadge`) and
13 primitive subpaths (`@yesid/ui/badge`, `@yesid/ui/button`, `@yesid/ui/card`, `@yesid/ui/collapsible`, `@yesid/ui/combobox`, `@yesid/ui/resizable`, `@yesid/ui/scroll-area`, `@yesid/ui/separator`, `@yesid/ui/sheet`, `@yesid/ui/skeleton`, `@yesid/ui/tabs`, `@yesid/ui/toggle`, `@yesid/ui/toggle-group`). Design-system documentation:
Notion → Business → Brand.

## Do's and Don'ts

**Do**

- Reference tokens via `var(--token)` or Tailwind utilities (`bg-primary`, `text-foreground`).
- Use the 4 CSS Grid recipes; pages own their grids in scoped CSS.
- Respect `prefers-reduced-motion` on every animation.

**Don't**

- Hardcode hex colors in components.
- Use arbitrary Tailwind values (`text-[14px]`, `p-[22px]`) — use the scale or a token.
- Use `vh` on mobile; use `dvh`/`svh`/`lvh`.
- Add motion that doesn't serve wayfinding, feedback, or emphasis.
