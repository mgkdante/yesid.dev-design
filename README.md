# yesid.dev-design

The design and product standard behind [yesid.dev](https://yesid.dev) and
[Transit](https://transit.yesid.dev): design tokens, Svelte 5 components, motion, quality gates,
SEO, analytics and locale mechanics, released as eight packages. A SvelteKit product built on it
brings its own content and product logic; the look and the shared plumbing come from here.

[DESIGN.md](DESIGN.md) describes the visual language. The
[product guide](docs/BUILD-A-YESID-PRODUCT.md) sets up a new product step by step.

[Documentation](https://app.notion.com/p/3923e86306908139bbe4e78931cb3dbc) is the Notion wiki for
architecture, package contracts and operations. Public access is pending owner publication.

## Packages

| Package | What it does |
| --- | --- |
| [`@yesid/tokens`](packages/tokens/README.md) | Token source, generated CSS and Tailwind theme, bundled Inter and JetBrains Mono |
| [`@yesid/ui`](packages/ui/README.md) | Svelte 5 primitives, brand components, page frames, site shell and head |
| [`@yesid/motion`](packages/motion/README.md) | Svelte actions, reduced-motion policy, GSAP and Lenis helpers |
| [`@yesid/gates`](packages/gates/README.md) | Brand and contrast checks that run as a product's lint script |
| [`@yesid/seo-kit`](packages/seo-kit/README.md) | JSON-LD, sitemap and robots, share cards, favicon mark, security headers, server-side code highlighting |
| [`@yesid/analytics`](packages/analytics/README.md) | Cookieless Plausible pageviews and events, web-vitals collection |
| [`@yesid/i18n-core`](packages/i18n-core/README.md) | Locale routing, cached Intl formatting, typed copy |
| [`@yesid/config`](packages/config/README.md) | Shared TypeScript, Svelte and Turborepo configuration |

[`apps/gallery`](apps/gallery/README.md) is a private app that renders the packages and runs the
browser tests. It is never released.

## Install

The packages are not on npm. Each [release](https://github.com/mgkdante/yesid.dev-design/releases)
attaches one tarball per package, and a product lists the ones it uses in `package.json` by URL,
with the same tag in every URL:

```text
https://github.com/mgkdante/yesid.dev-design/releases/download/vX.Y.Z/yesid-<package>-X.Y.Z.tgz
```

`bun install` records each tarball's integrity in `bun.lock`. `@yesid/ui` takes `@yesid/tokens`,
`@yesid/motion` and `@yesid/seo-kit` as peer dependencies at the same release, and
`@yesid/seo-kit` takes `@yesid/tokens`, so list those too. The product guide has the full
[dependency block](docs/BUILD-A-YESID-PRODUCT.md#2-install-one-exact-release).

To upgrade, change the tag and the version in every URL and run `bun install`. A rollback is the
same edit with an earlier release. `gh attestation verify <tarball> --repo mgkdante/yesid.dev-design`
confirms a tarball came from the release workflow.

## Develop

You need Bun 1.3.11 ([`.bun-version`](.bun-version)) and Node 22 ([`.nvmrc`](.nvmrc)).

```sh
git clone https://github.com/mgkdante/yesid.dev-design.git
cd yesid.dev-design
bun install --frozen-lockfile
bun run check
bun run test
bun run build
bun run dev
```

`check` covers the API reports, TypeScript and svelte-check. `test` runs the repository, package
and Gallery unit tests. `dev` serves the Gallery. For the browser suite, run
`bun run browser:install` once, then `bun run test:browser`.

Token values live in `packages/tokens/tokens.json`. `bun run tokens:build` regenerates
`tokens.css`, `theme.css`, the motion tokens and `DESIGN.md` from it, and `bun run ci:tokens`
fails when a generated file has drifted.

## Principles

1. **No app conditionals.** Nothing in a package branches on which product uses it. A difference
   that can't be a prop with a default stays in the product.
2. **One direction.** Changes start here and reach products through releases. A product never
   patches installed package code; it upstreams the fix and takes the next release.
3. **Exact pins.** Each product pins one release tag, and every upgrade is a reviewed pull request
   in that product. No version ranges, no automatic sync.
4. **Promote at two consumers.** A component stays in its product until two products need the same
   contract, then moves into a package in its own release.

Products keep their copy, content, locale values, routes, analytics domain, CSP, gate policy and
deployment. [DECISIONS.md](DECISIONS.md) records why the packages are shaped the way they are.

## Releases

All eight packages share one version. [CHANGELOG.md](CHANGELOG.md) lists what changed in each
release, `api-reports/` records the public interface of every package but `@yesid/config`,
[RELEASING.md](RELEASING.md) covers cutting a release, and [DEPRECATION.md](DEPRECATION.md) covers
retiring a public export.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Questions and defect
reports: [SUPPORT.md](SUPPORT.md). Vulnerabilities: [SECURITY.md](SECURITY.md). Conduct:
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

The code is under the [MIT License](LICENSE). GSAP, the bundled fonts and the Lenis stylesheet keep
their own licenses; see [NOTICE](NOTICE). The yesid name and marks are covered by
[TRADEMARK.md](TRADEMARK.md).
