---
"@yesid/ui": minor
---

`@yesid/ui/layout` adds `SiteHeader`, the floating pill header with the full-screen metro-line menu: wordmark, `links` (with `priority` 2 and 3 folding them away below 500px and 1024px of header width), an optional `search` snippet from 1024px, an `actions` snippet, and the theme, language and menu controls. It takes `beforeNavigate`, `onNavigate` and `afterNavigate` from `$app/navigation` as its `navigation` prop. `--site-header-inset-end` makes room for a docked side panel. `@yesid/ui/brand` adds `Wordmark`, `LanguageToggle` (the signpost; the app supplies each locale's `href`, and `preserveState` keeps scroll then resets focus) and `resetFocusAfterNavigation`. `@yesid/ui/base.css` now defines the header geometry (`--nav-top` through `--nav-clearance`); `--chrome-offset` stays app-owned. To migrate, replace the app's nav, menu overlay, language switch and wordmark with these and delete the app's copies of the `--nav-*` variables.
