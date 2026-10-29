# Build a yesid product from a release

Use this checklist in the new product:

- [ ] Start from Bun, SvelteKit, Svelte 5, and Tailwind CSS v4.
- [ ] Pick one exact `yesid.dev-design` release tag.
- [ ] Add the package tarball URLs for that tag to `package.json` and run `bun install`.
- [ ] Load the package token styles and bundled fonts.
- [ ] Import one shared UI initializer from both SvelteKit client and server init hooks.
- [ ] Apply the motion tiers and expose reduced-motion state where the product needs it.
- [ ] Add one consumer-owned gate policy module and its contract test to Vitest and CI.
- [ ] Start analytics in the root layout and set `PUBLIC_PLAUSIBLE_DOMAIN` in production.
- [ ] Run the app tests, typecheck, and production build.

## 1. Prerequisites

Use:

- Bun 1.3 or newer;
- SvelteKit with Svelte 5;
- Tailwind CSS v4 through `@tailwindcss/vite`.

Create the SvelteKit app first. Confirm its normal test, check, and build commands pass before adding the design packages.

## 2. Install one exact release

Pick the newest release you have reviewed on the [releases page](https://github.com/mgkdante/yesid.dev-design/releases).
Each release carries one tarball per package. Add the packages with the same tag in every URL:

```json
{
  "dependencies": {
    "@yesid/analytics": "https://github.com/mgkdante/yesid.dev-design/releases/download/vX.Y.Z/yesid-analytics-X.Y.Z.tgz",
    "@yesid/i18n-core": "https://github.com/mgkdante/yesid.dev-design/releases/download/vX.Y.Z/yesid-i18n-core-X.Y.Z.tgz",
    "@yesid/motion": "https://github.com/mgkdante/yesid.dev-design/releases/download/vX.Y.Z/yesid-motion-X.Y.Z.tgz",
    "@yesid/seo-kit": "https://github.com/mgkdante/yesid.dev-design/releases/download/vX.Y.Z/yesid-seo-kit-X.Y.Z.tgz",
    "@yesid/tokens": "https://github.com/mgkdante/yesid.dev-design/releases/download/vX.Y.Z/yesid-tokens-X.Y.Z.tgz",
    "@yesid/ui": "https://github.com/mgkdante/yesid.dev-design/releases/download/vX.Y.Z/yesid-ui-X.Y.Z.tgz"
  },
  "devDependencies": {
    "@yesid/config": "https://github.com/mgkdante/yesid.dev-design/releases/download/vX.Y.Z/yesid-config-X.Y.Z.tgz",
    "@yesid/gates": "https://github.com/mgkdante/yesid.dev-design/releases/download/vX.Y.Z/yesid-gates-X.Y.Z.tgz"
  }
}
```

Run `bun install`. The lockfile records each tarball's integrity, so CI installs exactly the bytes
the release published. `@yesid/ui` and `@yesid/seo-kit` take `@yesid/tokens`, `@yesid/motion` and
`@yesid/seo-kit` as peer dependencies pinned to the same release: list all of them, even one the
product never imports, so the app holds a single copy. The packages ship TypeScript and Svelte
source that Vite compiles (see `ssr.noExternal` in section 4).
`gh attestation verify <tarball> --repo mgkdante/yesid.dev-design` proves a tarball came from the
release workflow.

## 3. Load the tokens and fonts

Import the styles in this order in the app stylesheet. `@yesid/ui/base.css` brings `@yesid/tokens/theme.css`: the Tailwind theme and semantic color utilities.

```css
@import '@yesid/tokens/tokens.css';
@import 'tailwindcss';
@import '@yesid/ui/base.css';
@source '../node_modules/@yesid/ui/src';
```

Adjust the `@source` path to where the app's `node_modules` sits relative to the stylesheet.

Import `@yesid/tokens/fonts.css` from the root layout. Preload only the latin faces in `hooks.server.ts`:

```ts
import { preloadFont } from '@yesid/tokens/fonts';

resolve(event, { preload: ({ type, path }) => type !== 'font' || preloadFont(path) });
```

Dense products opt into the compact type scale with `data-density="compact"` on `<html>`.

To use `@custom-media` breakpoints (`--tablet-min`, `--tablet-max`, `--desktop-min`, `--desktop-max`) inside Svelte styles, add `@csstools/postcss-global-data` and `postcss-custom-media` to `css.postcss.plugins` in `vite.config`, pointing global-data at `fileURLToPath(import.meta.resolve('@yesid/tokens/tokens.css'))`.

Product token overrides live in the product stylesheet after these imports. The product never pastes or regenerates the theme.

## 4. Configure UI once per module graph at boot

Call `configureUi` before the first `@yesid/ui` component renders. Add only
product-owned Tailwind vocabulary. Base yesid text and color names already work
without configuration.

Create one shared initializer, for example `src/lib/ui-initialization.ts`:

```ts
import { configureUi, type ConfigureUiResult } from '@yesid/ui/cn';

export function initializeUi(): ConfigureUiResult {
  return configureUi({
    vocab: {
      text: ['console-label'],
      colors: ['metric-healthy', 'metric-warning'],
    },
  });
}
```

Import that same initializer from both SvelteKit boot hooks. In
`src/hooks.client.ts`:

```ts
import type { ClientInit } from '@sveltejs/kit';
import { initializeUi } from '$lib/ui-initialization';

export const init: ClientInit = () => {
  initializeUi();
};
```

In `src/hooks.server.ts`:

```ts
import type { ServerInit } from '@sveltejs/kit';
import { initializeUi } from '$lib/ui-initialization';

export const init: ServerInit = () => {
  initializeUi();
};
```

Do not put `configureUi` in a root layout instance script. The client and server
hooks are the explicit initialization boundaries. They import one initializer
source, while the client bundle and every SSR worker still load independent ESM
module graphs and initialize their own package state. Separately bundled copies
of `@yesid/ui` also have independent state. HMR can recreate a graph, at which
point its boot hook initializes the recreated state.

Within one loaded module graph, the first explicit call in an unlocked graph
returns `'initialized'`. Repeating the same semantic configuration returns
`'unchanged'`: omitted and empty fields are equivalent, and duplicate or
reordered vocabulary entries do not change the meaning. A conflicting call
throws without replacing the first configuration. There is no reset API.

If `cn` runs first, directly or during a primitive render, it locks the
zero-configuration default. A later empty call returns `'unchanged'`, while a
later custom call throws. Keep the initializer ahead of all UI use when the
product has custom vocabulary.

This configuration is fixed application vocabulary. Never derive it from a
request, tenant, user, locale, or other runtime-scoped value. Provider/context
configuration is deferred and is not part of the current public API.
`ConfigureUiResult = 'initialized' | 'unchanged'` is observable public API, not
an internal diagnostic.

### Boot the theme and write the head

Put `%yesid.themeBoot%` in `src/app.html` before `%sveltekit.head%`, and swap it
in the server hook so the stored theme and section states paint first:

```ts
import { injectThemeBoot } from '@yesid/ui/head';

export const handle: Handle = ({ event, resolve }) =>
  resolve(event, { transformPageChunk: ({ html }) => injectThemeBoot(html) });
```

Use SvelteKit's `kit.csp` in hash mode and add the boot script's hash from `@yesid/ui/boot.json`
to `script-src`; the product owns the rest of its directive list:

```js
import boot from '@yesid/ui/boot.json' with { type: 'json' };

const csp = {
  mode: 'hash',
  directives: {
    'script-src': ['self', boot.hash],
    'connect-src': ['self', 'https://plausible.io'],
  },
};
```
List `@yesid/tokens` and `@yesid/seo-kit` in Vite's `ssr.noExternal`: they ship
TypeScript, and the Svelte plugin otherwise externalizes `@yesid/ui`'s
dependencies in dev and tests, where Node can't load them.
Render `SeoHead` from `@yesid/ui/head` once in the root layout with the page's
resolved title, description, canonical and alternates. The share card, favicon
mark, robots and security headers come from `@yesid/seo-kit`.

## 5. Apply the motion policy

Read `node_modules/@yesid/motion/src/policy.ts` before adding an animation. Use `shouldAnimate('motion-gated')` for scroll scrubs, parallax, pointer translation, large scale changes, rotation, ambient loops, and smooth scrolling. Small feedback in the `safe-always` tier can still run under reduced motion.

```ts
import { shouldAnimate } from '@yesid/motion/policy';

if (shouldAnimate('motion-gated')) {
  startAmbientSequence();
}
```

Use the store when the component must render reduced-motion state:

```svelte
<script lang="ts">
  import { prefersReducedMotion } from '@yesid/motion/stores/reducedMotion';
</script>

{#if $prefersReducedMotion}
  <p>Motion reduced</p>
{/if}
```

Opt in to the Layer 1 `.tap-press` and `.tap-feedback` utilities directly:

```css
@import '@yesid/motion/tap-feedback.css';
```

The stylesheet remains copyable from `@yesid/motion/tap-feedback.css` when the product must control Tailwind layer order or adapt the utilities for Tailwind v3/plain CSS. The motion package does not import application CSS automatically.

## 6. Wire the brand gates into Vitest and CI

Keep product policy in the product. Copy its real brand hexes, forbidden
patterns, contrast pairs, and identities into `src/gates/policy.ts`; do not
invent replacements or copy another app's table. Add a contract test there so
policy changes are deliberate.

Create `src/brand-gates.test.ts`:

```ts
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import tokens from '@yesid/tokens/tokens.json' with { type: 'json' };
import {
  brandHexViolations,
  runContrastPairs,
  runIdentities,
  styleRegressionViolations,
} from '@yesid/gates';
import {
  PRODUCT_AA_PAIRS,
  PRODUCT_BRAND_HEXES,
  PRODUCT_FORBIDDEN,
  PRODUCT_IDENTITIES,
} from './gates/policy.js';
import { describe, expect, it } from 'vitest';

const srcRoot = fileURLToPath(new URL('.', import.meta.url));
const generated = new Set([
  join(srcRoot, 'app.css'),
  join(srcRoot, 'gates/policy.ts'),
]);

describe('brand gates', () => {
  it('uses tokens instead of raw brand hex values', () => {
    const result = brandHexViolations({
      root: srcRoot,
      hexes: PRODUCT_BRAND_HEXES,
      allowlist: generated,
    });
    expect(result.fileCount).toBeGreaterThan(0);
    expect(result.violations).toEqual([]);
  });

  it('avoids forbidden style patterns', () => {
    const failures = styleRegressionViolations({
      root: srcRoot,
      forbidden: PRODUCT_FORBIDDEN,
    }).filter(({ hits }) => hits.length > 0);
    expect(failures).toEqual([]);
  });

  it('keeps the product contrast pairs and identities', () => {
    expect(runContrastPairs(tokens, PRODUCT_AA_PAIRS).filter(({ pass }) => !pass)).toEqual([]);
    expect(runIdentities(tokens, PRODUCT_IDENTITIES).filter(({ pass }) => !pass)).toEqual([]);
  });
});
```

`@yesid/gates` exports engines and neutral defaults from its root only. A
consumer with additional semantic color tokens, such as a product-specific
accent, must pass its full `brandTokens` list to `colorMixViolations` instead
of relying on the neutral default.

Run these commands in CI:

```sh
bun x vitest run
bun run check
bun run build
```

## 7. Keep localization authority and copy in the product

`@yesid/i18n-core` does not discover product locale authority or ship product copy. Consumers inject their concrete locale values, routing policy, framework adapters, and runtime flag values. Bind the locale plumbing once in the product's i18n module: `createLocaleRouting`, `createIntl` with the product's Intl tags, `createCopy` for typed copy dictionaries, and `createLocaleContext` from `@yesid/ui/state`, provided from the root layout, which also passes `lang` to `SiteRoot`. Format through `intl` rather than `toLocaleString` or a new `Intl.*` at the call site. Other packages continue to receive translated labels, placeholders, clear labels, empty states, option labels, and `StopLabel` prefixes from the product. See the [Combobox contract](../packages/ui/README.md#combobox) and the [localized StopLabel prefix](../packages/ui/README.md#stoplabel). The same durable package guide ships at `node_modules/@yesid/ui/README.md`.

Do not add product-specific locale checks, copy policy, or framework virtual-module imports to a package. If a third product needs a new copy seam, add a generic prop upstream with a default that preserves current consumers.

## 8. Measure

`@yesid/analytics` stays off until the product starts it. Start it once in the root layout:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { env } from '$env/dynamic/public';
  import { createAnalytics, defineAnalyticsPreset } from '@yesid/analytics';

  const preset = defineAnalyticsPreset({ events: [] });
  onMount(() => {
    createAnalytics(preset, { domain: env.PUBLIC_PLAUSIBLE_DOMAIN ?? '' });
  });
</script>
```

Set `PUBLIC_PLAUSIBLE_DOMAIN` to the production host (for example `example.com`) in the production
environment only; unset means off. The client sends nothing without a domain or when the page is
served from another host, so local, preview and fork deployments stay silent. Add
`https://plausible.io` to `connect-src` (see the CSP in section 4).

## 9. Bump the brand pin deliberately

A brand change follows one direction:

1. Edit `packages/tokens/tokens.json` in `yesid.dev-design`.
2. Regenerate and verify the upstream outputs.
3. Follow [`RELEASING.md`](../RELEASING.md) to publish the next release.
4. In the product, change the tag and version in every `@yesid` URL, run `bun install`, and review
   the lockfile diff and product overrides together.
5. Run the tests, typecheck, gates, and the production build.

Never use `^`, `~`, a branch, or a floating tag, and never
patch files under `node_modules/@yesid`. Upstream the change, release it, and let each consumer
choose when to take the bump.

## 10. Roll back

A rollback is the same edit pointing every `@yesid` URL at an earlier release this product already
accepted, in its own pull request, followed by the full product checks. If that release has a
different package set, add or remove the matching entries. Never move or replace an upstream tag.
