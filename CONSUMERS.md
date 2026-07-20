# Consumers

This registry records Release-adoption facts observed at each repository's
canonical `origin/main` on 2026-07-20. It does not infer product verification;
that remains consumer-owned.

| Consumer | Observed ref | Release-adoption state | Required next transition |
|---|---|---|---|
| Transit | `105893db42d9e9fd3f182de1534f34236dc3ef72` | `apps/web/vendor/design/manifest.json` is a schema-2 Release receipt for `v0.7.1`, peeled commit `c0188172f07e6c4238b3397aa7e1b0d4ff154ee9`, containing `tokens,motion,gates,ui`. | Future changes use a reviewed exact-tag adoption PR, followed by Transit's own vendor, generated-output, test, build, and product/browser verification. |
| yesid.dev | `4ddfc5f934e31c9446f8014d0ae80e1fdb9a8fa6` | `apps/web/vendor/design/manifest.json` is a schema-2 Release receipt for `v0.7.1`, peeled commit `c0188172f07e6c4238b3397aa7e1b0d4ff154ee9`, containing `tokens,motion,gates,ui`. The former embedded package copies are no longer present. | Future changes use a reviewed exact-tag adoption PR, followed by yesid.dev's own vendor, generated-output, test, build, and product/browser verification. |
| Gallery | yesid.dev-design `c0188172f07e6c4238b3397aa7e1b0d4ff154ee9` | `apps/gallery` is the private workspace dogfood consumer. It resolves packages through `workspace:*`; it is not an external Release consumer and its app version remains outside package lockstep. | Continue exercising package integration and browser authority here. Do not treat Gallery success as proof of an external consumer's product verification. |

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
