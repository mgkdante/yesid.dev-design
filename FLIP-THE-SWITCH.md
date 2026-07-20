# FLIP-THE-SWITCH — completed

The yesid.dev design-system cutover is complete.

As observed on 2026-07-20, yesid.dev `main` at
`4ddfc5f934e31c9446f8014d0ae80e1fdb9a8fa6` contains
`apps/web/vendor/design/manifest.json`, a schema-2 immutable-Release receipt for
`v0.7.1` at peeled design commit
`c0188172f07e6c4238b3397aa7e1b0d4ff154ee9`. It adopts
`tokens,motion,gates,ui`; the former embedded package copies are gone.

This file is no longer an execution prompt. Future upgrades follow
[`docs/BUILD-A-YESID-PRODUCT.md`](docs/BUILD-A-YESID-PRODUCT.md): adopt one exact
immutable Release, never patch `vendor/design`, keep product policy and composed
components consumer-owned, and run yesid.dev's own verification before merge.
