import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileModule } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');

function runeModules(): string[] {
	return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
		.map((path) => path.replaceAll('\\', '/'))
		.filter((path) => /\.svelte\.[jt]s$/.test(path) && !path.includes('.test.'))
		.sort();
}

describe('rune modules', () => {
	// Consumers pre-bundle vendored packages in Vite dev, and vite-plugin-svelte hands
	// .svelte.js/.svelte.ts files to compileModule without stripping TypeScript first.
	it('compile the way a consumer dev server pre-bundles them', () => {
		const modules = runeModules();
		expect(modules).not.toHaveLength(0);
		for (const path of modules) {
			const code = readFileSync(join(SRC, path), 'utf8');
			expect(() => compileModule(code, { filename: path, generate: 'client', dev: true }), path).not.toThrow();
		}
	});
});
