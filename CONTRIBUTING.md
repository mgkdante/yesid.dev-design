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
