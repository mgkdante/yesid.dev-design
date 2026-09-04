# Gallery

Private static dogfood for the yesid.dev-design packages. Gallery owns neutral rendered examples,
package coverage, accessibility/browser checks, and reviewed visual baselines. It is not a
released package and cannot prove that Transit or yesid.dev adopted or preserved product behavior.

## Interface and dependency direction

Gallery consumes `@yesid/tokens`, `@yesid/motion`, and `@yesid/ui` at runtime and
`@yesid/gates` in local tests. It supplies its own UI vocabulary, theme persistence, demo data,
and gate policy. Packages never import Gallery.

The public package interfaces are owned by generated reports under `api-reports/`. Gallery's
coverage registry checks that public UI families and shared motion actions have a neutral example;
it does not create new package exports.

## Invariants and generated content

- Gallery remains versioned separately from the seven coordinated packages.
- `src/app.css` has hand-maintained regions and one token-generator-owned sentinel region. Edit
  token source/generators, not the generated region.
- Browser authority is pinned to Chromium, UTC, `en-CA`, reduced motion, desktop/mobile projects,
  one worker, no retries, and exact screenshots.
- Snapshot updates require an explained rendered change and visual review. Host-specific local
  antialiasing is not permission to rewrite Noble baselines.
- Gallery success is upstream integration evidence only; consumers own adoption and deployment.

## Commands

```sh
bun run --cwd apps/gallery dev
bun run --cwd apps/gallery test
bun run --cwd apps/gallery check
bun run --cwd apps/gallery build
bun run test:browser:list
bun run test:browser
bun run test:browser:noble
bun run test:browser:noble -- <commit-or-tag>
```

`test:browser:list` discovers the fixed matrix without building. `test:browser` deliberately
builds the production Gallery before executing the browser suite. `test:browser:noble` streams
one resolved commit archive (default `HEAD`) into a disposable Docker volume. A networked
bootstrap container uses the same digest-pinned Playwright Noble image as CI, clears proxy
credentials, verifies the Bun checksum, and installs dependencies without lifecycle scripts. Before
that install, the host-side policy rejects archive rewriting, install-loaded configuration, and
dependency sources outside the npm registry or this workspace. Registry and cache locations are
explicit. A second container uses the image's unprivileged `pwuser`, a read-only image filesystem,
no network, and no Linux capabilities. Its generated output directories and bounded `/tmp` are
writable; the source, installed dependency CLIs, browser image, and Bun toolchain are not. Cleanup
removes the volume on success or failure. Docker and bootstrap network access are required.

The hosted Noble job invokes the harness from an immutable action revision. The host treats the
candidate as Git data through policy and archive creation, pins the dependency resolution surface
and approved patch bytes to that revision, and installs the pinned Bun 1.3.11 helper runtime without
installing candidate dependencies before the policy runs. The policy accepts only regular files
within fixed per-file, aggregate-byte, and entry-count bounds before creating the archive. Candidate
build configuration, browser configuration, tests, and application code execute only inside the
confined second container. Green proves that the exact reviewed candidate suite ran in the pinned
environment. It does not make candidate assertions immutable, replace visual review, or prove
consumer adoption.
Working-tree changes, including ignored and untracked files, are intentionally excluded; commit
the exact candidate you want to verify first.

## Failure modes and release implications

Unit/SSR failures point to package integration or Gallery policy. Browser failures additionally
cover built output, interactions, accessibility, fonts, responsive containment, and screenshots.
Package success cannot waive a Gallery failure, and Gallery success cannot waive consumer gates.

Gallery source and README changes do not require a coordinated package release unless package
payload bytes also change. Package release and consumer procedures live in
[`RELEASING.md`](../../RELEASING.md) and [`CONSUMERS.md`](../../CONSUMERS.md).
