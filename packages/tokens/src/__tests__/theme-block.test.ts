import { describe, it, expect } from 'vitest';
import { generateThemeBlock, replaceThemeRegion } from '../generators/theme-block.ts';
import type { TokenTree } from '../types.ts';

const fixture: TokenTree = {
  radius: { sm: { $type: 'dimension', $value: '4px' } },
  text: { body: { $type: 'dimension', $value: '1rem' } },
};

describe('generateThemeBlock', () => {
  it('emits a Tailwind @theme block', () => {
    const out = generateThemeBlock(fixture);
    expect(out).toContain('@theme {');
    expect(out).toContain('--radius-sm: 4px;');
    expect(out).toContain('--text-body: 1rem;');
    expect(out).toContain('}');
  });

  it('wraps with sentinel comments', () => {
    const out = generateThemeBlock(fixture);
    expect(out).toMatch(/\/\* ===== TOKENS:START ===== \*\//);
    expect(out).toMatch(/\/\* ===== TOKENS:END ===== \*\//);
  });
});

describe('replaceThemeRegion', () => {
  it('replaces only the sentinel region, preserving the rest', () => {
    const original = `/* prelude */
/* ===== TOKENS:START ===== */
@theme { --old: 1; }
/* ===== TOKENS:END ===== */
/* postlude */`;
    const fresh = '/* ===== TOKENS:START ===== */\n@theme { --new: 2; }\n/* ===== TOKENS:END ===== */';
    const result = replaceThemeRegion(original, fresh);
    expect(result).toContain('/* prelude */');
    expect(result).toContain('--new: 2;');
    expect(result).not.toContain('--old: 1;');
    expect(result).toContain('/* postlude */');
  });

  it('throws if sentinels are missing (refuse to corrupt the file)', () => {
    expect(() => replaceThemeRegion('no sentinels here', '...')).toThrow(/sentinel/);
  });
});
