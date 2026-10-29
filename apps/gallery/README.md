# Gallery

A private SvelteKit app that renders the tokens, UI and motion packages from the workspace: token
sheets, primitives, brand components, motion, and the listing, detail, data, error and site-header
pages. Its unit and Playwright suites check rendered behavior and accessibility. It is never
released, and a passing Gallery run does not replace a product's own tests.

Gallery uses `@yesid/tokens`, `@yesid/motion` and `@yesid/ui` at runtime and `@yesid/gates` in its
tests, with its own gate policy, demo data and theme persistence. Packages never import it. Its
coverage test fails when a public UI family or shared motion action has no example.

## Commands

```sh
bun run --cwd apps/gallery dev
bun run --cwd apps/gallery test
bun run --cwd apps/gallery check
bun run browser:install
bun run test:browser
bun run test:browser:list
```

`browser:install` downloads Chromium once. `test:browser` builds the Gallery, then runs Playwright;
`test:browser:list` lists the browser matrix without building. Browser runs are pinned to Chromium,
UTC, `en-CA` and reduced motion, on the standard projects from `@yesid/config/playwright` (untagged
tests at phone, tablet and desktop, `@theme` tests in light and dark, `@motion` tests with reduced
motion), with one worker and no retries. They assert behavior, never pixels.
