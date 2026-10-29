---
"@yesid/config": minor
---

Adds `@yesid/config/playwright`. `yesidProjects(baseURL)` returns the standard Playwright projects: `phone` (390×844), `tablet` (768×1024) and `desktop` (1440×900) for untagged tests, `reduced-motion` for tests tagged `@motion`, and `light` and `dark` (seeded through the `theme` localStorage key) for tests tagged `@theme`. `expectAccessible(page, { include, exclude })` fails a test on any serious or critical axe violation of WCAG 2.2 AA or axe best practice; the contrast rule skips blueprint art (`.blueprint-bg`). `@playwright/test` and `@axe-core/playwright` are optional peer dependencies: install them in the same package.json as `@yesid/config` (the workspace root in a monorepo), since a root package cannot see peers installed in a child workspace.

Deprecates `@yesid/config/turbo/base.json` and the `@yesid/config/tsconfig/base.json` subpath, which have no consumer: each app commits its own `turbo.json`, and products extend `tsconfig/library.json` or `tsconfig/svelte-kit.json`, which keep their base. Replacement: keep your own `turbo.json`, and extend `library.json` or `svelte-kit.json`. Earliest removal: v0.31.0, and not before 90 days after v0.29.0 is published.
