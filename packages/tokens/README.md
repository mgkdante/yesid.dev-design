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

For ordinary reading, use these explicit roles. They retain their size inside compact-density
subtrees. Existing `text-body`, `text-small`, `text-mono` and `text-caption` also serve controls,
data and labels, so they keep their existing values. Display, hero and impact roles are separate.

| Reading role | Tailwind size classes | Line height |
| --- | --- | --- |
| Prose | `text-reading lg:text-reading-desktop` (19/20px) | `leading-[1.7]` |
| Block code or terminal prose | `font-mono text-reading-code lg:text-reading-code-desktop` (16/17px) | `leading-[1.6]` |
| Inline code | `font-mono text-reading-inline-code` (0.95em) | inherit |
| Figure caption | `text-reading-caption` (16px) | `leading-[1.6]` |
| Supporting prose | `text-reading-support` (18px) | `leading-[1.7]` |
| Section heading | `text-reading-heading lg:text-reading-heading-desktop` (20/22px) | preserve heading hierarchy |

`lg` means 1024px in the default Tailwind theme, matching `--desktop-min`. Products with custom
breakpoints must use that threshold explicitly. Adopting the package does not remap existing
copy: apply the reading roles to prose and code in the consumer, keeping compact UI classes.

| Export | Contents |
| --- | --- |
| `./tokens.json` | the token source |
| `./tokens.css` | the tokens as CSS custom properties, plus the breakpoints |
| `./theme.css` | the Tailwind `@theme` map and semantic color utilities |
| `./fonts.css`, `./fonts` | the font faces and `preloadFont` |
| `./parse`, `./generators/design-md` | token parsing and the `DESIGN.md` generator |

The exact interface is in
[`api-reports/tokens.api.md`](https://github.com/mgkdante/yesid.dev-design/blob/v0.30.3/api-reports/tokens.api.md).

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
