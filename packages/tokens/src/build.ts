import { generateDesignMd } from './generators/design-md.ts';
import { generateMotionTs } from './generators/motion-ts.ts';
import { generateThemeBlock } from './generators/theme-block.ts';
import { generateTokensCss } from './generators/tokens-css.ts';
import type { TokenTree } from './types.ts';

const generators = {
  designMd: generateDesignMd,
  motionTs: generateMotionTs,
  themeBlock: generateThemeBlock,
  tokensCss: generateTokensCss,
} as const;

export type BuildTarget = keyof typeof generators;
export type BuildOutputs = Partial<Record<BuildTarget, string>>;

export interface BuildRequest {
  tree: TokenTree;
  targets?: readonly BuildTarget[];
}

const allTargets = Object.keys(generators) as BuildTarget[];

export function buildAll({ tree, targets = allTargets }: BuildRequest): BuildOutputs {
  return Object.fromEntries(targets.map((target) => [target, generators[target](tree)]));
}
