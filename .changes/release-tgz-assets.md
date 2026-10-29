---
"@yesid/analytics": minor
"@yesid/config": minor
"@yesid/gates": minor
"@yesid/i18n-core": minor
"@yesid/motion": minor
"@yesid/seo-kit": minor
"@yesid/tokens": minor
"@yesid/ui": minor
---

Each package now ships as its own tarball on the GitHub Release (`yesid-<pkg>-X.Y.Z.tgz`), with a
build-provenance attestation. Install them by URL instead of vendoring: see
`docs/BUILD-A-YESID-PRODUCT.md`. `@yesid/ui` and `@yesid/seo-kit` take their sibling packages as
peer dependencies pinned to the same release, so list every `@yesid` package the app uses.
`@yesid/config` joins the lockstep version and the separate `config-v*` releases end. The adoption
CLI, the `yesid.dev-design-vX.Y.Z.tar` archive and the schema-2 `manifest.json` are removed under
the owner's 2026-10-29 waiver (see `DEPRECATION.md`).
