import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { projectRunes } from '../../../packages/config/svelte/project-runes.js';

const CONFIG_ROOT = fileURLToPath(new URL('../../../packages/config/', import.meta.url));
const TSC = fileURLToPath(new URL('../../../node_modules/typescript/bin/tsc', import.meta.url));
const CONFIG_FILES = [
	'README.md',
	'LICENSE',
	'CHANGELOG.md',
	'tsconfig/base.json',
	'tsconfig/library.json',
	'tsconfig/svelte-kit.json',
	'turbo/base.json',
	'svelte/project-runes.js',
	'svelte/project-runes.d.ts',
] as const;
const scratch: string[] = [];

function readJson(path: string): Record<string, unknown> {
	return JSON.parse(readFileSync(join(CONFIG_ROOT, path), 'utf8')) as Record<string, unknown>;
}

function write(path: string, source: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, source, 'utf8');
}

function consumer(): string {
	const root = mkdtempSync(join(tmpdir(), 'yesid-config-contract-'));
	scratch.push(root);
	mkdirSync(join(root, 'node_modules/@yesid'), { recursive: true });
	symlinkSync(CONFIG_ROOT, join(root, 'node_modules/@yesid/config'), 'dir');
	write(join(root, 'index.ts'), 'export const exact = true;\n');
	return root;
}

function showConfig(root: string): Record<string, unknown> {
	const result = spawnSync('bun', [TSC, '--showConfig', '--project', 'tsconfig.json'], {
		cwd: root,
		encoding: 'utf8',
	});
	expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
	return JSON.parse(result.stdout) as Record<string, unknown>;
}

afterEach(() => {
	for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('@yesid/config neutral contracts', () => {
	it('exports only the accepted ST1 TypeScript and Turbo configuration files', () => {
		const manifest = readJson('package.json');
		expect(manifest).toMatchObject({
			name: '@yesid/config',
			version: '0.2.0',
			private: true,
			files: CONFIG_FILES,
			exports: {
				'./package.json': './package.json',
				'./tsconfig/base.json': './tsconfig/base.json',
				'./tsconfig/library.json': './tsconfig/library.json',
				'./tsconfig/svelte-kit.json': './tsconfig/svelte-kit.json',
				'./turbo/base.json': './turbo/base.json',
				'./svelte/project-runes.js': {
					types: './svelte/project-runes.d.ts',
					default: './svelte/project-runes.js',
				},
			},
		});
	});

	it('publishes compatibility ranges for every independently consumable contract', () => {
		const readme = readFileSync(join(CONFIG_ROOT, 'README.md'), 'utf8');
		expect(readme).toContain('| `tsconfig/base.json` | TypeScript `>=5.0 <6` |');
		expect(readme).toContain('| `tsconfig/library.json` | TypeScript `>=5.0 <6` |');
		expect(readme).toContain('| `tsconfig/svelte-kit.json` | TypeScript `>=5.7 <6`; SvelteKit `>=2 <3` |');
		expect(readme).toContain('| `svelte/project-runes.js` | Svelte `>=5 <6`; Node `>=22` or Bun `>=1.3` |');
		expect(readme).toContain('| `turbo/base.json` | Turbo `>=2.9 <3` |');
	});

	it('keeps the compiler core small and leaves consumer-owned choices in overlays', () => {
		expect(readJson('tsconfig/base.json')).toEqual({
			'$schema': 'https://json.schemastore.org/tsconfig',
			compilerOptions: {
				moduleResolution: 'bundler',
				skipLibCheck: true,
				strict: true,
			},
		});
		expect(readJson('tsconfig/library.json')).toEqual({
			extends: './base.json',
			compilerOptions: {
				allowImportingTsExtensions: true,
				noEmit: true,
				target: 'ES2022',
			},
		});
		expect(readJson('tsconfig/svelte-kit.json')).toEqual({
			extends: './base.json',
			compilerOptions: {
				allowJs: true,
				checkJs: true,
				esModuleInterop: true,
				forceConsistentCasingInFileNames: true,
				resolveJsonModule: true,
				rewriteRelativeImportExtensions: true,
				sourceMap: true,
			},
		});
		const source = CONFIG_FILES.filter(
			(path) => !['README.md', 'LICENSE', 'CHANGELOG.md'].includes(path),
		)
			.map((path) => readFileSync(join(CONFIG_ROOT, path), 'utf8'))
			.join('\n');
		expect(source).not.toMatch(
			/transit|yesid\.dev|gallery|directus|wrangler|vercel|PUBLIC_|eslint|prettier|vitest/iu,
		);
	});

	it('shares only the root-parameterized project runes policy', () => {
		const runes = projectRunes('/workspace/app');
		expect(runes({ filename: '/workspace/app/src/page.svelte' })).toBe(true);
		expect(runes({ filename: '/workspace/app/node_modules/pkg/index.svelte' })).toBeUndefined();
		expect(runes({ filename: '/workspace/app/NODE_MODULES/pkg/index.svelte' })).toBeUndefined();
		expect(runes({ filename: '/workspace/app/src/node_modules-cache/page.svelte' })).toBe(true);
	});

	it('defines the exact three-repository Turbo core without consumer outputs or environment', () => {
		expect(readJson('turbo/base.json')).toEqual({
			'$schema': 'https://turbo.build/schema.json',
			tasks: {
				build: {
					dependsOn: ['^build'],
					outputs: ['.svelte-kit/**', 'dist/**'],
					inputs: ['$TURBO_DEFAULT$', '!**/.env.local', '!**/.env.*.local'],
				},
				test: { dependsOn: ['^build'], outputs: [] },
				check: { outputs: [] },
				dev: { cache: false, persistent: true },
			},
		});
	});

	it('resolves a library contract while preserving its consumer-owned module and lib', () => {
		const root = consumer();
		write(
			join(root, 'tsconfig.json'),
			`${JSON.stringify({
				extends: '@yesid/config/tsconfig/library.json',
				compilerOptions: { module: 'ESNext', lib: ['ES2022'], types: [] },
				include: ['index.ts'],
			}, null, '\t')}\n`,
		);
		const shown = showConfig(root).compilerOptions as Record<string, unknown>;
		expect(shown).toMatchObject({
			allowImportingTsExtensions: true,
			module: 'esnext',
			moduleResolution: 'bundler',
			noEmit: true,
			skipLibCheck: true,
			strict: true,
			target: 'es2022',
		});
		expect(shown.lib).toEqual(['es2022']);
	});

	it('composes after generated SvelteKit config and lets the consumer override policy', () => {
		const root = consumer();
		write(
			join(root, '.svelte-kit/tsconfig.json'),
			`${JSON.stringify({
				compilerOptions: {
					isolatedModules: true,
					module: 'ESNext',
					noEmit: true,
					target: 'ESNext',
					verbatimModuleSyntax: true,
				},
				include: ['../index.ts'],
			}, null, '\t')}\n`,
		);
		write(
			join(root, 'tsconfig.json'),
			`${JSON.stringify({
				extends: ['./.svelte-kit/tsconfig.json', '@yesid/config/tsconfig/svelte-kit.json'],
				compilerOptions: { sourceMap: false, types: [] },
			}, null, '\t')}\n`,
		);
		const shown = showConfig(root).compilerOptions as Record<string, unknown>;
		expect(shown).toMatchObject({
			allowJs: true,
			checkJs: true,
			forceConsistentCasingInFileNames: true,
			isolatedModules: true,
			module: 'esnext',
			moduleResolution: 'bundler',
			noEmit: true,
			resolveJsonModule: true,
			rewriteRelativeImportExtensions: true,
			skipLibCheck: true,
			sourceMap: false,
			strict: true,
			target: 'esnext',
			verbatimModuleSyntax: true,
		});
	});
});
