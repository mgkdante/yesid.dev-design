# Architecture decisions

This file records the current public architecture contracts. Historical release detail remains
available in Git history and `CHANGELOG.md`; it does not govern the current package surface.

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

## D10: Fluid clamp tokens stay structured at the source

Fluid values use the `yesid.clamp` extension with structured `min`, `preferred`, and `max`
strings. Parsing rejects incomplete triples. CSS and ordinary YAML serialization produce
`clamp(min, preferred, max)`, and Figma export carries that expression as a STRING variable.
`DESIGN.md` typography uses the structured maximum because its font-size schema accepts one
dimension; spacing may retain the quoted clamp expression. This preserves the three inputs for
deterministic targets without pretending that clamp is a native DTCG dimension.

## D11: UI compatibility is owned by durable package and consumer contracts

`packages/ui/README.md` owns the shared component behavior and the known consumer compatibility
seams. `BOUNDARIES.md` owns the cross-product placement decision, and each product owns the tests
for its local policy and appearance. Product conflicts never become app checks in the package:
yesid.dev's Button conversion and Card bevel/shadow stay local, Transit's flat Card contract stays
local, and composed `CollapsibleSection` behavior stays local until the rule of three is met.

Shared controlled views own only their rendered mechanics. Consumers continue to own copy,
locale selection, state, persistence, actions, and adapters such as StopLabel prefixes,
MetroStation roundels, and StickyPanel or TerminalCursor compatibility styling. Package and
Gallery tests prove the neutral surface; every adoption still requires the consumer's source
guards, generated outputs, tests, build, accessibility checks, and relevant browser comparison.

## D12: Gallery is the repository browser authority, not consumer proof

Gallery dogfoods the workspace packages and owns repository-level rendered integration,
accessibility, reduced-motion, responsive, and visual-regression checks. It does not install the
immutable Release asset and cannot prove a Transit or yesid.dev adoption. Release integrity and
each product's verification remain separate gates.

## D13: Package contracts are local and efficiency work is measured

Each package README owns that package's responsibility, interface links, invariants, consumer
obligations, commands, failure modes, compatibility, deterministic rules, and release impact.
The root README is an index. Generated API reports remain interface authority; `BOUNDARIES.md`,
`RELEASING.md`, `DEPRECATION.md`, and `CONSUMERS.md` retain their existing cross-package owners.
Package READMEs link those owners at the immutable release tag so vendored copies never depend on
paths outside the installed package. Gallery has its own README because it is a private app with a
different authority and release boundary.

Architecture and efficiency changes require a reproducible baseline and one observed failure or
cost. Line counts are physical `wc -l` counts over tracked path sets, not semantic estimates.
Generated and vendor material are reported separately. Raw churn is not net maintained change.

### Second-pass measurement receipt

| Measure | Exact-main baseline `03dfdd8` | Prepared candidate |
| --- | ---: | ---: |
| Tracked files | 349 | 356 |
| Maintained product files / LOC | 125 / 7,851 | 125 / 7,851 |
| Test files / LOC | 109 / 20,666 | 109 / 20,706 |
| Tooling/config files / LOC | 71 / 10,699 | 71 / 10,698 |
| Public-document files / LOC | 20 / 1,863 | 27 / 2,311 |
| Generated text LOC | 3,647 | 3,647 |
| Vendor-adjacent patch LOC / visual baselines | 43 / 4 | 43 / 4 |
| Maintained source directories | 33 | 33 |
| Public manifest entrypoints | 55 coordinated + 6 config | unchanged |
| Workspace dependency edges | 7 total / 5 runtime-or-dogfood | unchanged |
| Forwarding `index.ts` modules | 21 | 21 |
| Raw churn for the architecture branch | — | +577 / −70 |

The browser-discovery contract previously built Gallery before listing 16 cases: 9.94 seconds and
1,273,932 KiB peak RSS. Direct Playwright list mode reports the same matrix in 0.43 seconds and
184,152 KiB. A fresh cache-bypassed 756-test run measured 75.32 seconds before the change and
62.46–68.93 seconds across valid after runs; the isolated repeated build is the attributable win.

The style-regression benchmark uses 400 16-KiB files and 30 patterns, with five timed samples after
one warm-up. Median time moved from 119.35 ms to 60.83 ms. The implementation reads every file once,
preserves pattern/file result order, and restores caller-owned RegExp state after every match.

### Candidate disposition

- **Implemented:** package/Gallery README ownership, build-free browser discovery, and single-read
  style-regression scanning.
- **Retained:** 21 forwarding barrels are public package/UI compatibility surfaces or small family
  façades. Internal barrel cleanup alone did not justify another behavioral contract.
- **Retained:** the sole class, `AdoptError`, owns stable operational identity and exit codes.
- **Retained:** public types/interfaces, async acquisition/rendering boundaries, injected adapters,
  and isolated release/adoption fixtures all have real callers or failure semantics.
- **Deferred:** API-program batching, receipt-only archive inspection, registry consolidation, and
  test parallelism need separate byte/fault/performance tranches.
- **Rejected:** merging coordinated/config release engines, centralizing independent test parsers,
  deleting Windows API checks, or retiring public aliases without the deprecation gates.

### Release consequence

The README and gate-engine bytes change the coordinated package payload, so this pass prepares
`v0.13.3`. Config README bytes use the independent `config-v0.2.1` line. Neither release edits a
consumer; each consumer receives a separate exact-tag adoption handoff after both assets verify.
