import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const SCRIPT = resolve(__dirname, '../push-to-figma.ts');

interface FigmaVariable {
  name: string;
  type: 'COLOR' | 'FLOAT' | 'STRING';
  values: Record<string, string | number>;
  description?: string;
}

function runScript(): FigmaVariable[] {
  const stdout = execSync(`bun run ${SCRIPT}`, { encoding: 'utf-8' });
  return JSON.parse(stdout) as FigmaVariable[];
}

describe('push-to-figma', () => {
  it('produces no name collisions across collections', () => {
    // Regression: in PR #61's use_figma push code, collection-prefix stripping
    // collapsed `shadow/card` and `color/card` to the same name. The output of
    // push-to-figma.ts itself must never contain duplicate names — even if a
    // downstream consumer wants to display them differently in Figma.
    const vars = runScript();
    const names = vars.map((v) => v.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes).toEqual([]);
  });

  it('keeps shadow/ prefix on Shadow collection variables', () => {
    // Shadow names retain the full path (shadow/card, shadow/glow-sm, ...).
    // If a future consumer strips the prefix, it must rename or scope to the
    // collection to avoid `card` collision with the Color collection.
    const vars = runScript();
    const shadowVars = vars.filter((v) => v.name.startsWith('shadow/'));
    expect(shadowVars.length).toBeGreaterThanOrEqual(6);
    expect(shadowVars.find((v) => v.name === 'shadow/card')).toBeDefined();
    expect(shadowVars.every((v) => v.type === 'STRING')).toBe(true);
  });

  it('keeps color/ prefix on Color collection variables (so color/card stays distinct)', () => {
    const vars = runScript();
    const colorCard = vars.find((v) => v.name === 'color/card');
    expect(colorCard).toBeDefined();
    expect(colorCard?.type).toBe('COLOR');
    // color/card has dark + light modes; never `default` (themed pair, not brand)
    expect(Object.keys(colorCard!.values).sort()).toEqual(['dark', 'light']);
  });

  it('produces 133 variables (GO2-W5 round-4 doctrine baseline)', () => {
    // Sanity check on the overall count. 82 at GO-W2.2 (69 after
    // slice-design's trim + 13: 3 theme-moded colors, 6 surface aliases,
    // 3 border aliases, shadow/sheet). GO2-W5 adds 19: 7 theme-invariant
    // signal-systems tokens (hazard-a/b, signage-bg/text, signal-
    // proceed/caution/stop) + 12 per-mode pairs that merge to one variable
    // each (terminal-chrome, terminal-ink, terminal-ink-muted, signal-lunar,
    // lamp-bezel, line-amber, accent-surface, grid-line-major/minor,
    // grid-block-marker, grid-glow, edge-highlight). destructive-foreground
    // moved brand → per-mode, which re-modes the existing variable without
    // changing the count. Taste round 2 adds 2: the BOLD structural rules
    // border/rule + border/rule-accent (solid orange / yellow voices).
    // Round 4 adds 1: color/reflective — the theme-invariant WHITE voice of
    // the four-color infrastructure doctrine.
    // Typography token system (listing/detail consolidation) adds 24 number
    // variables: detail-body, nav, menu, tag, metric-chip, card title/body/meta,
    // back-link and control sizes across mobile + desktop scales.
    // Glow token system adds 1: color/glow — the theme-invariant decorative
    // glow color (glows ride --glow, vivid in both themes; never text, so not
    // AA-bound), so glows read in light without per-component overrides.
    // consolidation-vibe-style-fixes adds 4: shadow/cta + shadow/cta-hover
    // (hero CTA shadow folded into tokens) and z/overlay + z/ripple (modal and
    // ripple z-index tiers above nav).
    // yesid.dev-design v0.2.0 adds 23: the dataviz scale reconciled from
    // transit (status 5, occupancy 5, severity 3, heatmap 10 — per-mode pairs
    // that merge to one moded color/dataviz-* variable each). 133 was the
    // v0.1.0 parity-anchor count (yesid.dev @ 2bdb611d).
    const vars = runScript();
    expect(vars.length).toBe(156);
  });

  it('theme re-pins of brand names merge as modes of one variable (no duplicates)', () => {
    // GO-W2.2: color.dark.primary + color.light.primary collapse onto the
    // brand color/primary variable as dark/light modes alongside default.
    const vars = runScript();
    const primary = vars.filter((v) => v.name === 'color/primary');
    expect(primary).toHaveLength(1);
    expect(Object.keys(primary[0]!.values).sort()).toEqual(['dark', 'default', 'light']);
  });

  it('every variable has at least one value mode', () => {
    const vars = runScript();
    for (const v of vars) {
      const modes = Object.keys(v.values);
      expect(modes.length).toBeGreaterThan(0);
    }
  });
});
