import { describe, it, expect } from 'vitest';
import { serializeCss, serializeYaml } from '../serialize.ts';
import type { Token } from '../types.ts';

describe('serializeCss', () => {
  it('formats clamp tokens', () => {
    const t: Token = { $type: 'yesid.clamp', $value: { min: '2.5rem', preferred: '5vw', max: '4rem' } };
    expect(serializeCss(t)).toBe('clamp(2.5rem, 5vw, 4rem)');
  });

  it('passes through primitive values', () => {
    expect(serializeCss({ $type: 'dimension', $value: '4px' })).toBe('4px');
    expect(serializeCss({ $type: 'color', $value: '#E07800' })).toBe('#E07800');
    expect(serializeCss({ $type: 'duration', $value: '200ms' })).toBe('200ms');
  });

  it('stringifies numbers without unit', () => {
    expect(serializeCss({ $type: 'number', $value: 70 })).toBe('70');
    expect(serializeCss({ $type: 'number', $value: 0.6 })).toBe('0.6');
  });
});

describe('serializeYaml (DESIGN.md)', () => {
  it('flattens clamp to a quoted string', () => {
    const t: Token = { $type: 'yesid.clamp', $value: { min: '2.5rem', preferred: '5vw', max: '4rem' } };
    expect(serializeYaml(t)).toBe('"clamp(2.5rem, 5vw, 4rem)"');
  });

  it('quotes string-valued primitives', () => {
    expect(serializeYaml({ $type: 'color', $value: '#E07800' })).toBe('"#E07800"');
  });

  it('emits unquoted numbers', () => {
    expect(serializeYaml({ $type: 'number', $value: 70 })).toBe('70');
  });
});
