# Consumers

This registry records Release-adoption facts observed at each repository's
canonical `origin/main` on 2026-09-02. It does not infer product verification;
that remains consumer-owned.

| Consumer | Observed ref | Release-adoption state | Required next transition |
|---|---|---|---|
| Transit | `5ea5b05029ec2944ba1da1e10397f07249ab6af6` | `apps/web/vendor/design/manifest.json` is a schema-2 Release receipt for `v0.13.2`, containing `tokens,motion,gates,seo-kit,ui,analytics,i18n-core` and the authority below. | Future changes use a reviewed exact-tag adoption PR, followed by Transit's own vendor, generated-output, test, build, and product/browser verification. |
| yesid.dev | `6f5884dc3840f52bd00d8008aea05a74ca5408e5` | `apps/web/vendor/design/manifest.json` is a schema-2 Release receipt for `v0.13.2`, containing `tokens,motion,gates,seo-kit,ui,analytics,i18n-core` and the authority below. The former embedded package copies are no longer present. | Future changes use a reviewed exact-tag adoption PR, followed by yesid.dev's own vendor, generated-output, test, build, and product/browser verification. |
| Gallery | yesid.dev-design `bcc628763245387c23eeeb7d81af7c0f75176421` | `apps/gallery` is the private workspace dogfood consumer. It resolves packages through `workspace:*`; it is not an external Release consumer and its app version remains outside package lockstep. | Continue exercising package integration and browser authority here. Do not treat Gallery success as proof of an external consumer's product verification. |

## Release authority

Both external receipts bind annotated tag object
`2809b5a33ed08cf0c2e470cbc56d2a8ac68836cb`, peeled commit
`bcc628763245387c23eeeb7d81af7c0f75176421`, and the sole immutable asset
`yesid.dev-design-v0.13.2.tar` (798720 bytes,
`sha256:1376c630f0c5288c13ca671bc78073ca70e1f5d7d16287d4bc731c05847565e9`).

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
