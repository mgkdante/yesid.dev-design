---
"@yesid/motion": minor
"@yesid/seo-kit": minor
"@yesid/tokens": minor
"@yesid/ui": minor
---

`StateNotice` with a `role` is named by its title. `QuietModeButton` paints the remembered labels before hydration instead of flipping them when the app starts. A view transition that a reload cuts short no longer logs `AbortError: Transition was skipped`: `viewTransition` and the head boot script catch its `ready` promise, and `boot.json` carries the new hash. `@yesid/ui/blueprints` exports `BlueprintProps`, the props every drawing takes. `.circuit-grid` and `ArticleHeader`'s grid anchor their lines to the top-left corner, so the grid no longer slides when the page grows.

Removed without a deprecation period under the owner's 2026-10-29 waiver of both DEPRECATION.md gates; neither app nor the Gallery imports any of them. `@yesid/motion` loses `./utils/sectionMagnet` and its root re-exports (`initSectionMagnet`, `findSettleTarget`, `DESKTOP_TIER`, `TOUCH_TIER`, `MagnetTier`, `SectionMagnetOpts`, `SettleTargetOpts`). `@yesid/tokens` loses `./serialize`, `./types`, `./generators/tokens-css`, `./generators/theme-css`, `./generators/motion-ts` and the legacy `./src/parse.ts`, `./src/generators/tokens-css.ts` and `./src/generators/motion-ts.ts` aliases. `@yesid/seo-kit` loses the `./satori` subpath; `renderSatoriPng` stays in the root export. `@yesid/ui/brand` stops exporting `flattenToc`, `landTocFragments` and `resolveTocCounter`, and `@yesid/ui/state` stops exporting `DESKTOP_MIN_WIDTH`. To migrate, there is nothing to change unless you imported one of these; `DetailFrame`'s `toc.landFragments` replaces a direct `landTocFragments()` call.
