import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import gallerySvelteConfig from '../svelte.config.js';
import uiSvelteConfig from '../../../packages/ui/svelte.config.js';

type JsonObject = Record<string, unknown>;
type ProjectRunes = (options: { filename: string }) => true | undefined;
type SvelteConfig = {
	compilerOptions?: {
		runes?: ProjectRunes;
	};
};

const REPOSITORY_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const LIBRARY_PRESET = '@yesid/config/tsconfig/library.json';
const SVELTE_KIT_PRESET = '@yesid/config/tsconfig/svelte-kit.json';
const PROJECT_RUNES_EXPORT = '@yesid/config/svelte/project-runes.js';
const TURBO_DIGEST = '588a4acf72f44593561112fc945d410548b56cf556bbbc9bc745c1f7b218424f';

function text(path: string): string {
	return readFileSync(join(REPOSITORY_ROOT, path), 'utf8');
}

function json(path: string): JsonObject {
	return JSON.parse(text(path)) as JsonObject;
}

const LIBRARY_CONFIGS = [
	[
		'tsconfig.tools.json',
		{
			extends: LIBRARY_PRESET,
			compilerOptions: {
				esModuleInterop: true,
				module: 'ESNext',
				noUncheckedIndexedAccess: true,
				types: ['node'],
			},
			include: ['tools/**/*.ts'],
		},
	],
	[
		'packages/tokens/tsconfig.json',
		{
			extends: LIBRARY_PRESET,
			compilerOptions: {
				module: 'ESNext',
				noUncheckedIndexedAccess: true,
				esModuleInterop: true,
				resolveJsonModule: true,
				lib: ['ES2022'],
				types: ['node'],
			},
			include: ['**/*.ts', 'tokens.json'],
		},
	],
	[
		'packages/motion/tsconfig.json',
		{
			extends: LIBRARY_PRESET,
			compilerOptions: {
				module: 'ES2022',
				types: ['node'],
				lib: ['ES2022', 'DOM', 'DOM.Iterable'],
				paths: {
					'$lib/motion/*': ['./src/*'],
				},
			},
			include: ['src/**/*.ts', 'vitest.config.ts'],
		},
	],
	[
		'packages/gates/tsconfig.json',
		{
			extends: LIBRARY_PRESET,
			compilerOptions: {
				module: 'ES2022',
				noUncheckedIndexedAccess: true,
				types: ['node'],
			},
			include: ['src/**/*.ts'],
		},
	],
	[
		'packages/ui/tsconfig.json',
		{
			extends: LIBRARY_PRESET,
			compilerOptions: {
				module: 'ES2022',
				isolatedModules: true,
				types: ['node', 'vitest/globals'],
				lib: ['ES2022', 'DOM', 'DOM.Iterable'],
			},
			include: ['src/**/*.ts', 'src/**/*.svelte', 'svelte.config.js', 'vitest.config.ts'],
		},
	],
] as const;

describe('Design shared-config canary', () => {
	it('pins the exact config workspace version once at the root', () => {
		const manifest = json('package.json') as {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		const resolutions = [
			manifest.dependencies?.['@yesid/config'],
			manifest.devDependencies?.['@yesid/config'],
		].filter((value): value is string => value !== undefined);

		expect(resolutions).toEqual(['workspace:0.2.0']);
	});

	it.each(LIBRARY_CONFIGS)('%s extends the library preset with only its local overlay', (path, expected) => {
		expect(json(path)).toEqual(expected);
	});

	it('composes the Gallery generated config with the shared SvelteKit preset', () => {
		expect(json('apps/gallery/tsconfig.json')).toEqual({
			extends: ['./.svelte-kit/tsconfig.json', SVELTE_KIT_PRESET],
		});
	});

	it.each([
		['apps/gallery/svelte.config.js', 'apps/gallery', gallerySvelteConfig],
		['packages/ui/svelte.config.js', 'packages/ui', uiSvelteConfig],
	] as const)('%s consumes the shared project-runes policy', (configPath, projectPath, configValue) => {
		expect(text(configPath)).toContain(`from '${PROJECT_RUNES_EXPORT}'`);
		const runes = (configValue as SvelteConfig).compilerOptions?.runes;
		expect(runes).toBeTypeOf('function');
		if (typeof runes !== 'function') return;

		const root = join(REPOSITORY_ROOT, projectPath);
		expect(runes({ filename: join(root, 'src', 'Component.svelte') })).toBe(true);
		expect(runes({ filename: join(root, 'node_modules', 'package', 'Component.svelte') })).toBeUndefined();
	});

	it('keeps the checked-in Turbo target byte-identical to the digest-bound source', () => {
		const source = readFileSync(join(REPOSITORY_ROOT, 'packages/config/turbo/base.json'));
		const target = readFileSync(join(REPOSITORY_ROOT, 'turbo.json'));

		expect(target).toEqual(source);
		expect(createHash('sha256').update(source).digest('hex')).toBe(TURBO_DIGEST);
	});

	it('keeps every Vitest configuration caller-owned', () => {
		const paths = [
			'apps/gallery/vite.config.ts',
			'packages/motion/vitest.config.ts',
			'packages/ui/vitest.config.ts',
		];
		for (const path of paths) {
			expect(existsSync(join(REPOSITORY_ROOT, path)), path).toBe(true);
			expect(text(path), path).not.toContain('@yesid/config');
		}
		const configPackage = json('packages/config/package.json') as {
			exports?: Record<string, unknown>;
		};
		expect(Object.keys(configPackage.exports ?? {})).not.toContain('./vitest');
	});

	it('keeps the producer self-canary distinct from downstream Release acquisition', () => {
		const documentation = text('docs/SHARED-TOOLING-CI.md');
		expect(documentation).toContain('one deliberate self-canary exception');
		expect(documentation).toContain('`@yesid/config@0.2.0` workspace contract');
		expect(documentation).toContain('Transit and yesid.dev must consume the immutable Release asset');
	});
});
