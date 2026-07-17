# Build a yesid product in under one hour

Use this checklist in the new product:

- [ ] Start from Bun, SvelteKit, Svelte 5, and Tailwind CSS v4.
- [ ] Pick and record one exact `yesid.dev-design` tag.
- [ ] Copy `tools/adopt.ts` from that tag and vendor `tokens,motion,gates,ui`.
- [ ] Add the four vendored packages to `package.json` and run `bun install`.
- [ ] Add the thin token build script, generate `tokens.css`, and wire the `@theme` sentinel.
- [ ] Load Inter Variable and JetBrains Mono Variable.
- [ ] Call `configureUi({ vocab })` before the first UI primitive renders.
- [ ] Apply the motion tiers and expose reduced-motion state where the product needs it.
- [ ] Add the yesid gate preset to Vitest and CI.
- [ ] Run the app tests, typecheck, vendor check, token drift check, and production build.
- [ ] Commit the vendored snapshot, manifest, and generated token outputs together.

## 1. Prerequisites

Use:

- Bun 1.3 or newer;
- Git on `PATH`;
- SvelteKit with Svelte 5;
- Tailwind CSS v4 through `@tailwindcss/vite`.

Create the SvelteKit app first. Confirm its normal test, check, and build commands pass before adding the design packages.

## 2. Vendor one exact tag

Choose the newest tag you have reviewed from the [GitHub tags page](https://github.com/mgkdante/yesid.dev-design/tags). Do not resolve a floating `latest` value in CI.

```sh
export YESID_DESIGN_TAG=vX.Y.Z
mkdir -p tools
curl -fsSL "https://raw.githubusercontent.com/mgkdante/yesid.dev-design/${YESID_DESIGN_TAG}/tools/adopt.ts" \
  -o tools/adopt.ts
bun tools/adopt.ts \
  --tag "$YESID_DESIGN_TAG" \
  --packages tokens,motion,gates,ui \
  --dest vendor/design
bun tools/adopt.ts --check --dest vendor/design
```

The tool shallow-clones the public repository at that tag. It needs no GitHub token. It copies runtime source and package metadata, excludes tests and repo-only files, rewrites internal workspace links, copies the license, and writes `vendor/design/manifest.json`.

For local package development, add `--source /absolute/path/to/yesid.dev-design`. Local mode records that checkout's current commit and hashes its current package files. It does not prove that `--tag` points at the same tree.

Add the vendored packages to the product's `package.json`:

```json
{
  "dependencies": {
    "@yesid/motion": "file:./vendor/design/motion",
    "@yesid/tokens": "file:./vendor/design/tokens",
    "@yesid/ui": "file:./vendor/design/ui"
  },
  "devDependencies": {
    "@yesid/gates": "file:./vendor/design/gates"
  }
}
```

Run `bun install`. Commit `vendor/design`, including `manifest.json` and `LICENSE`. Do not add the vendor directory to `.gitignore`.

## 3. Generate the product token outputs

The token package ships the source tree and generators. It does not ship a generic `tokens.css` because each product owns its output paths and its `app.css` hand-written regions.

Create `tools/build-design-tokens.ts`:

```ts
#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTokens } from '../vendor/design/tokens/src/parse.ts';
import { generateTokensCss } from '../vendor/design/tokens/src/generators/tokens-css.ts';
import {
  generateThemeBlock,
  replaceThemeRegion,
} from '../vendor/design/tokens/src/generators/theme-block.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tokenSource = resolve(root, 'vendor/design/tokens/tokens.json');
const tokensCss = resolve(root, 'src/lib/styles/tokens.css');
const appCss = resolve(root, 'src/app.css');

function writeIfChanged(path: string, content: string): void {
  if (existsSync(path) && readFileSync(path, 'utf-8') === content) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf-8');
}

const tree = parseTokens(JSON.parse(readFileSync(tokenSource, 'utf-8')));
writeIfChanged(tokensCss, generateTokensCss(tree));
writeIfChanged(
  appCss,
  replaceThemeRegion(readFileSync(appCss, 'utf-8'), generateThemeBlock(tree)),
);
```

Add the initial ownership seams to `src/app.css`. Keep the `@theme inline` map outside the generated sentinel:

```css
@import '$lib/styles/tokens.css';
@import 'tailwindcss';
@source '../vendor/design/ui/src';

@custom-variant dark (&:is([data-theme='dark'] *, .theme-dark *));

/* ===== TOKENS:START ===== */
@theme {}
/* ===== TOKENS:END ===== */

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-terminal: var(--terminal);
  --color-manifesto: var(--manifesto);
  --color-accent-text: var(--accent-text);
  --color-border-subtle: var(--border-subtle);
  --color-border-strong: var(--border-strong);
  --color-success: var(--success);
  --color-primary-hover: var(--primary-hover);
  --color-accent-hover: var(--accent-hover);
  --color-signage-bg: var(--signage-bg);
  --color-signage-text: var(--signage-text);
}

:root {
  /* Required by the byte-faithful Combobox tap-target contract. */
  --size-tap-min: 44px;
}
```

Run `bun tools/build-design-tokens.ts`. Load `src/app.css` from the root layout as usual. Add this script before the app build and run it in CI. Commit `src/lib/styles/tokens.css` and the generated sentinel region so drift is reviewable.

The font tokens name `Inter Variable` for headings and body and `JetBrains Mono Variable` for mono text. Self-host those variable fonts and load them before the app paints. The fallback stacks work, but using them changes metrics and breaks visual parity.

## 4. Configure UI once at boot

Call `configureUi` before the first `@yesid/ui` component renders. Add only product-owned Tailwind vocabulary. Base yesid text and color names already work without configuration.

```svelte
<script lang="ts">
  import { configureUi } from '@yesid/ui/cn';

  configureUi({
    vocab: {
      text: ['console-label'],
      colors: ['metric-healthy', 'metric-warning'],
    },
  });

  let { children } = $props();
</script>

{@render children()}
```

Keep this configuration static for the application. Do not derive it from a request, tenant, user, or locale.

## 5. Apply the motion policy

Read `vendor/design/motion/src/policy.ts` before adding an animation. Use `shouldAnimate('motion-gated')` for scroll scrubs, parallax, pointer translation, large scale changes, rotation, ambient loops, and smooth scrolling. Small feedback in the `safe-always` tier can still run under reduced motion.

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

Copy the Layer 1 `.tap-press` and `.tap-feedback` utilities from `vendor/design/motion/tap-feedback.css` into the product-owned section of `src/app.css`. The motion package does not import application CSS for you.

## 6. Wire the brand gates into Vitest and CI

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
  YESID_AA_PAIRS,
  YESID_FORBIDDEN,
  YESID_IDENTITIES,
} from '@yesid/gates/presets/yesid';
import { describe, expect, it } from 'vitest';

const srcRoot = fileURLToPath(new URL('.', import.meta.url));
const generated = new Set([
  join(srcRoot, 'app.css'),
  join(srcRoot, 'lib/styles/tokens.css'),
]);

describe('brand gates', () => {
  it('uses tokens instead of raw brand hex values', () => {
    const result = brandHexViolations({ root: srcRoot, allowlist: generated });
    expect(result.fileCount).toBeGreaterThan(0);
    expect(result.violations).toEqual([]);
  });

  it('avoids forbidden style patterns', () => {
    const failures = styleRegressionViolations({
      root: srcRoot,
      forbidden: YESID_FORBIDDEN,
    }).filter(({ hits }) => hits.length > 0);
    expect(failures).toEqual([]);
  });

  it('keeps the preset contrast pairs and identities', () => {
    expect(runContrastPairs(tokens, YESID_AA_PAIRS).filter(({ pass }) => !pass)).toEqual([]);
    expect(runIdentities(tokens, YESID_IDENTITIES).filter(({ pass }) => !pass)).toEqual([]);
  });
});
```

Run these commands in CI:

```sh
bun tools/adopt.ts --check --dest vendor/design
bun tools/build-design-tokens.ts
git diff --exit-code src/lib/styles/tokens.css src/app.css
bun x vitest run
bun run check
bun run build
```

## 7. Keep localization in the product

The packages do not read a locale or ship product copy. Pass translated labels, placeholders, clear labels, empty states, option labels, and `StopLabel` prefixes from the product. See the [Combobox copy levers](../packages/ui/PARITY-NOTES.md#combobox-wave-4-promotion) and the [localized StopLabel prefix](../packages/ui/PARITY-NOTES.md#stoplabel). The same notes ship at `vendor/design/ui/PARITY-NOTES.md` after adoption.

Do not add a locale check to a package. If the third product needs a new copy seam, add a generic prop upstream with a default that preserves current consumers.

## 8. Bump the brand pin deliberately

A brand change follows one direction:

1. Edit `packages/tokens/tokens.json` in `yesid.dev-design`.
2. Regenerate and verify the upstream outputs.
3. Create a new annotated `vX.Y.Z` tag.
4. Change the consumer's one exact tag pin and rerun `tools/adopt.ts`.
5. Run `tools/build-design-tokens.ts` in the consumer.
6. Review the vendored and generated changes together.
7. Run `--check`, tests, typecheck, gates, and the production build.

Never use `^`, `~`, a branch, or a floating tag. Never hand-edit `vendor/design`. Upstream the change, tag it, and let each consumer choose when to take the bump. npm publication may be added later, but it does not change this pin and cascade rule.
