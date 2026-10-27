import { describe, it, expect } from 'vitest';
import { generateThemeCss } from '../generators/theme-css.ts';
import type { TokenTree } from '../types.ts';

const fixture: TokenTree = {
  text: { body: { $type: 'dimension', $value: '1rem' } },
  tracking: { eyebrow: { $type: 'dimension', $value: '0.1em' } },
  z: { footer: { $type: 'number', $value: 40 } },
};

describe('generateThemeCss', () => {
  const css = generateThemeCss(fixture);

  it('maps token groups into the Tailwind @theme block', () => {
    const theme = css.match(/@theme \{([\s\S]*?)\n\}/)![1];

    expect(theme).toContain('--text-body: 1rem;');
    expect(theme).toContain('--tracking-eyebrow: var(--tracking-eyebrow);');
    expect(theme).toContain('--z-index-footer: var(--z-footer);');
  });

  it('carries the semantic color map in @theme inline', () => {
    const inline = css.match(/@theme inline \{([\s\S]*?)\n\}/)![1];

    expect(inline).toContain('--color-primary: var(--primary);');
    expect(inline).toContain('--color-muted-foreground: var(--muted-foreground);');
  });

  it('is deterministic', () => {
    expect(generateThemeCss(fixture)).toBe(css);
  });
});
