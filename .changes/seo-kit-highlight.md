---
"@yesid/seo-kit": minor
"@yesid/ui": minor
---

`@yesid/seo-kit/highlight` adds `highlight(code, lang)`, server-side Shiki highlighting with the JavaScript regex engine. It resolves to token markup for a `<code>` element in `syn-*` classes, with no inline styles, and returns unknown languages escaped. `shiki` 4.x is a new optional peer dependency, needed only for this subpath. `@yesid/ui/base.css` colors the `syn-*` classes through the `--syntax-*` tokens. `CodeBlock`'s copy labels take an optional `copied`, and a polite status now announces `copied` or `failed` after a copy; the visible ✓ and failure label are unchanged.
