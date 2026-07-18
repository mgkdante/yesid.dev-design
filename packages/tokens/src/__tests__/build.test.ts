import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildAll } from '../build.ts';
import { generateDesignMd } from '../generators/design-md.ts';
import { generateMotionTs } from '../generators/motion-ts.ts';
import { generateThemeBlock } from '../generators/theme-block.ts';
import { generateTokensCss } from '../generators/tokens-css.ts';
import { parseTokens } from '../parse.ts';

const tree = parseTokens(
  JSON.parse(readFileSync(new URL('../../tokens.json', import.meta.url), 'utf8')),
);

describe('buildAll', () => {
  it('returns a deterministic logical output map', () => {
    const outputs = buildAll({ tree });

    expect(outputs).toEqual({
      designMd: generateDesignMd(tree),
      motionTs: generateMotionTs(tree),
      themeBlock: generateThemeBlock(tree),
      tokensCss: generateTokensCss(tree),
    });
  });

  it('builds only explicitly selected targets', () => {
    const outputs = buildAll({ tree, targets: ['tokensCss', 'motionTs'] });

    expect(outputs).toEqual({
      motionTs: generateMotionTs(tree),
      tokensCss: generateTokensCss(tree),
    });
    expect(Object.keys(outputs)).not.toContain(expect.stringContaining('/'));
  });

  it('does not mutate its input and returns identical UTF-8 bytes', () => {
    const snapshot = structuredClone(tree);
    const first = buildAll({ tree });
    const second = buildAll({ tree });

    expect(tree).toEqual(snapshot);
    for (const target of Object.keys(first) as (keyof typeof first)[]) {
      expect(Buffer.from(second[target], 'utf8')).toEqual(Buffer.from(first[target], 'utf8'));
    }
  });
});
