---
"@yesid/ui": minor
"@yesid/motion": minor
---

Add the shared app root and its state. `@yesid/ui/layout` exports `SiteRoot`, which initializes the theme and quiet mode and owns the Lenis lifecycle. `@yesid/ui/state` exports the `theme`, `quietMode`, and `desktop` stores, `@yesid/ui/brand` adds `ThemeToggle`, and `@yesid/ui/base.css` holds the base layer both products share. `QuietModeButton` state and actions now default to the shared store, and existing controlled usage is unchanged. `@yesid/motion` exports `scrollChain` from `./actions`, and `initLenis` accepts an optional `{ wrapper, content }` element scroller. Both packages move their `happy-dom` dev dependency to `^21.0.4`. Migration: wrap the root layout in `SiteRoot`, import `@yesid/ui/base.css` after Tailwind, and delete the local theme and quiet-mode stores, `ThemeToggle`, and `scrollChain` copies.
