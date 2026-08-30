# Architecture decisions

This file records the current public architecture contracts. Historical release detail remains
available in Git history, `CHANGELOG.md`, and `packages/ui/PARITY-NOTES.md`; it does not govern
the current package surface.

## D1: The parity anchor is immutable

`v0.1.0` is the byte-faithful parity release extracted from yesid.dev commit
`2bdb611d91749dc437c07586cb82129eabe9dfec`, subject only to the deviation register in
`README.md`. The tag never moves. Later releases advance from that reference rather than
rewriting it.

## D2: Consumers adopt immutable schema-2 releases

Consumers vendor exact annotated GitHub Release assets. The schema-2 manifest binds the tag
object, peeled commit, release asset size and SHA-256 digest, canonical package closure,
exclusion-policy digest, complete adoption-tool digest, and length-framed payload tree hash.
The self-vendored `tools/adopt.ts` bundle acquires, installs, recovers, and verifies the snapshot
atomically. Offline `--check` proves installed-payload integrity; upstream CI and product
verification remain separate evidence.

## D3: Seven packages release in lockstep

The root version and `@yesid/tokens`, `@yesid/motion`, `@yesid/gates`, `@yesid/seo-kit`,
`@yesid/ui`, `@yesid/analytics`, and `@yesid/i18n-core` move together. Consumers choose and
review an exact release; nothing floats automatically. The private `@yesid/gallery` workspace
remains outside package lockstep. The separately versioned `@yesid/config` release also remains
outside the seven-package archive and has its own adoption and CI contract.

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
knowledge. `tools/build-tokens.ts` owns repository paths, public UI inventory discovery,
sentinel replacement, and write-if-changed outputs. `packages/tokens/tokens.css` is the single
package CSS artifact; motion TypeScript, the Gallery theme region, and `DESIGN.md` are committed
downstream artifacts generated from the same token source.

## D7: Gate engines are policy-neutral

`@yesid/gates` exports pure parameterized engines, types, and app-neutral defaults. Palettes,
thresholds, forbidden patterns, allowlists, markers, exclusions, and expected results remain
consumer-owned policy. App names, app presets, and product doctrine do not enter production gate
source.

## D8: Locale mechanics are shared; locale policy is local

`@yesid/i18n-core` owns pure configured prefix parsing, path localization and delocalization,
URL-state preservation, locale-switch detection, and route-id normalization. Consumers own their
locale type and supported, default, prefixed, and published values; copy and fallback policy;
route exemptions; Svelte context; SvelteKit adapters; request fallback; and runtime flags. The
package contains no framework virtual-module imports or product locale registry.

## D9: Global ripple is explicit and optional

`@yesid/motion/utils/globalRipple` exposes the shared pointer-feedback utility and
`@yesid/motion/ripple.css` exposes its visual contract. Neither is a Svelte action, and neither
runs or injects CSS on import. Consumers explicitly initialize the utility, import the
stylesheet, and supply any live exclusion selector.
