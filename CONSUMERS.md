# Consumers

| Consumer | Repository | Pin |
|---|---|---|
| Transit | [mgkdante/transit](https://github.com/mgkdante/transit) | release asset URLs in `package.json` and `apps/web/package.json`; integrity in `bun.lock` |
| yesid.dev | [mgkdante/yesid.dev](https://github.com/mgkdante/yesid.dev) | release asset URLs in `package.json` and `apps/web/package.json`; integrity in `bun.lock` |
| Gallery | `apps/gallery` in this repository | `workspace:*`; private dogfood app, not a Release consumer |

Each external consumer pins one exact release tag in its asset URLs. Its tests, build and browser
checks are its own; a passing release or Gallery run does not stand in for them.
