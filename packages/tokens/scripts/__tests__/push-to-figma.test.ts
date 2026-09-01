import { describe, it, expect } from 'vitest';
import tokens from '../../tokens.json' with { type: 'json' };
import { parseTokens } from '../../src/parse.ts';
import { buildVariables, type FigmaVariable } from '../push-to-figma.ts';

const tree = parseTokens(tokens);

function runScript(): FigmaVariable[] {
  return buildVariables(tree);
}

describe('push-to-figma', () => {
  it('produces no name collisions across collections', () => {
    // Removing collection prefixes during a use_figma push would have
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

  it('produces 161 variables', () => {
    // Sanity check on the starting count: 69 after the package trim, plus 13
    // additions, for 82: 3 theme-moded colors, 6 surface aliases,
    // 3 border aliases and shadow/sheet. The next 19 are 7 theme-invariant
    // signal-systems tokens (hazard-a/b, signage-bg/text, signal-
    // proceed/caution/stop) + 12 per-mode pairs that merge to one variable
    // each (terminal-chrome, terminal-ink, terminal-ink-muted, signal-lunar,
    // lamp-bezel, line-amber, accent-surface, grid-line-major/minor,
    // grid-block-marker, grid-glow, edge-highlight). destructive-foreground
    // moved brand → per-mode, which re-modes the existing variable without
    // changing the count. Two BOLD structural-rule variables add
    // border/rule + border/rule-accent (solid orange / yellow voices).
    // One color/reflective variable carries the theme-invariant WHITE voice of
    // the four-color infrastructure doctrine.
    // Typography token system (listing/detail consolidation) adds 24 number
    // variables: detail-body, nav, menu, tag, metric-chip, card title/body/meta,
    // back-link and control sizes across mobile + desktop scales.
    // Glow token system adds 1: color/glow — the theme-invariant decorative
    // glow color (glows ride --glow, vivid in both themes; never text, so not
    // AA-bound), so glows read in light without per-component overrides.
    // Four variables cover shadow/cta + shadow/cta-hover
    // (hero CTA shadow folded into tokens) and z/overlay + z/ripple (modal and
    // ripple z-index tiers above nav).
    // The dataviz scale contributes 23 variables:
    // status 5, occupancy 5, severity 3 and heatmap 10, with per-mode pairs
    // that merge to one moded color/dataviz-* variable each. 133 was the
    // prior parity-anchor count.
    // Four canonical breakpoint dimensions cover tablet min/max and
    // desktop min/max.
    // One semantic strip composite dimension is size/stripH.
    const vars = runScript();
    expect(vars.length).toBe(161);
  });

  it('preserves the semantic strip height name, value, and description', () => {
    const vars = runScript();
    const stripH = vars.find((v) => v.name === 'size/stripH');
    expect(stripH).toEqual({
      name: 'size/stripH',
      type: 'STRING',
      values: { default: '68px' },
      description:
        'Strip composite height: 3px hazard tape + band. Consumers derive band padding by subtracting tape and chip.',
    });
  });

  it('theme re-pins of brand names merge as modes of one variable (no duplicates)', () => {
    // Theme-specific primary values merge onto the
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
