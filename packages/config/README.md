# @yesid/config

Shared TypeScript, Svelte and Turborepo configuration for yesid repositories. It ships as
`yesid-config-X.Y.Z.tgz` on each `vX.Y.Z` release, in lockstep with the other packages.

## Compatibility

| Contract | Supported range |
| --- | --- |
| `tsconfig/base.json` | TypeScript `>=5.0 <6` |
| `tsconfig/library.json` | TypeScript `>=5.0 <6` |
| `tsconfig/svelte-kit.json` | TypeScript `>=5.7 <6`; SvelteKit `>=2 <3` |
| `svelte/project-runes.js` | Svelte `>=5 <6`; Node `>=22` or Bun `>=1.3` |
| `turbo/base.json` | Turbo `>=2.9 <3` |

These ranges are tested, not declared as peer dependencies. Each export works on its own, so a
product never installs a tool it doesn't use.

## TypeScript and Svelte

- `@yesid/config/tsconfig/base.json` holds only the compiler policy every product shares.
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

`@yesid/config/turbo/base.json` is the task core the three repositories share. A root `turbo.json`
cannot extend an external config, so each product commits its own `turbo.json` that starts from
this base. Deploy outputs, environment variables, app-only tasks and credentials never belong in
the base.

ESLint, Prettier, Vitest and deploy settings stay in each product until two products need the same
setup.
