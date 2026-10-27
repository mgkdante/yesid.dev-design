import { describe, it, expect } from 'vitest';
import { generateTokensCss } from '../generators/tokens-css.ts';
import type { TokenTree } from '../types.ts';

const fixture: TokenTree = {
  color: {
    brand: { primary: { $type: 'color', $value: '#E07800' } },
    dark: {
      background: { $type: 'color', $value: '#141414' },
      'accent-foreground': { $type: 'color', $value: '#141414' },
    },
    light: {
      background: { $type: 'color', $value: '#FAFAF8' },
      primary: { $type: 'color', $value: '#A65600' },
      'accent-foreground': { $type: 'color', $value: '#111111' },
    },
  },
  surface: {
    '1': { $type: 'string', $value: 'var(--background)' },
  },
  radius: {
    sm: { $type: 'dimension', $value: '4px' },
  },
  size: {
    stripH: { $type: 'dimension', $value: '68px' },
  },
  duration: {
    fast: { $type: 'duration', $value: '150ms' },
  },
  text: {
    body: { $type: 'dimension', $value: '1.125rem' },
    title: { $type: 'dimension', $value: '2rem' },
  },
  breakpoint: {
    'tablet-min': { $type: 'dimension', $value: '768px' },
    'tablet-max': { $type: 'dimension', $value: '767px' },
    'desktop-min': { $type: 'dimension', $value: '1024px' },
    'desktop-max': { $type: 'dimension', $value: '1023px' },
  },
};

describe('generateTokensCss', () => {
  const css = generateTokensCss(fixture);

  it('begins with a GENERATED header', () => {
    expect(css.startsWith('/* GENERATED FROM packages/tokens/tokens.json - DO NOT EDIT */')).toBe(true);
  });

  it('emits DTCG breakpoint values as custom media before style rules', () => {
    const expectedPrelude = [
      '@custom-media --tablet-min (min-width: 768px);',
      '@custom-media --tablet-max (max-width: 767px);',
      '@custom-media --desktop-min (min-width: 1024px);',
      '@custom-media --desktop-max (max-width: 1023px);',
    ].join('\n');

    expect(css).toContain(expectedPrelude);
    expect(css.indexOf(expectedPrelude)).toBeLessThan(css.indexOf(':root'));
  });

  it('emits brand tokens at :root', () => {
    expect(css).toMatch(/:root\s*\{[\s\S]*--primary:\s*#E07800;[\s\S]*\}/);
  });

  it('emits dark tokens under [data-theme="dark"]', () => {
    expect(css).toMatch(/\[data-theme="dark"\][\s\S]*--background:\s*#141414;/);
  });

  it('emits light tokens under [data-theme="light"]', () => {
    expect(css).toMatch(/\[data-theme="light"\][\s\S]*--background:\s*#FAFAF8;/);
  });

  it('emits light theme override of a brand token (cascade: light block beats :root)', () => {
    expect(css).toMatch(/\[data-theme="light"\][\s\S]*--primary:\s*#A65600;/);
  });

  it('emits color-scheme per theme block and per media fallback', () => {
    expect(css).toMatch(/\[data-theme="dark"\], \.theme-dark \{\n  color-scheme: dark;/);
    expect(css).toMatch(/\[data-theme="light"\], \.theme-light \{\n  color-scheme: light;/);
    expect(css).toMatch(/prefers-color-scheme: dark\) \{\n  :root:not\(\[data-theme="light"\]\) \{\n    color-scheme: dark;/);
    expect(css).toMatch(/prefers-color-scheme: light\) \{\n  :root:not\(\[data-theme="dark"\]\) \{\n    color-scheme: light;/);
  });

  it('skips a paired alias when the theme defines the token explicitly', () => {
    const lightBlock = css.match(/\[data-theme="light"\], \.theme-light \{([\s\S]*?)\n\}/)![1];
    expect(lightBlock).toContain('--accent-foreground: #111111;');
    expect(lightBlock).not.toContain('--accent-foreground: var(--background);');
    // unaffected paired aliases still emitted
    expect(lightBlock).toContain('--card-foreground: var(--foreground);');
  });

  it('emits surface alias groups into :root as var() references', () => {
    expect(css).toMatch(/:root\s*\{[\s\S]*--surface-1:\s*var\(--background\);[\s\S]*\}/);
  });

  it('emits radius and duration in :root', () => {
    expect(css).toMatch(/--radius-sm:\s*4px;/);
    expect(css).toMatch(/--duration-fast:\s*150ms;/);
  });

  it('emits the semantic strip height with its frozen public CSS name', () => {
    expect(css.match(/  --strip-h: 68px;/g)).toHaveLength(1);
    expect(css).not.toContain('--size-stripH');
    expect(css).not.toContain('--size-strip-h');
  });
});

describe('generateTokensCss density modes', () => {
  const body = { $type: 'dimension', $value: '1rem' };
  const withDensity = (density: unknown): TokenTree => ({ ...fixture, density }) as TokenTree;
  const compactCss = generateTokensCss(withDensity({ compact: { text: { body } } }));

  it('emits a compact block after the theme blocks with the overridden values', () => {
    const block = compactCss.match(/\[data-density="compact"\] \{([\s\S]*?)\n\}/)![1];

    expect(block).toContain('--text-body: 1rem;');
    expect(block).not.toContain('--text-title');
    expect(compactCss.indexOf('[data-density="compact"]')).toBeGreaterThan(
      compactCss.lastIndexOf('prefers-color-scheme: light'),
    );
  });

  it('keeps density leaves out of :root', () => {
    const root = compactCss.match(/:root \{([\s\S]*?)\n\}/)![1];

    expect(root).toContain('--text-body: 1.125rem;');
    expect(root).not.toContain('--text-body: 1rem;');
  });

  it('throws for a flat override name', () => {
    expect(() => generateTokensCss(withDensity({ compact: { 'text-body': body } }))).toThrow(
      /density\.compact\.text-body overrides no base token/,
    );
  });

  it('throws when a mode is a leaf', () => {
    expect(() => generateTokensCss(withDensity({ compact: body }))).toThrow(
      /density\.compact must be a token group/,
    );
  });

  it('throws when an override path is missing from the base tree', () => {
    expect(() => generateTokensCss(withDensity({ compact: { text: { missing: body } } }))).toThrow(
      /density\.compact\.text\.missing overrides no base token/,
    );
  });
});
