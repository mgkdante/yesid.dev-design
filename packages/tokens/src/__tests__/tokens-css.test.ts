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
  duration: {
    fast: { $type: 'duration', $value: '150ms' },
  },
};

describe('generateTokensCss', () => {
  const css = generateTokensCss(fixture);

  it('begins with a GENERATED header', () => {
    expect(css.startsWith('/* GENERATED FROM packages/tokens/tokens.json - DO NOT EDIT */')).toBe(true);
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
});
