# yesid.dev-design

The yesid brand's shared foundation as a standalone bun+turbo monorepo — design
tokens, pure motion actions, UI primitives, quality gates, neutral SEO infrastructure,
consent-aware analytics primitives, and consumer-configured locale-routing mechanics, extracted from
**yesid.dev @ `2bdb611d91749dc437c07586cb82129eabe9dfec`** (the **parity
anchor**, branch `feat/conversion-hardening-batch`, extracted 2026-07-02).

## Layout

| Path | What it is |
|---|---|
| [`packages/tokens`](packages/tokens/README.md) | `@yesid/tokens` — canonical DTCG source, deterministic generators, package CSS, and manual Figma round-trip contract. |
| [`packages/motion`](packages/motion/README.md) | `@yesid/motion` — Tier-1 actions, policy, reduced-motion state, helpers, generated tokens, and opt-in CSS. |
| [`packages/gates`](packages/gates/README.md) | `@yesid/gates` — pure parameterized quality engines; consumers own policy and pass/fail doctrine. |
| [`packages/seo-kit`](packages/seo-kit/README.md) | `@yesid/seo-kit` — framework-neutral JSON-LD, sitemap, and injected-rasterizer mechanics. |
| [`packages/ui`](packages/ui/README.md) | `@yesid/ui` — source-shipped Svelte primitives and promoted brand components. |
| [`packages/analytics`](packages/analytics/README.md) | `@yesid/analytics` — consent, policy, sanitization, ordered clients, and injected transport. |
| [`packages/i18n-core`](packages/i18n-core/README.md) | `@yesid/i18n-core` — pure consumer-configured locale-routing mechanics. |
| [`packages/config`](packages/config/README.md) | `@yesid/config` — independently released compiler/task configuration; outside coordinated lockstep. |
| [`apps/gallery`](apps/gallery/README.md) | Private rendered dogfood and browser authority; not consumer proof. |
| [`tests/repository`](tests/repository/README.md) | Root-owned tooling and cross-package contract authority; separate from Gallery. |
| `tools` | Repository adapters for tokens, API reports, releases, archives, config releases, and adoption; operational owners are linked from the Commands section. |

## Versioning + the parity contract

- **`v0.1.0` — THE PARITY RELEASE.** Contents byte-faithful to yesid.dev at the
  anchor SHA (deviations below are the exhaustive list). It preserves the
  original zero-visual-change baseline.
- Later brand changes bump PAST the parity tag (`v0.2.0` adds the dataviz
  scale; beautification-era changes go higher). The parity tag never moves.
- **Lockstep started at `v0.7.0`.** The root manifest is canonical
  for `@yesid/tokens`, `@yesid/motion`, `@yesid/gates`, `@yesid/seo-kit`, `@yesid/ui`,
  `@yesid/analytics`, and `@yesid/i18n-core`; all seven package versions move together. Historical
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

The standing cross-product ownership map is [`BOUNDARIES.md`](BOUNDARIES.md).
It records what remains consumer-owned, why, and the receipt for each boundary.

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
bun install --frozen-lockfile   # install the pinned workspace lockfile
bun run check                   # API, TypeScript, and workspace checks
bun run test                    # repository contracts + all package and app tests
bun run ci:tokens               # build + git-diff drift gate on generated outputs
bun run build                   # token generation + all workspace builds
bun run tokens:build            # regenerate the 4 repository artifacts (idempotent)
bun run --cwd apps/gallery dev   # the living gallery
bun run setup:hooks             # enable .githooks (generated-files guard)
```

## Distribution

Consumers vendor exact immutable GitHub Release assets. Run the complete
[`tools/adopt.ts`](tools/adopt.ts) bundle (`tools/adopt.ts` plus `tools/adopt/`)
with `--tag vX.Y.Z`, then commit the package snapshot, self-vendored adoption
tool, and schema-2 `manifest.json`. `--check` verifies the tool, exclusion policy,
and full payload offline. Git dependencies cannot select workspace subpackages,
and npm publication remains an optional later layer. The full decision is in
[`DECISIONS.md`](DECISIONS.md).

Shared tooling uses the separate, independently versioned `@yesid/config`
asset (`config-vX.Y.Z` / `yesid-config-vX.Y.Z.tgz`). It never enters the
coordinated `vX.Y.Z` adoption archive.
The [shared CI contract](docs/SHARED-TOOLING-CI.md) documents immutable-SHA
classifier, reporter, and configuration/caller drift actions.

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

The current evidence-backed Release registry lives only in
[`CONSUMERS.md`](CONSUMERS.md). This repository owns immutable release
provenance and adoption mechanics; each external consumer owns its reviewed
version bump, generated outputs, tests, build, and product/browser verification.
Gallery remains the private workspace dogfood consumer. Upstream release
evidence, external adoption, and product verification are separate gates; none
is inferred from another.

## AI-accelerated, human-owned

This repo is built with AI assistance under human direction. Architecture,
brand choices, release decisions, and acceptance remain human-owned; agent
output is reviewed, claims are checked against source, and CI enforces the
durable package, token, and release contracts.
