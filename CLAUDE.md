# CLAUDE.md — yesid.dev-design (Claude Code entry point)

> **Read [AGENTS.md](AGENTS.md) first.** Workflow contract lives there — tool-agnostic, shared with Codex.

## Project context

- **Project:** yesid.dev-design — the yesid brand's styling foundation (tokens · motion · gates · gallery)
- **Stack:** bun 1.3.x · turbo 2.x · TypeScript · SvelteKit (gallery) · Tailwind v4 CSS-first
- **Workflow:** workflow-overlord 3.x plugin (Notion-backed shared state)
- **Parity law:** `v0.1.0` = byte-faithful to yesid.dev @ `2bdb611d` and never moves; all changes bump past it. Governance laws in [README.md](README.md).

## Build commands

- `bun install` — workspace install
- `bun run tokens:build` — regenerate the 4 token outputs (idempotent)
- `bun run ci:tokens` — build + git-diff drift gate
- `bun run test` / `bun run check` / `bun run build` — turbo across the workspace
- `bun run --cwd apps/gallery dev` — the living gallery
- `bun run setup:hooks` — enable .githooks (generated-files guard)

## Workflow commands

- `/workflow-overlord` — orchestrator · `/workflow-overlord-slice-open <SUMMARY>` · `/workflow-overlord-slice-pick <slice>` · `/workflow-overlord-slice-implement` · `/workflow-overlord-slice-close <slice>` · `/workflow-overlord-status`

## Portability

This file can be deleted without breaking the workflow — Codex runs off `AGENTS.md` alone. `CLAUDE.md` exists only for Claude Code's auto-load convention.
