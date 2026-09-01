# Consumers

This registry records Release-adoption facts observed at each repository's
canonical `origin/main` on 2026-09-01. It does not infer product verification;
that remains consumer-owned.

| Consumer | Observed ref | Release-adoption state | Required next transition |
|---|---|---|---|
| Transit | `ee2e565c86df4ffa40f11fcffb2ae23b56410a4e` | `apps/web/vendor/design/manifest.json` is a schema-2 Release receipt for `v0.13.1`, annotated tag object `cb2a6d76423c33303b9e86257f5639d10eb20bc7`, peeled commit `7cda0887287ef1e274582813d4c1a5795a54b7ea`, containing `tokens,motion,gates,seo-kit,ui,analytics,i18n-core`. | Future changes use a reviewed exact-tag adoption PR, followed by Transit's own vendor, generated-output, test, build, and product/browser verification. |
| yesid.dev | `8e23e70bcd564de09ac52f09141a9a848a128180` | `apps/web/vendor/design/manifest.json` is a schema-2 Release receipt for `v0.13.1`, annotated tag object `cb2a6d76423c33303b9e86257f5639d10eb20bc7`, peeled commit `7cda0887287ef1e274582813d4c1a5795a54b7ea`, containing `tokens,motion,gates,seo-kit,ui,analytics,i18n-core`. The former embedded package copies are no longer present. | Future changes use a reviewed exact-tag adoption PR, followed by yesid.dev's own vendor, generated-output, test, build, and product/browser verification. |
| Gallery | yesid.dev-design `9a1535c36a731268131b1631c32eeac63d42bbcc` | `apps/gallery` is the private workspace dogfood consumer. It resolves packages through `workspace:*`; it is not an external Release consumer and its app version remains outside package lockstep. | Continue exercising package integration and browser authority here. Do not treat Gallery success as proof of an external consumer's product verification. |

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
