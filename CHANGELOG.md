# Changelog

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
