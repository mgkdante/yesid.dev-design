# @yesid/config

Shared TypeScript, Svelte and Turborepo configuration for yesid repositories. It ships as
`yesid-config-X.Y.Z.tgz` on each `vX.Y.Z` release, in lockstep with the other packages.

## Compatibility

| Contract | Supported range |
| --- | --- |
| `tsconfig/base.json` (deprecated) | TypeScript `>=5.0 <6` |
| `tsconfig/library.json` | TypeScript `>=5.0 <6` |
| `tsconfig/svelte-kit.json` | TypeScript `>=5.7 <6`; SvelteKit `>=2 <3` |
| `svelte/project-runes.js` | Svelte `>=5 <6`; Node `>=22` or Bun `>=1.3` |
| `playwright/index.js` | Playwright `>=1.50 <2`; `@axe-core/playwright` `>=4.10 <5` |
| `turbo/base.json` (deprecated) | Turbo `>=2.9 <3` |

These ranges are tested. Only the Playwright export names its tools, as optional peer dependencies, so a
product never installs a tool it doesn't use.

## TypeScript and Svelte

- `@yesid/config/tsconfig/base.json` is deprecated as an import: no product extends it directly, and
  `library.json` and `svelte-kit.json` keep it as their base.
- `@yesid/config/tsconfig/library.json` adds the no-emit library settings. Products still own
  module format, globals, libraries, paths and source inclusion.
- `@yesid/config/tsconfig/svelte-kit.json` composes after SvelteKit's generated config. Apps still
  own aliases, generated inputs, runtime globals and any stricter local policy.
- `@yesid/config/svelte/project-runes.js` supplies the shared Svelte 5 runes policy. Pass
  `import.meta.dirname`; adapters, preprocessors, routes and version polling stay local.

```json
{
  "extends": [
    "./.svelte-kit/tsconfig.json",
    "@yesid/config/tsconfig/svelte-kit.json"
  ]
}
```

```js
import { projectRunes } from '@yesid/config/svelte/project-runes.js';

export default {
  compilerOptions: { runes: projectRunes(import.meta.dirname) }
};
```

## Turborepo

`@yesid/config/turbo/base.json` is deprecated. Each product commits its own `turbo.json`, and nothing
reads this base any more. It goes no earlier than v0.31.0.

ESLint, Prettier, Vitest and deploy settings stay in each product until two products need the same
setup.

## Playwright

`@yesid/config/playwright` exports `yesidProjects(baseURL)`, the standard projects, and
`expectAccessible(page)`, one axe check. See
[Test accessibility with the standard projects](https://github.com/mgkdante/yesid.dev-design/blob/v0.29.0/docs/BUILD-A-YESID-PRODUCT.md#7-test-accessibility-with-the-standard-projects).
