# Consumers

This registry records the starting state before the `v0.7.0` Release cascade.
It is evidence, not a completion claim. A consumer becomes current only through
its own reviewed bump, schema-2 receipt, checks, and product verification.

Baseline refs were read from each repository's canonical `origin/main` on
2026-07-18.

| Consumer | Baseline ref | Starting distribution state | Required next transition |
|---|---|---|---|
| Transit | `aef4c722d4fbcf1f812c0c37a7e4c1881f68961a` | `apps/web/vendor/design` is pinned by a legacy manifest to `v0.6.0` at `317dd0386fe3e37372c11ece6eaedcdd170dd98a`. The app resolves all four `@yesid/*` packages through `file:vendor/design/*`, but the manifest predates schema 2. | Adopt an immutable `v0.7.0` Release asset with the schema-2 tool, move product policy out of the gates package, then prove vendor check, generated output, tests, build, and product/browser behavior in Transit. |
| yesid.dev | `7767b729e01c73a3b85fc031d287de2cb9445cb1` | The monorepo still owns embedded workspace packages under `packages/{tokens,motion,gates,ui}` and resolves them through `workspace:*`. It has no `vendor/design/manifest.json` and has not yet adopted schema 2. | Replace the embedded copies through its staged cutover, preserve consumer-owned policy and composed components, then prove the exact Release receipt and yesid.dev's own tests/build/browser behavior. |
| Gallery | yesid.dev-design `7c588672c4bea1ec9cd4051fe4f2d5a152a11114` | `apps/gallery` is the private workspace dogfood consumer. It resolves the released packages through `workspace:*`; it is not an external Release consumer and its `0.1.0` app version is outside package lockstep. | Continue to exercise package integration and browser authority in this repository. Do not treat Gallery success as proof of either external consumer's cascade. |

## State vocabulary

- **Embedded** means a consumer owns a duplicate package source tree.
- **Legacy vendored** means it pins copied package files but lacks the schema-2
  trust record and self-vendored verification tool.
- **Release adopted** means production mode installed one exact immutable
  Release asset and `tools/adopt.ts --check` validates the resulting schema-2
  manifest and complete payload offline.
- **Product verified** is consumer-owned: its generated artifacts, package
  tests, typecheck, build, gates, and relevant browser checks pass for the bump.

Release adoption and product verification are separate gates. Neither is
inferred from an upstream tag or from another consumer's result.
