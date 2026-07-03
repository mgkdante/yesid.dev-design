import { describe, it, expect } from 'vitest';
import { generateDesignMd } from '../generators/design-md.ts';
import type { TokenTree } from '../types.ts';

const fixture: TokenTree = {
  color: {
    brand: { primary: { $type: 'color', $value: '#E07800' } },
    dark: { background: { $type: 'color', $value: '#141414' } },
    light: { background: { $type: 'color', $value: '#FAFAF8' } },
  },
  text: { display: { $type: 'yesid.clamp', $value: { min: '2.5rem', preferred: '5vw', max: '4rem' } } },
  radius: { md: { $type: 'dimension', $value: '8px' } },
  space: { 'page-x': { $type: 'yesid.clamp', $value: { min: '1.5rem', preferred: '4vw', max: '5rem' } } },
};

describe('generateDesignMd', () => {
  const md = generateDesignMd(fixture);

  it('starts with YAML front matter', () => {
    expect(md.startsWith('---\n')).toBe(true);
    expect(md).toMatch(/version:\s*alpha/);
    expect(md).toMatch(/name:\s*yesid\.dev/);
  });

  it('includes colors / typography / rounded / spacing maps', () => {
    // colors emitted flat (brand + dark semantic tokens; no nested brand:/dark: sub-keys)
    expect(md).toMatch(/colors:\n  primary:\s*"#E07800"/);
    // typography fontSize uses the clamp max value (a valid spec dimension, not a clamp expression)
    expect(md).toMatch(/typography:[\s\S]*display:[\s\S]*fontSize:\s*"4rem"/);
    expect(md).toMatch(/rounded:[\s\S]*md:\s*"8px"/);
    expect(md).toMatch(/spacing:[\s\S]*"page-x":\s*"clamp\(/);
  });

  it('emits the 8 prose sections in order', () => {
    const sections = ['## Overview', '## Colors', '## Typography', '## Layout', '## Elevation & Depth', '## Shapes', '## Components', "## Do's and Don'ts"];
    let last = -1;
    for (const s of sections) {
      const idx = md.indexOf(s);
      expect(idx, `${s} missing or out of order`).toBeGreaterThan(last);
      last = idx;
    }
  });

  it('includes the GENERATED warning in the body', () => {
    expect(md).toContain('GENERATED FROM packages/tokens/tokens.json');
  });

  it('dedupes theme-level overrides of brand color names (no duplicate YAML keys)', () => {
    const treeWithOverride: TokenTree = {
      ...fixture,
      color: {
        brand: { primary: { $type: 'color', $value: '#E07800' } },
        dark: {
          primary: { $type: 'color', $value: '#E07800' },
          background: { $type: 'color', $value: '#141414' },
        },
        light: {},
      },
    };
    const dedupedMd = generateDesignMd(treeWithOverride);
    const primaryLines = dedupedMd.split('\n').filter((l) => /^\s+primary:/.test(l));
    expect(primaryLines).toHaveLength(1);
  });
});
