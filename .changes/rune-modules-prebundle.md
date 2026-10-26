---
"@yesid/ui": patch
"@yesid/analytics": patch
---

Fix consumer Vite dev servers. vite-plugin-svelte pre-bundles vendored `.svelte.ts` modules without stripping TypeScript, so the `@yesid/ui/state` stores failed with `Unexpected token` under `vite dev`. Production builds were unaffected. The two rune modules now ship as `.svelte.js` with `.d.ts` declarations beside them, and `@yesid/analytics/consent`, which uses no runes, moves to a plain `consent.ts`. Public subpaths and types are unchanged.
