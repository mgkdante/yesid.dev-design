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
    // Collection prefixes are part of the public variable name. In particular,
    // `shadow/card` and `color/card` must never collapse to the same name.
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
    // Current projection: 67 color + 3 font + 35 text + 1 size + 3 space +
    // 5 radius + 9 shadow + 6 surface + 5 border + 8 z + 5 duration + 4 ease +
    // 4 opacity + 4 breakpoint + 2 container variables = 161. The color set
    // includes theme modes, signal-system and dataviz scales, reflective and
    // decorative-glow roles; same-name themed pairs merge into one variable.
    // Structural rules, CTA shadows, overlay/ripple tiers, canonical breakpoint
    // dimensions and the semantic strip height are part of this count.
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
    // Theme-specific primary values merge into the brand color/primary variable
    // as dark/light modes alongside default.
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
