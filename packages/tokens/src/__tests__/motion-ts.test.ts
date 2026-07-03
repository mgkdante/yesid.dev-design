import { describe, it, expect } from 'vitest';
import { generateMotionTs } from '../generators/motion-ts.ts';
import type { TokenTree } from '../types.ts';

const fixture: TokenTree = {
  duration: {
    fast: { $type: 'duration', $value: '150ms' },
    normal: { $type: 'duration', $value: '200ms' },
  },
  ease: {
    default: { $type: 'cubicBezier', $value: 'cubic-bezier(0.4, 0, 0.2, 1)' },
    'in-out': { $type: 'cubicBezier', $value: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  },
};

describe('generateMotionTs', () => {
  const out = generateMotionTs(fixture);

  it('starts with a GENERATED header', () => {
    expect(out.startsWith('// GENERATED FROM packages/tokens/tokens.json — DO NOT EDIT')).toBe(true);
  });

  it('exports duration as a const object with ms numbers', () => {
    expect(out).toMatch(/export const duration = \{[\s\S]*fast: 150,[\s\S]*normal: 200,[\s\S]*\} as const;/);
  });

  it('exports ease with camelCase keys', () => {
    expect(out).toContain('inOut:');
  });

  it('exports type aliases and durationSec helper', () => {
    expect(out).toContain('export type DurationKey');
    expect(out).toContain('export type EaseKey');
    expect(out).toContain('export function durationSec');
  });
});
