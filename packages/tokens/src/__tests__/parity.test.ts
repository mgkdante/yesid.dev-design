import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import tokens from '../../tokens.json' with { type: 'json' };
import { parseTokens } from '../parse.ts';
import { generateTokensCss } from '../generators/tokens-css.ts';
import { generateThemeBlock, replaceThemeRegion } from '../generators/theme-block.ts';
import { generateMotionTs } from '../generators/motion-ts.ts';
import { generateDesignMd } from '../generators/design-md.ts';

// Ported from yesid.dev @ 2bdb611d — target paths retargeted to this repo's
// consumers (see build.ts). The byte-compare pattern is the drift gate.
const repoRoot = resolve(process.cwd(), '../..');
const tree = parseTokens(tokens);

function read(rel: string): string {
  return readFileSync(resolve(repoRoot, rel), 'utf-8');
}

describe('parity — generated outputs match committed files', () => {
  it('both tokens.css targets match the generator and each other', () => {
    const expected = generateTokensCss(tree);
    const galleryCss = read('apps/gallery/src/lib/styles/tokens.css');
    const packageCss = read('packages/tokens/tokens.css');
    expect(galleryCss).toBe(expected);
    expect(packageCss).toBe(expected);
    expect(packageCss).toBe(galleryCss);
  });

  it('apps/gallery/src/app.css @theme region matches generator', () => {
    const fresh = generateThemeBlock(tree);
    const file = read('apps/gallery/src/app.css');
    const expected = replaceThemeRegion(file, fresh);
    expect(file).toBe(expected);
  });

  it('packages/motion/src/tokens.ts matches generator', () => {
    const expected = generateMotionTs(tree);
    const actual = read('packages/motion/src/tokens.ts');
    expect(actual).toBe(expected);
  });

  it('DESIGN.md matches generator', () => {
    const expected = generateDesignMd(tree);
    const actual = read('DESIGN.md');
    expect(actual).toBe(expected);
  });
});
