# @yesid/config

Shared TypeScript, Svelte and Turborepo configuration
for yesid repositories. It ships as `yesid-config-X.Y.Z.tgz` on each `vX.Y.Z` release, in
lockstep with the other packages; registry publication is disabled.

## Compatibility

| Contract | Supported range |
| --- | --- |
| `tsconfig/base.json` | TypeScript `>=5.0 <6` |
| `tsconfig/library.json` | TypeScript `>=5.0 <6` |
| `tsconfig/svelte-kit.json` | TypeScript `>=5.7 <6`; SvelteKit `>=2 <3` |
| `svelte/project-runes.js` | Svelte `>=5 <6`; Node `>=22` or Bun `>=1.3` |
| `turbo/base.json` | Turbo `>=2.9 <3` |

These ranges are the tested contract, not registry peer dependencies. Each export remains
independently usable without forcing unrelated tools into a consumer installation.

## TypeScript

- `@yesid/config/tsconfig/base.json` owns only the compiler policy shared by every proven
  consumer.
- `@yesid/config/tsconfig/library.json` adds the neutral no-emit library contract. Consumers
  still own module format, globals, libraries, paths, and source inclusion.
- `@yesid/config/tsconfig/svelte-kit.json` composes after SvelteKit's generated config. Apps
  still own aliases, generated inputs, runtime globals, and any stricter local policy.
- `@yesid/config/svelte/project-runes.js` supplies the shared Svelte 5 project-runes policy.
  Pass `import.meta.dirname`; adapters, preprocessors, routes, and version polling stay local.

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

`@yesid/config/turbo/base.json` is the canonical three-repository task core. Root
`turbo.json` files cannot extend an external config, so consumer adoption composes this
base with an explicit repository-owned overlay and verifies the result for drift. Deploy
outputs, environment variables, app-only tasks, and credentials never belong in the base.

ESLint, Prettier, Vitest, deploy bindings, and product path literals remain consumer-owned
until they independently satisfy the third-consumer rule.

## Release implications

Config changes add a `.changes` fragment naming `@yesid/config` and ship with the next coordinated
release ([`RELEASING.md`](https://github.com/mgkdante/yesid.dev-design/blob/v0.27.0/RELEASING.md)).
Shared-action ownership stays in
[`docs/SHARED-TOOLING-CI.md`](https://github.com/mgkdante/yesid.dev-design/blob/v0.27.0/docs/SHARED-TOOLING-CI.md).
