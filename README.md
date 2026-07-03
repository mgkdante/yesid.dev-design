# yesid.dev-design

The yesid brand's styling foundation as a standalone bun+turbo monorepo — design
tokens, pure motion actions, and brand quality gates, extracted from
**yesid.dev @ `2bdb611d91749dc437c07586cb82129eabe9dfec`** (the **parity
anchor**, branch `feat/conversion-hardening-batch`, extracted 2026-07-02).

## Layout

| Path | What it is |
|---|---|
| `packages/tokens` | `@yesid/tokens` — the DTCG `tokens.json` source of truth + generators (semantic CSS vars, Tailwind v4 `@theme` sentinel region, JS motion mirror, `DESIGN.md`) + parity tests + Figma round-trip scripts. Byte-faithful to the anchor except retargeted output paths (`build.ts`, `parity.test.ts`). |
| `packages/motion` | `@yesid/motion` — the Snappy-Doctrine Tier-1 vocabulary: `boop`, `magnetic`, `cursorGlow`, `sectionGlow`, `cardParallax`, `pressBounce`, `wordmarkHover`, `sectionMagnet` + `policy.ts` (the motion doctrine), reduced-motion store, device/gsap/lenis helpers, generated `tokens.ts`. Byte-faithful except `$lib` → relative import rewrites and the DEVIATION register below. |
| `packages/gates` | `@yesid/gates` — brand vitest gates as pure, parameterized engines + preset tables: tokens-only (style regressions), contrast (color-mix floors + computed WCAG AA pairs), no-raw-brand-hex, dataviz doctrine (no-primary-in-dataviz), tv()-only-in-ui. Detection internals byte-equivalent to the source gates; presets carry yesid.dev's and transit's concrete tables. |
| `apps/gallery` | `@yesid/gallery` — the living brand gallery: token sheets + motion demos rendered from `tokens.json`; the dogfood consumer that receives the generated outputs. |

## Versioning + the parity contract

- **`v0.1.0` — THE PARITY RELEASE.** Contents byte-faithful to yesid.dev at the
  anchor SHA (deviations below are the exhaustive list). yesid.dev can adopt AT
  this tag with **zero visual change**, at any time, regardless of what ships
  after it.
- Later brand changes bump PAST the parity tag (`v0.2.0` adds the dataviz
  scale; beautification-era changes go higher). The parity tag never moves.
- **Consumers pin exact versions.** A cascade is a deliberate bump-PR in the
  consumer (re-run its design-sync against the new tag, review the diff) —
  never an implicit float.

## Governance laws

1. **No app-conditionals ever.** Nothing in these packages may branch on which
   app consumes it (`if (app === 'transit')` in any disguise). If something
   can't be expressed app-agnostically, it is not brand foundation — **demote
   it** back to the app instead.
2. **One-direction flow.** Brand truth lives HERE and flows OUT to consumers.
   Apps never patch vendored/installed package code; an app that needs a change
   upstreams it here first, then takes the bump.
3. **Consumers pin exact versions; cascade = deliberate bump-PRs.** No `^`/`~`
   floats, no auto-sync. Every version move in a consumer is a reviewed PR.
4. **Components promote only by rule of three.** A component/composed pattern
   (TocNav, TocPill, CollapsibleSection, persisted …) stays vendored per-app
   until THREE independent consumers need the same contract — only then may it
   promote into a package, as its own deliberate release.

## Deviation register (v0.1.0 vs the anchor — exhaustive)

- **MOTION-1** — `packages/motion/src/utils/gsap.ts` (+ its test): eager
  `MorphSVGPlugin` import and the `loadDrawSVG/loadMorphSVG/loadFlip/loadCustomEase`
  lazy loaders dropped; their only consumers are Tier-2 actions
  (morphHover/scrollChain) that stay app-side. Kept code is byte-equivalent.
- **Import rewrites** — `wordmarkHover.ts`, `pressBounce.ts`, `cardParallax.ts`:
  `$lib/motion/...` → relative specifiers (the package has no SvelteKit alias).
  Tests keep their `$lib` mock specifiers via a vitest alias.
- **Retargeted paths** — `packages/tokens/build.ts` + `parity.test.ts` write/
  check this repo's consumers (apps/gallery, packages/motion, root DESIGN.md)
  instead of yesid.dev's apps/web.
- **actions/index.ts** — `morphHover` + `scrollChain` export lines pruned
  (Tier 2, out of scope).
- **packages/gates** — new package by design: engines refactored from the four
  source gate files with byte-equivalent detection; `tvOnlyInUi` is MINTED
  (no test existed anywhere; codifies the observed convention).
- **packages/motion/tsconfig.json** — no `noUncheckedIndexedAccess` (the
  extracted sources were written against yesid.dev's app tsconfig, which does
  not set it).

## Tier model

- **Tier 1 (this repo):** tokens · pure motion actions · brand gates. Extracted at parity.
- **Tier 2 (stays app-side):** composed patterns (TocNav/TocPill/
  CollapsibleSection/persisted), morphHover/scrollChain, app art-direction
  pinning tests. Promote only by rule of three (Law 4).

## Commands

```sh
bun install                 # workspace install
bun run tokens:build        # regenerate the 4 token outputs (idempotent)
bun run ci:tokens           # build + git-diff drift gate on generated outputs
bun run test                # turbo: all package + app tests
bun run check               # turbo: typechecks + svelte-check
bun run --cwd apps/gallery dev   # the living gallery
bun run setup:hooks         # enable .githooks (generated-files guard)
```

## Consumers

- **transit** (`transit.yesid.dev`) — adopts via vendored-sync at a pinned tag
  (`apps/web/vendor/design/` + manifest; see transit's `tools/design-sync.ts`).
- **yesid.dev** — adopts later via the FLIP-THE-SWITCH handoff
  ([FLIP-THE-SWITCH.md](FLIP-THE-SWITCH.md)) at the parity tag, zero visual change.
