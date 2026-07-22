---
# This file's frontmatter ships with `<FILL IN>` placeholders by design.
# Real Notion UUIDs live in a gitignored `AGENTS.local.md` file.
# Resolution: AGENTS.local.md > AGENTS.md > refuse (PreToolUse Rule 6 hook enforces).

notion:
  root_page_id: "<FILL IN: yesid.dev-design top page UUID>"
  workspace_url: "<FILL IN: e.g. https://www.notion.so/>"
  databases:
    slices:
      database_id: "<FILL IN>"
    sessions:
      database_id: "<FILL IN>"
    transcript_chunks:
      database_id: "<FILL IN>"
  pages:
    roadmap: "<FILL IN>"
    architecture: "<FILL IN>"
    architecture_index_db: "<FILL IN>"
    business: "<FILL IN>"
    business_index_db: "<FILL IN>"
  vocabulary_page_id: "<FILL IN: shared global vocabulary page UUID>"
---

# AGENTS.md — yesid.dev-design workflow contract (v3)

> **Tool-agnostic.** Read by both Claude Code and Codex CLI.

## Project

**yesid.dev-design** — the yesid brand's shared foundation as a standalone bun+turbo monorepo: `packages/tokens` (DTCG source of truth + generators), `packages/motion` (pure Snappy-Doctrine actions), `packages/gates` (neutral quality engines; product policy stays consumer-side), `packages/seo-kit` (framework-neutral SEO builders and rendering core), `packages/ui` (source-shipped Svelte 5 primitives), and `apps/gallery` (the living brand gallery). Extracted byte-faithful from yesid.dev @ `2bdb611d91749dc437c07586cb82129eabe9dfec`; `v0.1.0` is the immovable parity tag. Current external-consumer receipts are recorded in `CONSUMERS.md`.

## Governance laws (constitutional — see README for the full text)

1. No app-conditionals ever (demote instead).
2. One-direction flow (apps never patch package code; upstream first).
3. Consumers pin exact versions; cascade = deliberate bump-PRs.
4. Components promote only by rule of three.

## Workflow

workflow-overlord 4.x orchestrates Claude Code + Codex sessions via Notion shared state. **Notion is the canonical workflow state** (Roadmap / Slices / Sessions / Transcript Chunks under the repo's own subtree, a sibling of the Transit subtree). Long-form business + architecture context also lives there; repo prose stays short and practical (README = governance + layout + deviation register).

## Core principles — the 5 mechanical guarantees

1. **Sessions row exists at session start** — SessionStart hook
2. **Sessions row gets final transcript chunks + summary refresh on Stop** — the
   plugin finalizer flushes readable evidence. `Ended` is not written because
   sessions are resumable.
3. **No surgical Notion edits (Rule 2)** — PreToolUse hook
4. **Refuse placeholder Notion config (Rule 6)** — PreToolUse hook
5. **Cross-tool parity** — Claude Code and Codex execute the same installed
   plugin runtime; this repository contains no workflow-overlord mirrors.

Everything else is instruction + AI nudge — user decides.

## Notion subtree shape

```text
<root_page_id> ("yesid.dev-design")
├── 🧭 Business          — mission, tier model, consumers, versioning promise
├── 🏗️ Architecture      — governance laws, extraction layer map, anti-drift stack
├── 🔀 FLIP-THE-SWITCH   — completed yesid.dev adoption record
└── 🗂️ Canonical
    ├── Roadmap
    ├── Slices
    ├── Sessions
    └── Transcript Chunks
```

## Notion integration architecture

Two distinct paths — pick by **caller**, not by tool name.

### `notion_conversation` (interactive / agentic)
- hosted Notion MCP at `https://mcp.notion.com/mcp`
- OAuth through the active AI tool

### `notion_automation` (headless / hooks / CI)
- direct Notion REST API via token auth
- auth source: `NOTION_INTEGRATION_TOKEN` (this repo's `.env`, never committed)

## Retrieval priority

1. hosted MCP `notion-query-data-sources` · 2. `notion-fetch` · 3. `notion-search` · 4. direct REST fallback.

## AI nudge contract

The AI MUST nudge the user about available tools at every optional juncture, same format as transit's contract:

> *Reminder: tools available — `superpowers:brainstorming`, `superpowers:writing-plans`, `superpowers:test-driven-development`, `superpowers:systematic-debugging`, `superpowers:verification-before-completion`, `superpowers:requesting-code-review`. Invoke any (or none) — your call.*

Never recommend, never personalize, never auto-invoke. User decides.

## Stack-specific notes

- **Runtime:** bun 1.3.x + turbo 2.x, workspaces `apps/*` + `packages/*`, `@yesid/*` naming, source-shipped packages (no dist).
- **Anti-drift stack (do not weaken):** tokens.json → write-if-changed generators → `parity.test.ts` byte-compare → root `ci:tokens` git-diff gate → `.githooks/pre-commit` GUARD 1. `.gitattributes` LF enforcement is load-bearing for the byte-compares.
- **Releases:** annotated git tags (`vX.Y.Z`). `v0.1.0` (parity) never moves; every brand change bumps past it. Update the push-to-figma count pin with a changelog comment whenever tokens.json gains/loses variables.
- **No formatter by design** at the parity line (yesid.dev has none); adopting one is a deliberate post-parity decision.
- **Consumers:** Transit and yesid.dev install exact immutable Releases through the self-vendored `tools/adopt.ts` bundle. Never edit either consumer's `vendor/design/` snapshot by hand; current receipts live in `CONSUMERS.md`.
