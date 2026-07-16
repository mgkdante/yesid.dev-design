# AI-accelerated, human-owned

This repository is built with heavy AI assistance — and every decision in it
is human. The distinction matters, so here is the actual operating model.

## The process

- **Direction and architecture are the author's.** What to extract, where the
  brand boundary sits, which trade-offs are acceptable, what ships and what
  waits — every one of those calls is made by a person, recorded in commit
  messages, design notes (PARITY-NOTES.md, DECISIONS.md), and the project's
  planning system.
- **Implementation is AI-assisted.** Coding agents execute well-specified,
  reviewed briefs. Their output is never trusted by default.
- **Adversarial review runs in both directions.** AI-implemented changes are
  independently re-verified (tests re-run outside the implementing agent's
  environment, diffs read line by line, claims spot-checked against the
  repo). Plans get red-teamed before execution. Several errors in *briefs*
  have been caught by the implementing agent, and several errors in
  *implementations* by the reviewer — the loop works because neither side is
  assumed correct.
- **Machines enforce the brand, so opinions can't drift.** Token drift gates,
  byte-parity tests, contrast floors, and style-regression engines
  (packages/gates) codify the design doctrine as CI law. A contribution —
  human or AI — that violates the brand fails the build.

## Why this is documented

"Vibe-coded" means no principles. This codebase runs on explicit ones:
byte-faithful parity anchors, one-direction upstream flow, rule-of-three
promotion, no app-conditionals, pinned-tag cascades. The AI accelerates the
typing; the principles — and the accountability — are human.

More on the workflow: https://yesid.dev/blog
