---
"@yesid/ui": minor
"@yesid/tokens": minor
"@yesid/config": minor
---

Accessibility moves into the packages, and both products share one page skeleton.

- `SiteHeader` opens with a skip link to `#main` ("Skip to content" in en, fr or es; `labels.skipToContent` replaces it) and renders the pill inside a `header`, the page's banner. Render `<main id="main">` after `SiteHeader` and `SiteFooter` after `main`, outside it, then delete any local skip link. The pill's `nav` now carries `labels.nav`; `data-testid="nav"` stays on the outer box.
- `LanguageToggle`'s name lists the codes the post shows, such as "Language: English (EN FR)". Tests that match the old name exactly need the codes.
- Footer links are at least `--size-tap-min` wide, `Wordmark` at least that tall, and breadcrumb links 24px tall. The `TocPill` counter uses full `--primary`. Sheets skip their open and close animations under reduced motion. `base.css` adds a focus outline under forced colors.
- The light `--primary` is `#985000` (was `#A05500`) and `--primary-hover` `#7D4000` (was `#854500`), so primary text passes AA on tinted cards too. Tests pinned to the old values need the new ones. `@yesid/tokens` now tests its semantic contrast pairs, so products can delete their copies.
- `@yesid/config/playwright`: `expectAccessible` also fails on a name that leaves out its visible text (WCAG 2.5.3). New `expectTapTargets(page, { exclude })` and `expectNoHorizontalOverflow(page, scrollers)`.
