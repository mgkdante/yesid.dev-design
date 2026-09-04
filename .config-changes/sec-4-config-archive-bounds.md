---
bump: patch
---

Bound config archive and checksum reads, compare deterministic tagged bytes before parsing, and enforce compressed, expanded, member, payload, entry, and command-execution limits. Starting with `config-v0.2.2`, assets record explicit directory entries for allowlisted nested paths while preserving the npm-compatible `package/` layout; older immutable assets keep their historical layout.
