# Releasing

A release is an annotated `vX.Y.Z` tag on `main` and one immutable GitHub Release carrying eight
package tarballs. Consumers install those tarballs by URL; nothing is published to npm.

## Rules

- Release only a commit that is already on `main`.
- The root manifest and the eight packages (`@yesid/tokens`, `@yesid/motion`, `@yesid/gates`,
  `@yesid/seo-kit`, `@yesid/ui`, `@yesid/analytics`, `@yesid/i18n-core`, `@yesid/config`) share
  one version. The private Gallery stays at `0.1.0`.
- Every version move consumes at least one `.changes/*.md` fragment.
- Never move, delete or re-push a tag, and never edit a published Release. Fix forward with a new
  version.

## 1. Release pull request

Each consumer-visible change adds a fragment:

```md
---
"@yesid/ui": patch
"@yesid/motion": minor
---

What changed for consumers, and how to migrate.
```

`patch` fixes, `minor` adds or carries an approved removal (see [`DEPRECATION.md`](DEPRECATION.md)),
`major` breaks a contract. When in doubt, the API report diff decides.

```sh
bun run release:prepare -- --version X.Y.Z
bun run release:check -- --version X.Y.Z
```

Prepare bumps every manifest and `bun.lock`, folds the fragments into `CHANGELOG.md` and deletes
them, and moves the package READMEs' links from `blob/v<previous>/` to `blob/vX.Y.Z/`. Merge the
release pull request once CI is green and the API report diff has been read.

## 2. Tag

```sh
git fetch --prune origin main --tags
git switch --detach origin/main
test -z "$(git status --porcelain)"
TAG=vX.Y.Z
git tag -a "$TAG" -m "$TAG"
bun run release:check -- --version "${TAG#v}" --tag "$TAG"
test "$(gh api repos/mgkdante/yesid.dev-design/immutable-releases --jq .enabled)" = true
git push origin "refs/tags/$TAG"
```

## 3. Publish

The tag push runs [`release.yml`](.github/workflows/release.yml). It checks that the tag is
annotated, on `main` and matches the prepared version, runs `check` and `test`, and packs each
package with `bun pm pack`. Before packing, every sibling `workspace:*` peer is pointed at this
release's own asset URL, so an install never asks the npm registry for an `@yesid` name. The
workflow attests build provenance for the eight tarballs, then `gh release create` uploads them to
a draft and publishes it only when all are attached; the repository's immutable releases lock it.

Check the result:

```sh
gh release view "$TAG" --json assets --jq '.assets[].name'   # the eight yesid-<pkg>-X.Y.Z.tgz
gh release verify "$TAG"
gh release download "$TAG" --pattern 'yesid-ui-*.tgz' --dir /tmp/check
gh attestation verify /tmp/check/yesid-ui-*.tgz --repo mgkdante/yesid.dev-design
```

If the run fails before publishing, check `gh release view "$TAG"`. `gh release create` deletes
its draft on failure, but cleanup can fail or the run can be cut off: delete only a confirmed
unpublished draft (`gh release delete "$TAG"`) before retrying. Rerun a transient failure with
`gh run rerun <run-id>`. If the workflow itself needed a fix, merge it to `main` and dispatch it for
the same tag: `gh workflow run release.yml -f tag="$TAG"`. The dispatch runs `main`'s workflow, but
checkout, setup, tests and package sources still come from the tag, so a defect in the tagged
source needs a new version. A published Release stays as it is.

## 4. Consumers

Each app takes the release in its own pull request: change the tag and version in every
`https://github.com/mgkdante/yesid.dev-design/releases/download/vX.Y.Z/yesid-<pkg>-X.Y.Z.tgz`
URL, run `bun install`, and let its CI build and test it. The lockfile pins each tarball's
integrity. A rollback is the same edit pointing at an earlier release.
