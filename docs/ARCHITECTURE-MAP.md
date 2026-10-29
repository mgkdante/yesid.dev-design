# Architecture map and efficiency evidence

This bounded map records repository-owned dependency direction, evidence authorities, and the
reproducible second-pass measurement receipt. Package-specific operational contracts stay in each
package README. Cross-product placement stays in `BOUNDARIES.md`; public interface truth stays in
`api-reports/`; release and adoption truth stays in `RELEASING.md` and `CONSUMERS.md`.

## Dependency direction

```text
tokens.json -> pure token generators -> committed generated artifacts
                                             |
selected source-shipped packages -> Gallery dogfood/browser authority
             |
             +-> eight package tarballs on the release -> exact-tag consumers
```

| Owner | Inputs and allowed dependencies | Stable output or authority |
| --- | --- | --- |
| `@yesid/tokens` | DTCG source and pure generators; no package workspace dependency | token values, CSS, generated motion values, Gallery theme block, and `DESIGN.md` |
| `@yesid/motion` | GSAP and Lenis; generated token values are committed locally | actions, reduced-motion policy, utilities, and opt-in CSS |
| `@yesid/gates` | consumer-supplied policy and filesystem inputs; no product preset | deterministic consumer-neutral findings |
| `@yesid/seo-kit` | `@yesid/tokens`; consumer data and injected rasterizer | framework-neutral JSON-LD, sitemap and robots, share card, favicon mark, and security-header mechanics |
| `@yesid/analytics` | `@plausible-analytics/tracker`; consumer domain and event vocabulary | host-guarded cookieless pageviews and events, URL reduction, and web-vitals collection |
| `@yesid/i18n-core` | consumer locale values, Intl tags and route rules | pure locale routing, cached Intl formatting with relative time, and copy typing |
| `@yesid/ui` | `@yesid/motion` and `@yesid/seo-kit`; caller-owned state, copy, and actions | source-shipped Svelte primitives, rule-of-three brand components, the page head, and shared state (theme, quiet mode, clock, locale context) |
| `@yesid/config` | no coordinated-package dependency | compiler and task configuration, released in lockstep |
| Gallery | `tokens`, `motion`, `gates`, and `ui` | private dogfood plus rendered, accessibility, motion, responsive, and visual authority |
| Root tooling | release manifests plus explicit self-canaries | token generation, API reports, releases, governance, and CI selection |

The graph has seven workspace edges: five runtime-or-dogfood edges and two root self-canary/tooling
edges. Packages do not depend on Gallery or a consumer. Product policy remains in Transit and
yesid.dev. Gallery proves the repository surface, never a consumer adoption.

## Evidence authorities

| Contract | Authority |
| --- | --- |
| Public exports and declarations | seven committed API reports plus manifest export maps |
| Token bytes and Linux/Windows parity | `tokens.json`, pure generators, committed outputs, and byte gates |
| Rendered integration | Gallery SSR contracts and the pinned browser matrix |
| Coordinated distribution | annotated `v*` tag, eight package tarballs and their build-provenance attestation |
| Legal and identity boundaries | `LICENSE`, `NOTICE`, and `TRADEMARK.md` without inferred legal conclusions |

## Second-pass measurement receipt

Line counts are physical `wc -l` counts over tracked path sets. The product total includes the 91
hand-maintained lines in Gallery's mixed generated/maintained stylesheet. Generated and
vendor-adjacent material are reported separately.

| Measure | Exact-main baseline `03dfdd8` | Prepared candidate |
| --- | ---: | ---: |
| Tracked files | 349 | 357 |
| Maintained product files / LOC | 125 / 7,851 | 125 / 7,871 |
| Package source modules | 120 | 120 |
| Test files / LOC | 109 / 20,666 | 109 / 20,706 |
| Tooling/config files / LOC | 71 / 10,699 | 71 / 10,698 |
| Public-document files / LOC | 20 / 1,863 | 28 / 2,384 |
| Generated text LOC | 3,647 | 3,647 |
| Vendor-adjacent patch LOC / visual baselines | 43 / 4 | 43 / 4 |
| Maintained source directories | 33 | 33 |
| Public manifest entrypoints | 55 coordinated + 6 config | unchanged |
| Direct exported types / interfaces | 98 / 52 interfaces | unchanged |
| Async candidates | 133 sites in 26 modules | unchanged |
| Classes | 1 (`AdoptError`) | unchanged |
| Workspace dependency edges | 7 total / 5 runtime-or-dogfood | unchanged |
| Forwarding `index.ts` modules | 21 | 21 |
| Raw architecture-branch churn | — | +650 / -70 = +580 net |

Categorized net change is product `+20`, tests `+40`, tooling `-1`, public documentation `+521`,
generated `0`, and vendor `0`, totaling `+580` maintained lines.

| Timed gate | Baseline | Prepared candidate |
| --- | ---: | ---: |
| Token generation/check | 0.02 s | 0.01 s |
| API authority check | 19.67 s | 16.97 s |
| Cache-bypassed full check | 31.33 s | 24.39 s |
| Cache-bypassed production build | 10.47 s | 7.55 s |
| Direct Gallery build | 10.39 s | 7.08 s |
| Cache-bypassed 756-test matrix | 75.32 s | 62.46-68.93 s |

Browser discovery previously built Gallery before listing 16 cases: 9.94 seconds and 1,273,932
KiB peak RSS. Direct Playwright list mode reports the same matrix in 0.43 seconds and 184,152 KiB.
The isolated repeated build is the attributable full-matrix improvement.

The style benchmark uses 400 16-KiB files and 30 patterns, with five timed samples after one
warm-up. Median time moved from 119.35 ms to 60.83 ms. The implementation preserves configured
pattern/file result order and caller-owned RegExp state while reading each file once.

The README and gate-engine bytes require coordinated `v0.13.3`.
