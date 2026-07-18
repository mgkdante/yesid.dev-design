# FLIP-THE-SWITCH — yesid.dev adopts the design system

> **This is an operator-run handoff prompt.** Run it as the opening message of
> a fresh Claude Code session **from the yesid.dev project** when you are ready
> to swap yesid.dev's local tokens/motion/gates for the extracted packages.
> Everything below the line is the prompt; paste it verbatim (adjust the two
> PREFLIGHT paths if your machine layout differs). Written by the P5.1 session
> (2026-07-02) from what was actually built — tags, paths and punch-list items
> are real, not placeholders.

---

Adopt the yesid.dev-design system in this repo (yesid.dev), in two strictly
separated phases: **parity flip first (zero visual change), optional bump
second (separate decision)**.

CONTEXT YOU CAN TRUST (verified at extraction time, 2026-07-02):
- The design repo is at `../yesid.dev-design` (bun+turbo monorepo:
  `packages/tokens` · `packages/motion` · `packages/gates` · `apps/gallery`).
- **`v0.1.0` is the PARITY TAG**: contents byte-faithful to THIS repo at commit
  `2bdb611d91749dc437c07586cb82129eabe9dfec` (branch
  `feat/conversion-hardening-batch`), with an exhaustive deviation register in
  its README (MOTION-1 gsap-util slim · $lib→relative import rewrites ·
  retargeted build paths · pruned actions barrel · gates refactored to
  reusable engines · tv()-only-in-ui minted).
- `v0.2.0` = v0.1.0 + the dataviz scale (transit's, additive — unused vars
  here, still zero visual change). Transit already consumes v0.2.0 in
  production via vendored-sync (transit PR #195), which proved the extracted
  gate behavior in a second product.
- Consumption pattern proven in transit: vendored snapshot + manifest
  (`tools/design-sync.ts`) + `file:` deps + re-export shims at the old import
  paths + provenance-header re-stamping in a thin `tools/tokens/build.ts`
  (copy those two files' patterns from transit `apps/web/`).

PHASE 0 — PREFLIGHT:
1. Confirm a clean working tree; create a branch off main.
2. `git -C ../yesid.dev-design tag -l` must show v0.1.0 and v0.2.0.

PHASE A — UPSTREAM THE INTERIM DRIFT (patch releases FIRST):
1. Diff THIS repo's CURRENT brand layers against the parity tag:
   - `packages/tokens/**` vs design `packages/tokens/**` (remember the design
     repo retargeted `build.ts` + `parity.test.ts` paths — diff the engine
     `src/**` + `tokens.json` only),
   - `apps/web/src/lib/motion/{actions/*,policy.ts,stores/reducedMotion.ts,utils/{device,gsap,lenis,sectionMagnet}.ts}`
     vs design `packages/motion/src/**` (mind the documented import rewrites),
   - `apps/web/src/tests/{style-regressions,contrast-floors}.test.ts` detection
     logic vs design `packages/gates/src/engines/**`; keep the concrete policy
     tables app-side.
2. Any change this repo made SINCE `2bdb611d` in those layers is interim drift:
   upstream each into `../yesid.dev-design` as patch/minor releases
   (v0.1.1… if it must land under the parity line for a byte-clean flip —
   rebuild + retag discipline per its README; otherwise v0.2.x+), so the flip
   target still equals this repo's current state. Do NOT fold unrelated
   beautification-era changes (v0.3.0+) into this phase.
3. If there is NO drift (diff empty), say so and move on.

PHASE B — THE FLIP (at the parity line, zero visual change):
1. Vendor the packages at the chosen parity-line tag (v0.1.0 or the v0.1.x you
   just cut) using transit's `design-sync` pattern (or `file:` deps straight at
   the sibling path if this repo's CI can see it — check `.github/workflows/`
   first; vendored-sync is the safe default).
2. Tokens: replace `packages/tokens`' engine consumption — keep THIS repo's
   `tokens.json` ONLY if Phase A proved it identical to the tag's (it should
   be); point `build.ts` imports at the vendored engine; re-stamp headers so
   the 4 generated outputs (`apps/web/src/lib/styles/tokens.css`, the
   `app.css` sentinel region, `apps/web/src/lib/motion/tokens.ts`, `DESIGN.md`)
   stay BYTE-IDENTICAL (`bun run ci:tokens` must be a no-op). Keep the
   pre-commit GUARD 1 pairing.
3. Motion: re-export shims at `apps/web/src/lib/motion/actions/*` +
   `utils/sectionMagnet.ts` pointing at `@yesid/motion` (zero component churn —
   all consumers go through those paths). Keep morphHover/scrollChain + the
   local fat `utils/gsap.ts` vendored HERE (they are Tier 2; the package's gsap
   util is deliberately slimmed — deviation MOTION-1).
4. Gates: re-seat `style-regressions.test.ts` (the FORBIDDEN-table part) and
   `contrast-floors.test.ts` (both engines) as thin configs on `@yesid/gates`.
   Move the existing 57 AA pairs, 2 terminal identities, forbidden patterns,
   color-mix configuration, and marker-file allowlist unchanged into one
   app-owned policy module with an exact contract test. Pass that policy to the
   engines explicitly. Historical parity tags still contain product preset
   subpaths, but new integration code must not depend on them; the prospective
   v0.7 contract removes them. KEEP the app-specific art-direction pinning
   tests local (they are the per-app taste contract, not brand gates).
   Optionally adopt the minted tv()-only-in-ui gate
   (uiRoot = `src/lib/components/ui`; badge/button/tabs-list/toggle pass as of
   the anchor).
5. PIXEL-ZERO-DIFF: before/after screenshots of `/`, `/about`, `/services`,
   `/projects`, `/blog`, `/contact`, `/stack` (+ one blog + one project detail)
   in BOTH themes; byte-diff the generated files; run the FULL existing gate
   battery (`turbo check/test/build`, `ci:tokens`, `ci:content`, e2e) — all
   green before merge.

PHASE C — OPTIONAL, A SEPARATE DECISION (do NOT fold into the flip PR):
- Deliberately bump to the newest design-system version (v0.2.0+dataviz —
  additive, zero visual — and any post-beautification v0.3.0+ tags, which DO
  change visuals). Each bump is its own PR with its own screenshot pass. Ask
  the operator which version, if any, before starting this phase.

RULES: never patch vendored package code (one-direction flow — upstream then
re-sync); consumers pin exact tags; keep every deviation you discover written
down; if anything makes zero-visual-change impossible, STOP and report before
merging anything.
