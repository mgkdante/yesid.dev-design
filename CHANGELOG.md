# Changelog

## 0.17.0

<!-- release-fragment: detail-footer-error-frames -->
- `@yesid/ui` (minor): Add the shared detail, footer and error frames. `@yesid/ui/layout` now exports `DetailFrame` (header, hazard rule, toolbar, left rail or a caller-owned `rail`, center, right rail, `after`, TOC tracking and `TocPill`), `ArticleHeader` (no tag pills; `highlight` accents one title keyword; `canvas`, `decorations`, `actions` and `controls` snippets; about 25% shorter; decorative text at `--article-deco-opacity`, 0.25), `SiteFooter` and `ErrorPage`, with their prop types. `@yesid/ui/brand` adds `ErrorIllustration`, whose sign text comes from `code` and `signLabel`. `@yesid/ui/base.css` now carries the semantic `@theme inline` color utilities and the small-screen metric-value size. To migrate, render `DetailFrame` and `ArticleHeader` from detail pages (pass the app's background canvas through `canvas` and its quiet-mode button through `controls`), `SiteFooter` from the root layout and `ErrorPage` from `+error.svelte`, pad full-bleed detail pages' tops by `--chrome-offset`, keep `afterNavigate(onTocNavigate)` in the app, delete the local shells, headers, footer and error illustration, and drop the color map from the app stylesheet.

## 0.16.0

<!-- release-fragment: listing-frame -->
- `@yesid/ui` (minor): Add the shared listing frame. `@yesid/ui/layout` now exports `ListingFrame`: edge title, accent rail, blueprint header, hazard rule, a filter column and the results. From 1024px its filter panel is always shown, so desktop filters work before hydration and without JavaScript. Below 1024px a toggle opens it, with the open state kept under `persisted:<filterPersistKey>`. `onHeaderMount(header, frame)` starts header motion such as a scroll scrub and returns its cleanup. The frame offsets itself by `--chrome-offset`. `@yesid/ui/brand` adds `FilterGroup`, `FilterSection`, `FilterSummary` and `SearchInput` with their prop types; they hold no product wording, so `FilterGroup` takes `allLabel`, `FilterSummary` takes `countLabel`, `locale` and `clearLabel`, and `SearchInput` takes `label`. To migrate, render `ListingFrame` from the listing page, pass the search field and filters as snippets, define `--chrome-offset` if the app names its chrome height differently, and delete the local shell, filter components and listing CSS. `FilterGroup` has no `joined-grid` variant; render a segmented control directly instead.

## 0.15.0

<!-- release-fragment: navigation-brand-atoms -->
- `@yesid/motion` (minor), `@yesid/ui` (minor): Add table-of-contents navigation and brand atoms. `@yesid/ui/brand` now exports `CollapsibleSection`, `CornerMarks`, `MetricDisplay`, `SectionHeading`, `SectionIcon`, `StatusDot`, `TocNav` and `TocPill` with their prop types, plus the toc helpers `TOC_TARGET_SELECTOR`, `flattenToc`, `landTocFragments`, `navigateToc`, `observeActiveToc`, `onTocNavigate`, `openCollapsedTocTarget`, `reconcileActiveToc`, `resolveTocCounter`, `revealTocTarget`, `settleLayout` and `tocElement`. `@yesid/ui/state` adds `persisted`, tab-scoped state whose values must be locale-free. `@yesid/motion` adds `./lenis.css`, which `@yesid/ui/base.css` now imports. `CollapsibleSection` follows quiet mode by default and stores only reader choices under `persisted:<sectionKey>`. `TocPill` defaults `onNavigate` to `navigateToc`, which jumps under reduced motion. To migrate, import from `@yesid/ui/brand` and `@yesid/ui/state`, delete the local copies, and drop any direct `lenis/dist/lenis.css` import. Drop `closeSignal`, `bulkCollapsed` and any `openSignal` fed from quiet mode: the default follows quiet mode, and `quiet={false}` opts out. Keep `openSignal` only for opens the reader triggers, and remove quiet-mode terms from combined signals, because every change counts as a reader click and is stored. Pass Transit-style absence text through `MetricDisplay`'s `absent` snippet.

## 0.14.1

<!-- release-fragment: lenis-registers-scrolltrigger -->
- `@yesid/motion` (patch): `initLenis` now registers ScrollTrigger before it reads `ScrollTrigger.isTouch`. Before, Lenis started on touch devices whenever the app had not yet called `initScrollTriggerConfig()`, which is the case when `SiteRoot` mounts before the app's own `onMount`. Apps that already call `initScrollTriggerConfig()` first are unaffected.

<!-- release-fragment: rune-modules-prebundle -->
- `@yesid/ui` (patch), `@yesid/analytics` (patch): Fix consumer Vite dev servers. vite-plugin-svelte pre-bundles vendored `.svelte.ts` modules without stripping TypeScript, so the `@yesid/ui/state` stores failed with `Unexpected token` under `vite dev`. Production builds were unaffected. The two rune modules now ship as `.svelte.js` with `.d.ts` declarations beside them, and `@yesid/analytics/consent`, which uses no runes, moves to a plain `consent.ts`. Public subpaths and types are unchanged.

## 0.14.0

<!-- release-fragment: adoption-release-safety -->
- `@yesid/tokens` (patch), `@yesid/motion` (patch), `@yesid/gates` (patch), `@yesid/seo-kit` (patch), `@yesid/ui` (patch), `@yesid/analytics` (patch), `@yesid/i18n-core` (patch): Harden adoption path validation with identity-bound, token-scoped recovery evidence, and carry the existing LICENSE, NOTICE, and TRADEMARK.md bytes through coordinated archives and installed vendor trees starting at v0.13.4 while preserving older immutable archive layouts.

<!-- release-fragment: gate-filesystem-safety -->
- `@yesid/gates` (patch): Make comment scanning linear and bounded, and make stable-tree filesystem traversal deterministic, resource-bounded, explicit about rejecting observed links, and portable across POSIX and Windows path semantics.

<!-- release-fragment: runtime-contracts -->
- `@yesid/motion` (patch), `@yesid/analytics` (patch): Bind ticker disposers to their own registration and contain analytics hostname and listener-teardown failures in the unavailable consent state.

<!-- release-fragment: site-root-foundation -->
- `@yesid/motion` (minor), `@yesid/ui` (minor): Add the shared app root and its state. `@yesid/ui/layout` exports `SiteRoot`, which initializes the theme and quiet mode and owns the Lenis lifecycle. `@yesid/ui/state` exports the `theme`, `quietMode`, and `desktop` stores, `@yesid/ui/brand` adds `ThemeToggle`, and `@yesid/ui/base.css` holds the base layer both products share. `QuietModeButton` state and actions now default to the shared store, and existing controlled usage is unchanged. `@yesid/motion` exports `scrollChain` from `./actions`, and `initLenis` accepts an optional `{ wrapper, content }` element scroller. Both packages move their `happy-dom` dev dependency to `^21.0.4`. Migration: wrap the root layout in `SiteRoot`, import `@yesid/ui/base.css` after Tailwind, and delete the local theme and quiet-mode stores, `ThemeToggle`, and `scrollChain` copies.

## 0.13.3

<!-- release-fragment: architecture-efficiency-pass-2 -->
- `@yesid/tokens` (patch), `@yesid/motion` (patch), `@yesid/gates` (patch), `@yesid/seo-kit` (patch), `@yesid/ui` (patch), `@yesid/analytics` (patch), `@yesid/i18n-core` (patch): Give every coordinated package a local ownership contract covering its interface, invariants,
  consumers, commands, failure modes, deterministic rules, and release implications. Remove
  duplicated tokens and motion narration from package manifests after those facts move to the
  nearest README. Make style-regression scans read each source file once while preserving finding
  order, diagnostics, and caller-owned RegExp state.

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
