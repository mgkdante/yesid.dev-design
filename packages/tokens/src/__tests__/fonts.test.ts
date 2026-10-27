import { describe, it, expect } from 'vitest';
import { preloadFont } from '../fonts.ts';

describe('preloadFont', () => {
  it.each([
    '/_app/immutable/assets/inter-latin-wght-normal.Cx9a1b2.woff2',
    '/assets/jetbrains-mono-latin-wght-normal-AbC123.woff2',
    'inter-latin-wght-normal.woff2',
    'jetbrains-mono-latin-wght-normal.woff2',
  ])('preloads %s', (path) => {
    expect(preloadFont(path)).toBe(true);
  });

  it.each([
    '/assets/inter-latin-ext-wght-normal.Cx9a1b2.woff2',
    'jetbrains-mono-latin-ext-wght-normal.woff2',
    '/assets/inter-latin-wght-normal.Cx9a1b2.woff',
    '/assets/logo.woff2',
    '/_app/immutable/chunks/app.js',
  ])('does not preload %s', (path) => {
    expect(preloadFont(path)).toBe(false);
  });
});
