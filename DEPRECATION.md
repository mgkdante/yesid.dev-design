# Deprecation policy

This policy applies to the public runtime, type and CSS
contracts of the eight released packages. Private Gallery code, test helpers,
and repository-only build internals are not public contracts unless a document
explicitly says otherwise.

## Lifecycle

### Experimental

An Experimental contract is labelled as such in its public documentation and
release notes. It is available for real use, but its shape is still being
validated. An incompatible experimental change waits for a minor release and
includes migration notes. A patch release does not silently reshape or remove
it.

### Stable

A public contract is Stable unless it is explicitly labelled Experimental or
Deprecated. Stable additions may ship compatibly. Incompatible changes enter
the Deprecated stage first; they do not appear without a migration path.

### Deprecated

A Deprecated contract remains functional and documented while consumers move
to its named replacement or migration. The release that starts deprecation
must include a release fragment, changelog entry, affected surface, replacement
path, and earliest eligible removal date.

Stable removal requires both of these gates:

1. at least 90 days have elapsed since the first published deprecation; and
2. the deprecated contract has remained available through at least one
   intervening minor release.

The deprecating minor does not count as the intervening minor. For example, a
contract deprecated in `v0.7.0` must still exist in `v0.8.0`; its earliest
version-eligible removal is `v0.9.0`, and only after the 90-day gate also passes.

## Compatibility rules

Patch releases never intentionally break a documented public contract. This
includes exports and export conditions, TypeScript declarations, Svelte props
and bindings, direct public assets, token names and meanings, and previously valid runtime behavior.

Fixing an implementation defect may change incorrect output, but the release
fragment must identify the corrected contract and the regression proof. If a
contract is unsafe enough that compatibility cannot be preserved, stop release
promotion, document the impact, and use an appropriately reviewed minor or
major transition. There is no hidden patch exception.

Removal evidence belongs in the pull request: the original deprecation release,
dates, intervening minor, migration documentation, API report diff, and focused
consumer or clean-room verification.

## Removals

- **v0.28.0:** removed the adoption CLI (`tools/adopt.ts` and `tools/adopt/`), its schema-2
  `manifest.json` and the `yesid.dev-design-vX.Y.Z.tar` archive: each package now ships as its own
  release tarball installed by URL. Also removed, with no consumer in either app or the Gallery:
  `@yesid/motion/utils/sectionMagnet` with its root re-exports (`initSectionMagnet`,
  `findSettleTarget`, `DESKTOP_TIER`, `TOUCH_TIER`, `MagnetTier`, `SectionMagnetOpts`,
  `SettleTargetOpts`); the `@yesid/tokens` subpaths `./serialize`, `./types`,
  `./generators/tokens-css`, `./generators/theme-css`, `./generators/motion-ts`, `./src/parse.ts`,
  `./src/generators/tokens-css.ts` and `./src/generators/motion-ts.ts`; `@yesid/seo-kit/satori`;
  `flattenToc`, `landTocFragments` and `resolveTocCounter` from `@yesid/ui` and `@yesid/ui/brand`; and
  `DESKTOP_MIN_WIDTH` from
  `@yesid/ui/state`. None was deprecated first: the owner waived both gates on 2026-10-29, as for
  v0.24.0 and v0.27.0, because there are no third-party consumers and both apps move in the same
  cycle.

- **v0.27.0:** removed `AnalyticsConsent` (with `AnalyticsConsentCopy` and `AnalyticsConsentProps`) from `@yesid/ui/feedback`; the `./consent`, `./policy` and `./plausible` subpaths of `@yesid/analytics`; `createAnalyticsClient`, `createPathnamePageviewTracker`, `AnalyticsClient` and `AnalyticsClientDependencies` from `./client` (replaced by `createAnalytics`); and `AnalyticsStorageKeys` with `AnalyticsPreset`'s `domain` and `storageKeys` from `./config`. None was deprecated first: the owner waived both gates (the 90 days and the intervening minor) on 2026-10-29 for all of them, because there are no third-party consumers and both apps drop consent in the same cycle. Measurement no longer asks, so the consent parts have no replacement.

- **v0.24.0:** removed `@yesid/tokens/generators/theme-block` and its legacy `./src/generators/theme-block.ts`
  alias (`generateThemeBlock`, `replaceThemeRegion`; deprecated in v0.18.0), `MetroStation`'s `roundel`
  snippet (v0.19.0), and `QuietModeInit.storageKey` with `SiteRootProps.quietModeKey` (v0.22.0). Each had
  passed its intervening-minor gate. The owner waived the 90-day wait on 2026-10-28; neither consumer used them.
