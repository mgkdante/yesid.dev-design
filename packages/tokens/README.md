# @yesid/tokens

The design-token source for yesid products. `tokens.json` (DTCG format) holds every color, type,
spacing, radius, shadow and motion value. The package ships the stylesheets generated from it and
the bundled Inter and JetBrains Mono fonts.

## Use

Import order in the app stylesheet: `@yesid/tokens/tokens.css`, then `tailwindcss`, then
`@yesid/ui/base.css`, which brings `theme.css`. Import `@yesid/tokens/fonts.css` from the root
layout and preload only the latin faces in SvelteKit:

```ts
import { preloadFont } from '@yesid/tokens/fonts';

resolve(event, { preload: ({ type, path }) => type !== 'font' || preloadFont(path) });
```

Compact density is opt-in: set `data-density="compact"` on `<html>` or on a subtree to apply the
`density.compact` overrides. `tokens.css` also declares the breakpoints as `@custom-media`; inside
Svelte styles they need postcss-global-data and postcss-custom-media in the product's build.

| Export | Contents |
| --- | --- |
| `./tokens.json` | the token source |
| `./tokens.css` | the tokens as CSS custom properties, plus the breakpoints |
| `./theme.css` | the Tailwind `@theme` map and semantic color utilities |
| `./fonts.css`, `./fonts` | the font faces and `preloadFont` |
| `./parse`, `./generators/design-md` | token parsing and the `DESIGN.md` generator |

The exact interface is in
[`api-reports/tokens.api.md`](https://github.com/mgkdante/yesid.dev-design/blob/v0.30.2/api-reports/tokens.api.md).

## Rules

- `tokens.json` is the only place a value is edited. Generated files are never edited by hand.
- Generators are pure: tokens in, strings out, with the same LF bytes on Linux and Windows.
- `bun run tokens:build` at the repository root writes `tokens.css`, `theme.css`,
  `packages/motion/src/tokens.ts` and `DESIGN.md`. `bun run ci:tokens` fails if any has drifted.
- No stylesheet loads on import. Products override tokens in their own stylesheet, after these
  imports.

## Develop

```sh
bun run --cwd packages/tokens test
bun run --cwd packages/tokens check
```
