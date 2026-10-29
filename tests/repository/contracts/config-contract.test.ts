import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { projectRunes } from '../../../packages/config/svelte/project-runes.js';

const CONFIG_ROOT = fileURLToPath(new URL('../../../packages/config/', import.meta.url));
const TSC = fileURLToPath(new URL('../../../node_modules/typescript/bin/tsc', import.meta.url));
const scratch: string[] = [];

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
	it('shares only the root-parameterized project runes policy', () => {
		const runes = projectRunes('/workspace/app');
		expect(runes({ filename: '/workspace/app/src/page.svelte' })).toBe(true);
		expect(runes({ filename: '/workspace/app/node_modules/pkg/index.svelte' })).toBeUndefined();
		expect(runes({ filename: '/workspace/app/NODE_MODULES/pkg/index.svelte' })).toBeUndefined();
		expect(runes({ filename: '/workspace/app/src/node_modules-cache/page.svelte' })).toBe(true);
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
