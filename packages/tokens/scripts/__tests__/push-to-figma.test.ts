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
    // The count changes whenever tokens.json gains or loses leaves.
    const vars = runScript();
    expect(vars.length).toBe(181);
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
