# Shared tooling CI

The classifier, required-context reporter, and drift gate are public actions in stable
subdirectories. Every caller pins all three to the same reviewed 40-character commit SHA:

```yaml
- uses: mgkdante/yesid.dev-design/.github/actions/classify-paths@<FULL_40_CHARACTER_COMMIT_SHA>
- uses: mgkdante/yesid.dev-design/.github/actions/required-context@<FULL_40_CHARACTER_COMMIT_SHA>
- uses: mgkdante/yesid.dev-design/.github/actions/shared-tooling-drift@<FULL_40_CHARACTER_COMMIT_SHA>
```

A branch, floating tag, abbreviated SHA, expression, or mixed set of SHAs is outside the
contract. The exact ST3 merge commit recorded in the program handoff becomes the first usable
pin. Consumer changes remain deliberate bump pull requests; this repository never edits their
workflow paths, environment bindings, deploy credentials, or application smoke tests.

## Drift manifest

The drift action runs after checkout and accepts one repository-owned JSON manifest:

```json
{
  "schema": 1,
  "source": {
    "repository": "mgkdante/yesid.dev-design",
    "sha": "<FULL_40_CHARACTER_COMMIT_SHA>",
    "gate": ".github/actions/shared-tooling-drift"
  },
  "configurations": [
    {
      "mode": "json-merge",
      "sources": [
        {
          "path": "node_modules/@yesid/config/turbo/base.json",
          "digest": "sha256:<64_LOWERCASE_HEX>"
        },
        {
          "path": ".github/shared-tooling/turbo.overlay.json",
          "digest": "sha256:<64_LOWERCASE_HEX>"
        }
      ],
      "target": "turbo.json"
    }
  ],
  "callers": [
    {
      "workflow": ".github/workflows/ci.yml",
      "action": ".github/actions/classify-paths"
    },
    {
      "workflow": ".github/workflows/ci.yml",
      "action": ".github/actions/required-context"
    },
    {
      "workflow": ".github/workflows/ci.yml",
      "action": ".github/actions/shared-tooling-drift"
    }
  ]
}
```

The manifest has no consumer names or built-in paths. Every source is bound to its raw-byte
SHA-256 digest, so changing a source and its generated target together still fails until the
pin is deliberately reviewed. `bytes` compares one source and target byte-for-byte.
`json-merge` recursively merges objects from left to right; arrays and scalar values are
replaced by the later source. The checked-in target must equal that semantic result. An
overlay is the explicit, reviewable consumer escape hatch. Downstream config package bases
come from the exact immutable `@yesid/config` release selected by the consumer lockfile.

The producer repository is the one deliberate self-canary exception: it consumes the exact
`@yesid/config@0.2.0` workspace contract and binds `packages/config/turbo/base.json` directly.
This avoids a same-name package acquisition loop and keeps the drift source a regular file
instead of a workspace symlink. The config release contract separately proves those checked-in
package bytes and version. Transit and yesid.dev must consume the immutable Release asset; they
must not copy the producer-only source path.

Every configured shared caller must appear exactly once as a literal `uses` value, at the
manifest SHA. Undeclared references to the source repository fail. The gate also binds its
runtime `github.action_repository` and `github.action_ref` values to the manifest, so a mutable
or stale pin cannot produce a passing receipt. Inputs and targets must be regular files under
the checkout; traversal, symlinks, duplicate JSON keys, unknown manifest keys, and files over
1 MiB fail closed.

## Required-context shape

The classifier keeps path rules caller-owned. The reporter job uses job-level `if: always()`
and lists the classifier plus every work job as direct dependencies. Relevant work must
succeed; irrelevant work must be skipped. Missing, stale, failed, cancelled, timed-out,
action-required, malformed, or unexpectedly skipped results fail the required context.

## Fresh-clone verification

From a clean checkout of the reviewed commit:

```sh
bun install --frozen-lockfile
bun run --cwd apps/gallery test -- tests/ci-contract.test.ts tests/shared-tooling-drift.test.ts
bun run test -- --force
bun run check -- --force
```

The drift action itself requires only the runner-provided Node runtime. It does not install
packages, fetch consumer secrets, or import files from outside its action directory.
