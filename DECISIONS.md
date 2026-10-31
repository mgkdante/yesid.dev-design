# Architecture decisions

This file records the current public architecture contracts. Historical release detail remains
available in Git history and `CHANGELOG.md`; it does not govern the current package surface.

## D1: The parity anchor is immutable

`v0.1.0` is the byte-faithful parity release extracted from yesid.dev commit
`2bdb611d91749dc437c07586cb82129eabe9dfec`, subject only to the deviation register in
[that release's README](https://github.com/mgkdante/yesid.dev-design/blob/v0.1.0/README.md).
The tag never moves. Later releases advance from that reference rather than rewriting it.

## D2: Consumers install exact release tarballs

Each release attaches one `bun pm pack` tarball per package, and consumers install them by URL from
an exact tag; the lockfile's integrity hash is the pin. The immutable GitHub Release and its
build-provenance attestation replaced the vendored snapshot, adoption tool and manifest in v0.28.0.

## D3: Eight packages release in lockstep

The root version and all eight packages, `@yesid/config` included since v0.28.0, move together and
nothing floats; the private Gallery stays outside. Sibling packages are peer dependencies pinned to
the same release, so each app holds exactly one copy of each.

## D4: Packages ship source and CSS is opt-in

Package exports resolve source TypeScript and Svelte through explicit conditional exports.
Imported CSS is declared as a side effect, but no package enables styling automatically.
`@yesid/tokens/tokens.css`, `@yesid/motion/tap-feedback.css`, and
`@yesid/motion/ripple.css` are deliberate public subpath imports. Consumers may keep a reviewed
copy only when their Tailwind layer or build boundary requires local ownership.

## D5: UI contracts match rendered ownership

Public UI props describe the element, state, and content a component actually owns. Native
attributes and refs follow the rendered element; controlled components leave state, actions,
copy, persistence, and locale policy with the consumer. `configureUi` accepts one normalized
application vocabulary per ESM module graph: an equivalent repeat is unchanged, a conflicting
repeat throws, and first `cn` use locks the zero-configuration default. Request-, tenant-, user-,
or locale-scoped configuration is not allowed.

## D6: Token generation is pure upstream and path-owned downstream

`packages/tokens/src/build.ts` is a pure content engine with no filesystem or consumer-checkout
knowledge. `tools/build-tokens.ts` owns repository paths, public UI inventory discovery and
write-if-changed outputs, and `--check` reports drift. From the same token source it writes four
committed artifacts: `packages/tokens/tokens.css` (plain custom properties),
`packages/tokens/theme.css` (the Tailwind `@theme` layer), `packages/motion/src/tokens.ts` and
`DESIGN.md`.

## D7: Gate engines are policy-neutral

`@yesid/gates` exports pure parameterized engines, types, and app-neutral defaults. Palettes,
thresholds, forbidden patterns, allowlists, markers, exclusions, and expected results remain
consumer-owned policy. App names, app presets, and product doctrine do not enter production gate
source.

## D8: Locale mechanics are shared; locale policy is local

`@yesid/i18n-core` owns pure configured prefix parsing, path localization and delocalization,
URL-state preservation, locale-switch detection, route-id normalization, cached Intl formatting with
relative time, and copy typing. `@yesid/ui` owns the Svelte locale context and `<html lang>` sync.
Consumers own their locale type and supported, default, prefixed, and published values; Intl tags;
copy and fallback policy; route exemptions; SvelteKit adapters; request fallback; and runtime
flags. i18n-core contains no framework import, virtual module or product locale registry.

## D9: Global ripple is explicit and optional

`@yesid/motion/utils/globalRipple` exposes the shared pointer-feedback utility and
`@yesid/motion/ripple.css` exposes its visual contract. Neither is a Svelte action, and neither
runs or injects CSS on import. Consumers explicitly initialize the utility, import the
stylesheet, and supply any live exclusion selector.

## D10: Fluid clamp tokens stay structured at the source

Fluid values use the `yesid.clamp` extension with structured `min`, `preferred`, and `max`
strings. Parsing rejects incomplete triples. CSS and ordinary YAML serialization produce
`clamp(min, preferred, max)`.
`DESIGN.md` typography uses the structured maximum because its font-size schema accepts one
dimension; spacing may retain the quoted clamp expression. This preserves the three inputs for
deterministic targets without pretending that clamp is a native DTCG dimension.

## D11: UI compatibility is owned by durable package and consumer contracts

`packages/ui/README.md` owns the shared component behavior and the known consumer compatibility
seams. Product conflicts never become
app checks in the package: the owner settles each one and the package ships the single look
(design-standard ds2 settled the Card, Button, resizable, StickyPanel, TerminalCursor, Separator
and MetroStation conflicts in yesid.dev's favor).

Shared controlled views own only their rendered mechanics. Consumers continue to own copy,
locale selection, state, persistence and actions, such as StopLabel prefixes. Package and
Gallery tests prove the neutral surface; every consumer bump still requires the consumer's source
guards, generated outputs, tests, build, accessibility checks, and relevant browser comparison.

## D12: Gallery is the repository browser authority, not consumer proof

Gallery dogfoods the workspace packages and owns repository-level rendered integration,
accessibility, reduced-motion and responsive checks. It does not install the
immutable Release asset and cannot prove a Transit or yesid.dev bump. Release integrity and
each product's verification remain separate gates.

## D13: Each package README documents its own contract

Each package README states what the package owns, how to use it and the rules it keeps. The root
README is an index, and the generated API reports remain the interface authority. Package READMEs
link repository files at the release tag, so the copy installed in `node_modules` never points at a
moved file. Gallery has its own README because it is a private app that is never released.

## D14: Two consumers are enough to promote a component

The owner changed [principle 4](README.md#principles) on 2026-10-26: a component or composed
pattern promotes once two independent products need the same contract. The rule of three left every frame and composed
component duplicated in Transit and yesid.dev while they waited for a third product. The copies
drifted, and each carried fixes the other lacked. Principle 1 still holds: a difference that cannot be a
prop with a default stays in the app.
