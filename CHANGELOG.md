# Changelog

## 0.13.3

<!-- release-fragment: architecture-efficiency-pass-2 -->
- `@yesid/tokens` (patch), `@yesid/motion` (patch), `@yesid/gates` (patch), `@yesid/seo-kit` (patch), `@yesid/ui` (patch), `@yesid/analytics` (patch), `@yesid/i18n-core` (patch): Give every coordinated package a local ownership contract covering its interface, invariants,
  consumers, commands, failure modes, deterministic rules, and release implications. Remove
  duplicated tokens and motion narration from package manifests after those facts move to the
  nearest README. Make style-regression scans read each source file once while preserving finding
  order, diagnostics, and caller-owned RegExp state.

### Architecture and efficiency receipt

| Measure | Exact-main baseline `03dfdd8` | Prepared candidate |
| --- | ---: | ---: |
| Tracked files | 349 | 356 |
| Maintained product files / LOC | 125 / 7,851 | 125 / 7,871 |
| Package source modules | 120 | 120 |
| Test files / LOC | 109 / 20,666 | 109 / 20,706 |
| Tooling/config files / LOC | 71 / 10,699 | 71 / 10,698 |
| Public-document files / LOC | 20 / 1,863 | 27 / 2,328 |
| Generated text LOC | 3,647 | 3,647 |
| Vendor-adjacent patch LOC / visual baselines | 43 / 4 | 43 / 4 |
| Maintained source directories | 33 | 33 |
| Public manifest entrypoints | 55 coordinated + 6 config | unchanged |
| Direct exported types / interfaces | 98 / 52 interfaces | unchanged |
| Async candidates | 133 sites in 26 modules | unchanged |
| Classes | 1 (`AdoptError`) | unchanged |
| Workspace dependency edges | 7 total / 5 runtime-or-dogfood | unchanged |
| Forwarding `index.ts` modules | 21 | 21 |
| Raw churn for the architecture branch | — | +597 / −73 = +524 net |

Categorized net change reconciles to raw net change: product `+20`, tests `+40`, tooling `−1`,
public documentation `+465`, generated `0`, and vendor `0`, totaling `+524` maintained lines.

| Timed gate | Baseline | Prepared candidate |
| --- | ---: | ---: |
| Token generation/check | 0.02 s | 0.01 s |
| API authority check | 19.67 s | 16.97 s |
| Cache-bypassed full check | 31.33 s | 24.39 s |
| Cache-bypassed production build | 10.47 s | 7.55 s |
| Direct Gallery build | 10.39 s | 7.08 s |
| Cache-bypassed 756-test matrix | 75.32 s | 62.46–68.93 s |
| Hosted `ci-work` | PR #59: 3m21s | final protected-PR gate |
| Archive build / bytes / digest | 0.11 s / 798720 / `1376c630…565e9` | final tag gate |
| Archive adoption / offline check | 0.03 s / 0.02 s | final tag gate |

The browser-discovery contract previously built Gallery before listing 16 cases: 9.94 seconds and
1,273,932 KiB peak RSS. Direct Playwright list mode reports the same matrix in 0.43 seconds and
184,152 KiB. A fresh cache-bypassed 756-test run measured 75.32 seconds before the change and
62.46–68.93 seconds across valid after runs; the isolated repeated build is the attributable win.

The style-regression benchmark uses 400 16-KiB files and 30 patterns, with five timed samples after
one warm-up. Median time moved from 119.35 ms to 60.83 ms. The implementation reads every file once,
preserves pattern/file result order, and restores caller-owned RegExp state after every match.

Candidate disposition:

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

The README and gate-engine bytes change the coordinated package payload, so this pass prepares
`v0.13.3`. Config README bytes use the independent `config-v0.2.1` line. Neither release edits a
consumer; each consumer receives a separate exact-tag adoption handoff after both assets verify.

## 0.13.2

<!-- release-fragment: postphase3-contract-docs -->
- `@yesid/tokens` (patch), `@yesid/ui` (patch): Move fluid-token and UI compatibility guidance into durable package contracts without changing public APIs, runtime behavior, or token values.

<!-- release-fragment: postphase3-lineage-cleanup -->
- `@yesid/tokens` (patch), `@yesid/motion` (patch), `@yesid/ui` (patch): Remove historical lineage labels from package comments and token descriptions without changing APIs, behavior, or token values.

## 0.13.1

<!-- release-fragment: absolute-ui-guide-link -->
- `@yesid/ui` (patch): Fix the vendored UI README link to the immutable v0.13.1 product setup guide.

## 0.13.0

<!-- release-fragment: 035-footer-ripple-strip -->
- `@yesid/tokens` (minor), `@yesid/motion` (minor), `@yesid/ui` (minor): Add the footer leaf primitive subpath, the opt-in global ripple utility and stylesheet subpaths, and the semantic strip-height token with its public CSS output.

## 0.12.0

<!-- release-fragment: p2-i18n-core -->
- `@yesid/i18n-core` (minor): Add consumer-configured locale-routing mechanics with injected locale values, route exemptions, route-segment syntax, and URL-state preservation semantics.

## 0.11.1

<!-- release-fragment: p2-wordmark-autoplay-cleanup -->
- `@yesid/motion` (patch): Cancel delayed wordmark autoplay and active GSAP timelines when the motion action is destroyed.

## 0.11.0

<!-- release-fragment: i1-neutral-analytics -->
- `@yesid/analytics` (minor): Add neutral consent-aware analytics policy, sanitization, client, and injected Plausible transport primitives.

## 0.10.0

<!-- release-fragment: d1-canonical-breakpoints -->
- `@yesid/tokens` (minor): Add canonical tablet and desktop min/max breakpoint tokens and generated custom-media aliases for reusable consumer media queries.

## 0.9.0

<!-- release-fragment: d3-quiet-mode-button -->
- `@yesid/ui` (minor): Add the controller-neutral `QuietModeButton` brand component with caller-owned copy, state, actions, and an explicit optional glow effect.

## 0.8.0

<!-- release-fragment: i2-seo-foundation -->
- `@yesid/gates` (minor), `@yesid/seo-kit` (minor): Add framework-neutral JSON-LD, sitemap, and injected-rasterizer Satori primitives, plus reusable sitemap and Open Graph coverage engines.

## 0.7.1

<!-- release-fragment: reduced-motion-resubscribe -->
- `@yesid/motion` (patch): Refresh the OS reduced-motion preference when the store gains its first subscriber so preference changes while idle never leave later consumers with a stale animation policy.

## 0.7.0

<!-- release-fragment: u1-package-contracts -->
- `@yesid/tokens` (minor), `@yesid/motion` (minor), `@yesid/gates` (minor), `@yesid/ui` (minor): Move the four vendorable packages to one lockstep release, publish explicit conditioned source and opt-in CSS exports, tighten UI props to rendered behavior, and make UI configuration single-assignment per ESM module graph.

<!-- release-fragment: u2-token-ownership -->
- `@yesid/tokens` (patch): Make token generation a pure logical engine, keep repository paths in the private adapter, and establish `@yesid/tokens/tokens.css` as the single committed public CSS artifact.

<!-- release-fragment: u3-policy-neutral-gates -->
- `@yesid/gates` (minor): Remove product-named preset subpaths and policy tables, require consumers to provide their own brand hex policy, and expose only pure parameterized gate engines with app-neutral defaults.

<!-- release-fragment: u4-verified-adoption -->
- `@yesid/tokens` (minor), `@yesid/motion` (minor), `@yesid/gates` (minor), `@yesid/ui` (minor): Replace schema-1 shallow-clone adoption with schema-2 immutable Release acquisition, deterministic trust receipts, atomic installation, durable rollback and recovery, stable operational exits, and offline verification by the vendored tool bundle.

<!-- release-fragment: u5-ui-accessibility -->
- `@yesid/ui` (patch): Preserve semantic foreground utilities across every typography token, keep filtered combobox keyboard selection and listbox relationships accessible, and make scrollable UI surfaces keyboard reachable.
