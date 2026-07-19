# Contributing

Machinery changes are welcome. Brand direction stays owner-decided.

## Good contribution scope

Open a pull request for concrete engineering work:

- bug fixes;
- accessibility fixes;
- performance fixes;
- stronger tests and drift gates;
- safer build, adoption, or release tooling;
- documentation corrections that match the current code.

Show the failure or risk first. Keep the change narrow. Do not bundle a cleanup campaign into a focused fix.

## Brand decisions are not community votes

The owner decides the brand values in `packages/tokens/tokens.json`, the palette and identity, the motion doctrine, and the visual rules enforced by the gates. Those values are not open for preference-driven pull requests or debate.

You can report a mechanical problem in a brand value, such as broken contrast, an undefined token, or a generator mismatch. Include reproducible evidence. Do not submit a replacement palette or doctrine because you prefer a different direction.

## Architecture rules

Four rules govern every contribution:

1. No app conditionals. A package never checks which product imported it.
2. Flow changes upstream. Consumers never patch vendored package code.
3. Consumers pin exact tags and move pins in deliberate bump pull requests.
4. A composed component promotes only after three independent consumers need the same contract.

If a change serves one product only, keep it in that product. If a consumer needs a shared fix, make the fix here, verify it here, tag it, then update the consumer pin.

## Run the suite

Use Bun 1.3 or newer. Install from the lockfile, then run the same checks as CI:

```sh
bun install --frozen-lockfile
bun x turbo run test
bun x turbo run check
bun run ci:tokens
bun run --cwd apps/gallery build
```

`ci:tokens` regenerates the committed token outputs and fails if they drift. Edit `packages/tokens/tokens.json` or generator source, never a generated output by itself.

For a focused loop, run the owning workspace first. Examples:

```sh
bun run --cwd packages/ui test
bun run --cwd packages/motion test
bun run --cwd packages/tokens test
```

Run the full suite before requesting review.

## Public API changes

The committed reports in `api-reports/` are the review surface for every released package. A change to an export condition, declaration, Svelte prop or binding, or direct public asset is a public API change.

After changing a public surface:

1. Run `bun run api:report`.
2. Review the report diff. Do not approve a report you cannot explain.
3. Add a new `.changes/<slug>.md` release fragment that names every changed package and chooses `patch`, `minor`, or `major`.
4. Run `bun run api:check` and the owning tests.

A fragment has YAML-style front matter followed by a concrete description:

```md
---
"@yesid/ui": minor
"@yesid/motion": patch
---

Describe the consumer-visible contract change.
```

CI runs `bun run api:approve` against the pull request's exact base commit. Only a fragment added by the current change can authorize a changed report; an older or malformed fragment cannot be reused. Initial report creation is the one-time baseline exemption.

## Escaped consumer defects

When a defect is first found in a consumer, reproduce it there, then add a neutral upstream regression at the lowest boundary that owns the behavior. Use the package suite for package-local behavior and the Gallery integration or browser suite for cross-package or rendered behavior.

Consumer-named permanent fixtures are rejected. A regression must describe the portable contract, not the product that happened to expose it. Keep the consumer reproduction only as temporary diagnostic evidence unless it protects a separate consumer-owned behavior.

Fix the defect upstream and prove the neutral regression passes. If the fix changes a public surface, update the API report and add the release fragment in the same pull request. Release an immutable tag, then move the consumer's exact pin in its own deliberate bump. A consumer patch is never a substitute for the upstream fix.

## Pull request expectations

- Keep the pull request small enough to review directly.
- Explain the observed problem, the decision, and the proof.
- Add a regression test for behavior changes.
- Preserve byte parity where a parity note requires it.
- Update `PARITY-NOTES.md` or `DECISIONS.md` when a public contract changes.
- Include the commands you ran and their results.
- Do not include consumer patches in an upstream package pull request.

Use decision-style commit messages. State the outcome instead of writing a vague activity log. For example:

```text
fix(ui): preserve the combobox accessible label through the portal
test(tokens): prove duration changes reach CSS and TypeScript mirrors
```

If the reason is not obvious, explain the constraint in the commit body.

## License and brand identity

The software is available under the [MIT License](LICENSE). That license does not grant permission to use the yesid name, wordmark, or brand identity. Keep the copyright and license notice with substantial copies of the software.
