# Changelog

## 0.25.3

<!-- release-fragment: p4-manifesto-strength -->
- `@yesid/ui` (patch): Quiet Manifesto circuit backgrounds uniformly through one shared strength default, including static nodes, pointer traces, warm glow and ripple ink. Preserve foreground and listing blueprint ink.

## 0.25.2

<!-- release-fragment: p3-header-copy-contrast -->
- `@yesid/ui` (patch): Protect listing-header glyphs with a solid page-colour shadow beneath their existing soft halo, preserving blueprint ink and header layout.

## 0.25.1

<!-- release-fragment: p3-listing-headers -->
- `@yesid/ui` (patch): `ListingFrame` draws every header drawing at one ink, `--blueprint-ink` on the art slot (0.32 dark, 0.5 light, a step bolder than before). It overrides the opacity `BlueprintShell` and inline styles give the drawings, so apps can delete their own listing-header opacities; an app rule that also forces opacity with `!important` must go. The header copy gets a halo in the page colour, and rests on the bottom of the band at every width; from 1024px without an `aside` it used to sit at the top.

## 0.25.0

<!-- release-fragment: p1-polish-review -->
- `@yesid/tokens` (patch), `@yesid/ui` (patch): `SiteHeader`'s menu line now runs from each item's icon to the next one, short viewports included. The token doctrine names conversion buttons as the only clickable yellow surface and underlined text links as yellow's second interaction.

<!-- release-fragment: p1-polish -->
- `@yesid/tokens` (patch), `@yesid/motion` (patch), `@yesid/ui` (minor), `@yesid/i18n-core` (patch): Polish from the owner's review of both sites. `SiteHeader` menu items take an optional `icon` (a Lucide icon component) that replaces the stop and lights up on the current page, and the menu footer now defaults to "Navigation · All routes" in the language's locale (en, fr, es); `labels.menuFooter` still replaces it, and an empty string hides it (before, an omitted label hid the footer). `@yesid/ui/base.css` makes every link without a class a text link: underlined, in `--accent-text` (yellow in dark, amber in light), with a thicker underline on hover; component links keep their own styles. `ArticleHeader` centers the back link between the chrome and the next line, drops its fixed minimum height and sizes the title with `--text-title` (smaller at every width, and density-aware); apps whose `--chrome-offset` leaves a gap under their chrome set `--chrome-gap`. `SurfaceRail`'s phone sheet now opens centred instead of sliding in from the right. `@yesid/i18n-core`'s `localizeHref` keeps a query or hash while switching the locale (`/fr?provider=stm` now localizes to `/?provider=stm`) and decides path exemptions without them. `@yesid/motion`'s `blueprintScrub` redraws when its trigger resizes, so content rendered after mount no longer leaves a stale first draw. The token doctrine now names underlined text links as a yellow (`accent-text`) job. To migrate, delete local text-link styles and the classes that only styled links, move any typography those rules set onto the surrounding element, pass `icon` per menu item, and drop a menu-footer label that repeats the default.

## 0.24.0

<!-- release-fragment: ds7-brand-surfaces -->
- `@yesid/tokens` (minor), `@yesid/motion` (minor), `@yesid/ui` (minor): The brand surfaces move into the packages. `@yesid/ui/brand` adds `TerminalPanel`, the terminal window (signal-head title bar with `title`, `tag`, `status` and an `actions` snippet, a hazard rule, the body and an optional `footer` readout), `CodeBlock`, which shows source in a `TerminalPanel` with the language as its tag and an optional copy button and takes the app's highlighted `<pre>` as `children`, and `ManifestoCanvas`, the circuit-node backdrop of brand headers (static under reduced motion). `ArticleHeader` now renders a `ManifestoCanvas` by default; its `canvas` snippet replaces it, and an empty snippet leaves the header plain. `@yesid/ui/base.css` styles the terminal and code-block classes (`.terminal-*`, in the components layer), so markup rendered on the server can wear the same chrome. `@yesid/ui/blueprints` (new) exports 40 blueprint drawings in `currentColor`, such as `BlueprintBridge` and `BlueprintSignal`; `BlueprintBusSide` takes the fleet's `operator`. `.led-pulse` now stops under reduced motion, as documented. `@yesid/tokens` adds the `syntax` group (`--syntax-keyword`, `-string`, `-number`, `-function`, `-comment`, `-punctuation`, `-plain`), aliases of the brand voices for code highlighting. `@yesid/motion/utils/blueprintScrub` (new) exports `blueprintScrub(band, trigger = band)`, which draws a header's blueprint art as `trigger` scrolls through the viewport; it fits `ListingFrame`'s `onHeaderMount`. To migrate, delete local manifesto canvases and the `canvas` snippets that pass them, local terminal panels and their CSS, code blocks, blueprint scrubs and drawings, import these instead, and color highlighters through `--syntax-*`.

  Removed, with the owner's waiver of the 90-day wait (the intervening-minor requirement is met for every removed contract, and neither consumer uses them): `@yesid/tokens/generators/theme-block` and its legacy `./src/generators/theme-block.ts` alias (`generateThemeBlock`, `replaceThemeRegion`; deprecated in v0.18.0, use `@yesid/tokens/theme.css` or `generateThemeCss`), `MetroStation`'s `roundel` snippet (deprecated in v0.19.0; the default roundel is the one every product uses), and `QuietModeInit` with its `storageKey` plus `SiteRootProps.quietModeKey` (deprecated in v0.22.0; quiet mode always uses the standard `quiet-mode` key, the one the boot script reads). To migrate, delete any use of them.

## 0.23.0

<!-- release-fragment: ds6-foundation-primitives -->
- `@yesid/ui` (minor), `@yesid/analytics` (minor): `@yesid/ui` adds the parts of a data page. `@yesid/ui/feedback` (new) exports `StateNotice`, a quiet empty, error or status notice in five presentations and four tones, and `AnalyticsConsent`, the consent rail for an `@yesid/analytics/consent` store with the product's copy, controls and privacy link. `@yesid/ui/table` (new) exports `DataTable`, a captioned table from column definitions that stacks into label and value pairs or scrolls sideways on narrow screens; a scrolling table that overflows becomes a focusable region named by its caption. `@yesid/ui/layout` adds `Surface`, `Masthead`, `Breadcrumb` (a named trail with the current page last), `ControlsRail`, `DashboardGrid` and `SurfaceRail` (a sticky rail from 1024px, a pill and bottom sheet below). `@yesid/ui/brand` adds `CornerMeta`, `SegmentedChoice` (a single choice with radio-group keyboard behavior) and `ToggleChip` (a controlled `aria-pressed` pill). `@yesid/ui` now depends on `@yesid/analytics`. `@yesid/analytics/vitals` (new) holds the web-vitals beacon schema and `startVitals({ endpoint, load })`, which collects Core Web Vitals once per page and sends one beacon when the page is hidden; `load` supplies the `web-vitals` module. To migrate, delete local copies of these parts and import them from the packages; static pills use `Badge variant="tag"`.

## 0.22.0

<!-- release-fragment: ds5-i18n-and-format -->
- `@yesid/ui` (minor), `@yesid/i18n-core` (minor): `@yesid/i18n-core` adds `createIntl`, which binds each app locale to an Intl tag and returns cached `number`, `dateTime`, `collator` and `plural` Intl objects plus `relativeTime` (a signed offset in seconds read in its largest whole unit, with Intl's own "now" under 5 seconds), and `createCopy`, which returns a `defineCopy` that type-checks every locale against a source locale's keys and signatures. `@yesid/ui/state` adds `clock`, a shared wall clock (1 s tick while subscribed, 30 s under reduced motion, paused in hidden tabs) with a server-time anchor, and `createLocaleContext`. `SiteRoot` takes `lang` and keeps `<html lang>` current after client navigation. A remembered quiet mode now paints right on reload: the head boot script closes every section that follows quiet mode (marked `data-quiet`) before first paint, and `SiteRoot` restores quiet mode before its children render, so they hydrate closed. `@yesid/ui/boot.json`'s hash changes. Importing `@yesid/ui/state` no longer throws where there is no `window` (a node test that loads Svelte's client build); `desktop.current` reads false there. Deprecated: `QuietModeInit.storageKey` and `SiteRootProps.quietModeKey`, because the boot script only reads the standard `quiet-mode` key; a custom key keeps working, but what the boot script paints can disagree with it until hydration. They stay through v0.23.0: removal is no earlier than v0.24.0 and 90 days after this release is published. To migrate, delete local formatter caches, relative-time tables, locale-context code, `<html lang>` effects and clock stores, bind `createIntl`, `createCopy` and `createLocaleContext` once per app, pass `lang` to `SiteRoot`, drop any `quietModeKey`, and take the new `boot.json` hash into a hash-based CSP.

## 0.21.0

<!-- release-fragment: ds4-head-seo-assets -->
- `@yesid/seo-kit` (minor), `@yesid/ui` (minor): `@yesid/ui/head` adds `SeoHead`, which writes a page's title, description, canonical and hreflang, Open Graph, Twitter, robots and one `@graph` JSON-LD script from resolved values, and `injectThemeBoot`, which swaps `%yesid.themeBoot%` in `app.html` for the pre-paint script. That script sets the stored theme and, as the parser adds them, the stored open or closed state of persisted collapsibles, so a reload no longer paints a closed section open. `@yesid/ui/boot.json` carries the script's CSP hash. `CollapsibleSection`, `FilterGroup` and `ListingFrame` mark their state with `data-persisted-key` and `data-persisted-body`; `ChevronToggle` and `FilterGroup` style from `data-state` instead of the `chevron-open` and `filter-open` classes. The theme store also repaints `link[rel="icon"]` with the brand mark in `--primary`. `@yesid/seo-kit` adds `serializeJsonLd`, `robotsTxt`, the share card (`./og` with `renderOgPng` and the token palette, `./og/fonts` for Vite and `./og/files` for Bun scripts, with Inter and JetBrains Mono TTFs), `./icons` (`brandMarkSvg`, `touchIconSvg`) and `./headers` (`SECURITY_HEADERS`, `contentSecurityPolicy`). To migrate, replace the app's SeoHead, OG template and fonts, favicon builder and app.html theme script with these, and change any test that reads `chevron-open` or `filter-open` to read `data-state` or `aria-expanded`.

## 0.20.0

<!-- release-fragment: ds3-site-header -->
- `@yesid/ui` (minor): `@yesid/ui/layout` adds `SiteHeader`, the floating pill header with the full-screen metro-line menu: wordmark, `links` (with `priority` 2 and 3 folding them away below 500px and 1024px of header width), an optional `search` snippet from 1024px, an `actions` snippet, and the theme, language and menu controls. It takes `beforeNavigate`, `onNavigate` and `afterNavigate` from `$app/navigation` as its `navigation` prop. `--site-header-inset-end` makes room for a docked side panel. `@yesid/ui/brand` adds `Wordmark`, `LanguageToggle` (the signpost; the app supplies each locale's `href`, and `preserveState` keeps scroll then resets focus) and `resetFocusAfterNavigation`. `@yesid/ui/base.css` now defines the header geometry (`--nav-top` through `--nav-clearance`); `--chrome-offset` stays app-owned. To migrate, replace the app's nav, menu overlay, language switch and wordmark with these and delete the app's copies of the `--nav-*` variables.

  `ArticleHeader` is about 25% shorter again at the owner's request: tighter padding and gaps around the same title, meta and controls (minimum height 240px from 1024px wide, 220px below).

## 0.19.1

<!-- release-fragment: toc-landing-line -->
- `@yesid/ui` (patch): TOC jumps land on the active-section line. `navigateToc` and `revealTocTarget` (with the default `block: 'start'`) now place the target a quarter down the viewport instead of flush under the site chrome, and `observeActiveToc` reads that same line, so after a jump the pill counter and the highlighted entry name the section the reader picked. App scroll margins no longer affect TOC jumps. No API changes.

## 0.19.0

<!-- release-fragment: ds2-adoption-sweep -->
- `@yesid/motion` (minor), `@yesid/ui` (minor): The package defaults take the settled looks, so consumers can delete their adapters. `Card` has a lit top bevel and adds `shadow-section` on hover. `Button` adds the `conversion` variant (yellow signage CTA with an amber lift at cta sizes) and the 44px `icon-tap` size, uses `text-sm`/`text-xs`, and keeps a caller's `data-slot`. The resizable handle is neutral, the hazard `Separator` is full width by default, `StickyPanel` is `surface-3` with no shadow and chains wheel scrolling through `scrollChain`, `TerminalCursor` is `accent` in dark, and the `MetroStation` default roundel matches the signage Badge, so its `roundel` snippet is deprecated: omit it to get the default. It keeps working, and the earliest removal is the later of 90 days after the v0.19.0 publish date and v0.21.0. `ArticleHeader`'s subtitle now uses the meta row's mono type, and both use the larger `--article-meta-size`. `@yesid/ui/base.css` adds the View Transitions route crossfade, off under reduced motion. `@yesid/motion/utils/gsap` adds `loadDrawSVG`, `loadMorphSVG` and `loadCustomEase`; `@yesid/motion/utils/viewTransition` exports `viewTransition` for `onNavigate`. To migrate, delete local Card, Button, resizable handle, StickyPanel, TerminalCursor, MetroStation and hazard-separator adapters, local GSAP loaders and route fades, and call `onNavigate(viewTransition)` from the root layout.

## 0.18.0

<!-- release-fragment: tokens-one-source -->
- `@yesid/tokens` (minor), `@yesid/ui` (minor): Make the tokens the one source for the Tailwind theme, fonts and density. `@yesid/tokens` adds `theme.css` (the Tailwind `@theme` map plus the semantic color utilities, from the new `@yesid/tokens/generators/theme-css` `generateThemeCss`), `fonts.css` with bundled Inter and JetBrains Mono latin and latin-ext files (OFL), `preloadFont` from `@yesid/tokens/fonts`, new tracking, measure, glass blur, `size.tap-min` and `z.footer` tokens, and a `density.compact` group that `tokens.css` emits as a `[data-density="compact"]` block. `@yesid/ui/base.css` now imports `@yesid/tokens/theme.css`, adds `.glass-chrome`, and `.label-section` reads `--tracking-eyebrow`. To migrate, delete the pasted TOKENS region, any `@theme inline` color map and duplicate `--font-*` variables from the app stylesheet, import `@yesid/tokens/fonts.css` from the root layout, preload with `preload: ({ type, path }) => type !== 'font' || preloadFont(path)` in SvelteKit's `resolve`, and have dense apps such as Transit set `data-density="compact"` on `<html>`. Deprecated in v0.18.0: `generateThemeBlock` and `replaceThemeRegion` from `@yesid/tokens/generators/theme-block` (and the legacy `./src/generators/theme-block.ts` alias); the replacement is `@yesid/tokens/theme.css` or `generateThemeCss`. They keep working, and the earliest removal is the later of 90 days after the v0.18.0 publish date and v0.20.0, since v0.19.0 is the intervening minor.

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
