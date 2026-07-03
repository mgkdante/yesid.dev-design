import { describe, it, expect } from 'vitest';
import { parseTokens, isClampToken, isPrimitive } from '../parse.ts';

const fixture = {
  color: {
    brand: {
      primary: { $type: 'color', $value: '#E07800' },
    },
  },
  text: {
    display: {
      $type: 'yesid.clamp',
      $value: { min: '2.5rem', preferred: '5vw', max: '4rem' },
    },
  },
};

describe('parseTokens', () => {
  it('returns the parsed tree unchanged on valid input', () => {
    const result = parseTokens(fixture);
    expect(result).toEqual(fixture);
  });

  it('throws on missing $type at a leaf', () => {
    expect(() => parseTokens({ x: { $value: '#fff' } })).toThrow(/missing \$type/);
  });

  it('throws on yesid.clamp without min/preferred/max', () => {
    expect(() =>
      parseTokens({ x: { $type: 'yesid.clamp', $value: { min: '1rem' } } as never }),
    ).toThrow(/yesid\.clamp value missing/);
  });
});

describe('isClampToken / isPrimitive', () => {
  it('discriminates clamp tokens', () => {
    expect(isClampToken(fixture.text.display)).toBe(true);
    expect(isClampToken(fixture.color.brand.primary)).toBe(false);
  });

  it('discriminates primitives', () => {
    expect(isPrimitive(fixture.color.brand.primary)).toBe(true);
    expect(isPrimitive(fixture.text.display)).toBe(false);
  });
});
