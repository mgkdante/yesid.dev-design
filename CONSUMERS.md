# Consumers

| Consumer | Repository | Pin |
|---|---|---|
| Transit | [mgkdante/transit](https://github.com/mgkdante/transit) | `apps/web/vendor/design/manifest.json` |
| yesid.dev | [mgkdante/yesid.dev](https://github.com/mgkdante/yesid.dev) | `apps/web/vendor/design/manifest.json` |
| Gallery | `apps/gallery` in this repository | `workspace:*`; private dogfood app, not a Release consumer |

Each external consumer pins one exact Release tag. Its `manifest.json` records the tag, asset
digest, and tree hash, and `bun vendor/design/tools/adopt.ts --check --dest vendor/design`
verifies the installed snapshot offline. Each consumer's tests, build, and browser checks are its
own; a passing release or Gallery run does not stand in for them.
