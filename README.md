# yesid.dev-design

The yesid brand's styling foundation as a standalone bun+turbo monorepo — design
tokens, pure motion actions, UI primitives, and brand quality gates, extracted from
**yesid.dev @ `2bdb611d91749dc437c07586cb82129eabe9dfec`** (the **parity
anchor**, branch `feat/conversion-hardening-batch`, extracted 2026-07-02).

## Layout

| Path | What it is |
|---|---|
| `packages/tokens` | `@yesid/tokens` — the DTCG `tokens.json` source of truth, package-owned generated `tokens.css`, pure logical build engine, generators, and Figma round-trip scripts. Repository artifact mapping stays downstream in `tools/build-tokens.ts`. |
| `packages/motion` | `@yesid/motion` — the Snappy-Doctrine Tier-1 vocabulary: `boop`, `magnetic`, `cursorGlow`, `sectionGlow`, `cardParallax`, `pressBounce`, `wordmarkHover`, `sectionMagnet` + `policy.ts` (the motion doctrine), reduced-motion store, device/gsap/lenis helpers, generated `tokens.ts`, and optional `tap-feedback.css`. Byte-faithful except `$lib` → relative import rewrites and the DEVIATION register below. |
| `packages/gates` | `@yesid/gates` — pure, parameterized brand-quality engines: tokens-only style regressions, color-mix and WCAG contrast checks, no-raw-brand-hex, dataviz doctrine, and tv()-only-in-ui. Product policy stays in each consumer; upstream regression fixtures are neutral and test-only. |
| `packages/ui` | `@yesid/ui` — source-shipped Svelte 5 primitives and promoted brand components, with package-owned class merging and product vocabulary configured once at boot. |
| `apps/gallery` | `@yesid/gallery` — the living brand gallery: token sheets + motion demos rendered from `tokens.json`; the dogfood consumer of `@yesid/tokens/tokens.css`. |

## Versioning + the parity contract

- **`v0.1.0` — THE PARITY RELEASE.** Contents byte-faithful to yesid.dev at the
  anchor SHA (deviations below are the exhaustive list). It preserves the
  original zero-visual-change baseline; yesid.dev now consumes `v0.7.1`.
- Later brand changes bump PAST the parity tag (`v0.2.0` adds the dataviz
  scale; beautification-era changes go higher). The parity tag never moves.
- **Lockstep started at `v0.7.0`.** The root manifest is canonical
  for `@yesid/tokens`, `@yesid/motion`, `@yesid/gates`, and `@yesid/ui`; all
  four package versions move together from this release onward. Historical
  package-version skew and annotated tags `v0.1.0` through `v0.6.0` remain
  immutable. The private `@yesid/gallery` app is excluded from lockstep.
- **Consumers pin exact versions.** A cascade is a deliberate bump-PR in the
  consumer (run `tools/adopt.ts` against the new exact tag, review the diff) —
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
- **Historical retargeting (superseded by U2)** — the parity release wrote to
  app paths from inside `packages/tokens`. The current pure engine returns a
  logical output map; the root repository adapter owns filesystem paths.
- **actions/index.ts** — `morphHover` + `scrollChain` export lines pruned
  (Tier 2, out of scope).
- **packages/gates** — new package by design: engines refactored from the four
  source gate files with byte-equivalent detection; `tvOnlyInUi` is MINTED
  (no test existed anywhere; codifies the observed convention).
- **packages/motion/tsconfig.json** — no `noUncheckedIndexedAccess` (the
  extracted sources were written against yesid.dev's app tsconfig, which does
  not set it).

## Tier model

- **Tier 1 (this repo):** tokens · pure motion actions · brand gates · promoted UI primitives. Extracted at parity or promoted in a documented wave.
- **Tier 2 (stays app-side):** composed patterns (TocNav/TocPill/
  CollapsibleSection/persisted), morphHover/scrollChain, app art-direction
  pinning tests. Promote only by rule of three (Law 4).

## Commands

```sh
bun install                 # workspace install
bun run tokens:build        # regenerate the 4 repository artifacts (idempotent)
bun run ci:tokens           # build + git-diff drift gate on generated outputs
bun run test                # turbo: all package + app tests
bun run check               # turbo: typechecks + svelte-check
bun run --cwd apps/gallery dev   # the living gallery
bun run setup:hooks         # enable .githooks (generated-files guard)
```

## Distribution

Consumers vendor exact immutable GitHub Release assets. Run the complete
[`tools/adopt.ts`](tools/adopt.ts) bundle (`tools/adopt.ts` plus `tools/adopt/`)
with `--tag vX.Y.Z`, then commit the package snapshot, self-vendored adoption
tool, and schema-2 `manifest.json`. `--check` verifies the tool, exclusion policy,
and full payload offline. Git dependencies cannot select workspace subpackages,
and npm publication remains an optional later layer. The full decision is in
[`DECISIONS.md`](DECISIONS.md).

For a new product, follow [`docs/BUILD-A-YESID-PRODUCT.md`](docs/BUILD-A-YESID-PRODUCT.md).
It covers adoption, token generation, Tailwind, fonts, UI configuration, motion,
gates, localization, and deliberate tag bumps.

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a PR. Machinery changes
are welcome. Brand identity values remain owner decisions. Release operators
use [`RELEASING.md`](RELEASING.md); compatibility follows
[`DEPRECATION.md`](DEPRECATION.md), and supported report boundaries are in
[`SUPPORT.md`](SUPPORT.md).

## Consumers

The current evidence-backed Release receipts live in
[`CONSUMERS.md`](CONSUMERS.md). Transit and yesid.dev each adopt all four
packages through an immutable schema-2 Release receipt. Gallery remains the
private workspace dogfood consumer. Release adoption and product verification
are separate gates; neither is inferred from an upstream tag.

## AI-accelerated, human-owned

This repo is built with AI assistance under strict human direction — every
architectural and brand decision is the author's. The full operating model
(adversarial review in both directions, machine-enforced brand doctrine) is
documented in [docs/AI-WORKFLOW.md](docs/AI-WORKFLOW.md).
