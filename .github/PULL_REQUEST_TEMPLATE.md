## Problem and decision

Describe the observed failure or missing contract, its owning domain, and the
narrow decision made here.

## Release impact

- [ ] No released contract changes.
- [ ] Patch: backward-compatible fix.
- [ ] Minor: backward-compatible capability or reviewed transition.
- [ ] Major: incompatible contract change.
- Release fragment: `.changes/<slug>.md` or `not required because ...`
- API report diff: `none` or name the changed report and why.

## Architecture boundaries

- [ ] No app conditional or consumer policy was added upstream.
- [ ] No consumer vendored files are patched; escaped defects have a neutral upstream regression.
- [ ] A composed component is either still consumer-owned or has evidence from three independent consumers.
- [ ] Package versions and generated artifacts follow the repository contracts.

## Verification

Paste fresh command results and failure counts. Use `not applicable` only with a
specific reason.

- [ ] Focused RED -> GREEN regression evidence:
- [ ] `bun run api:check`:
- [ ] `bun x turbo run test`:
- [ ] `bun run check`:
- [ ] `bun run ci:tokens`:
- [ ] `bun run build`:
- [ ] UI/rendered change: pinned browser authority and reviewed visual evidence:
- [ ] Consumer-facing change: clean-room adoption or consumer verification evidence:

## Rollout and rollback

Name the exact tags or consumer pins affected. For a release change, state how
the immutable asset is verified and which previously accepted tag is the tested
rollback target.
