#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAll } from '../packages/tokens/src/build.ts';
import { replaceThemeRegion } from '../packages/tokens/src/generators/theme-block.ts';
import { parseTokens } from '../packages/tokens/src/parse.ts';

export const artifactPaths = [
  'DESIGN.md',
  'apps/gallery/src/app.css',
  'packages/motion/src/tokens.ts',
  'packages/tokens/tokens.css',
] as const;

export type ArtifactPath = (typeof artifactPaths)[number];
export type RepositoryBuild = Record<ArtifactPath, string>;

const defaultRoot = fileURLToPath(new URL('..', import.meta.url));

function read(root: string, path: string): string {
  return readFileSync(resolve(root, path), 'utf8').replaceAll('\r\n', '\n');
}

function entries(outputs: RepositoryBuild): [ArtifactPath, string][] {
  return artifactPaths.map((path) => [path, outputs[path]]);
}

function readUiInventory(root: string): {
  brandComponents: string[];
  primitiveSubpaths: string[];
} {
  const brandIndex = read(root, 'packages/ui/src/brand/index.ts');
  const brandComponents = [...brandIndex.matchAll(/^export \{ default as (\w+) \}/gm)].map(
    ([, name]) => name!,
  );
  const uiPackage = JSON.parse(read(root, 'packages/ui/package.json')) as {
    exports?: Record<string, unknown>;
  };
  const primitiveSubpaths = Object.entries(uiPackage.exports ?? {})
    .filter(([, conditions]) =>
      Object.values(conditions as Record<string, unknown>).some(
        (target) => typeof target === 'string' && target.includes('/primitives/'),
      ),
    )
    .map(([path]) => path)
    .map((path) => path.slice(2));

  if (brandComponents.length === 0 || primitiveSubpaths.length === 0) {
    throw new Error('Public @yesid/ui inventory is empty; refusing to generate stale DESIGN.md');
  }
  return { brandComponents, primitiveSubpaths };
}

export function createRepositoryBuild(root = defaultRoot): RepositoryBuild {
  const tree = parseTokens(JSON.parse(read(root, 'packages/tokens/tokens.json')));
  const inventory = readUiInventory(root);
  const outputs = buildAll({ tree, design: inventory });
  const appCss = replaceThemeRegion(
    read(root, 'apps/gallery/src/app.css'),
    outputs.themeBlock,
  );

  return {
    'DESIGN.md': outputs.designMd,
    'apps/gallery/src/app.css': appCss,
    'packages/motion/src/tokens.ts': outputs.motionTs,
    'packages/tokens/tokens.css': outputs.tokensCss,
  };
}

export function writeRepositoryBuild(root = defaultRoot): ArtifactPath[] {
  const changed: ArtifactPath[] = [];
  for (const [path, content] of entries(createRepositoryBuild(root))) {
    const absolutePath = resolve(root, path);
    const current = existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : null;
    if (current === content) continue;
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content, 'utf8');
    changed.push(path);
  }
  return changed;
}

function changedRepositoryArtifacts(root: string): ArtifactPath[] {
  return entries(createRepositoryBuild(root))
    .filter(([path, content]) => {
      const absolutePath = resolve(root, path);
      return !existsSync(absolutePath) || readFileSync(absolutePath, 'utf8') !== content;
    })
    .map(([path]) => path);
}

function cliOptions(args: string[]): { check: boolean; root: string } {
  let check = false;
  let root = defaultRoot;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--check') {
      check = true;
    } else if (argument === '--root') {
      const value = args[++index];
      if (!value) throw new Error('--root requires a path');
      root = resolve(value);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return { check, root };
}

if (import.meta.main) {
  const options = cliOptions(process.argv.slice(2));
  const changed = options.check
    ? changedRepositoryArtifacts(options.root)
    : writeRepositoryBuild(options.root);
  if (options.check && changed.length > 0) {
    for (const path of changed) console.error(`  stale ${path}`);
    console.error(`✗ generated token drift in ${changed.length} file(s)`);
    process.exitCode = 1;
  } else {
    for (const path of changed) console.log(`  wrote ${path}`);
    console.log(
      changed.length === 0
        ? '✓ build idempotent (no changes)'
        : `✓ build wrote ${changed.length} file(s)`,
    );
  }
}
