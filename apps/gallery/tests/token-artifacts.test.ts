import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createRepositoryBuild } from '../../../tools/build-tokens.ts';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

describe('token artifact ownership', () => {
	it('maps every logical output to its committed repository artifact', () => {
		const outputs = createRepositoryBuild(repoRoot);

		expect(Object.keys(outputs)).toEqual([
			'DESIGN.md',
			'apps/gallery/src/app.css',
			'packages/motion/src/tokens.ts',
			'packages/tokens/tokens.css',
		]);
		for (const [path, content] of Object.entries(outputs)) {
			expect(readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8'), path).toBe(
				content,
			);
		}
	});

	it('makes the gallery consume the package artifact without a local mirror', () => {
		const appCss = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');

		expect(appCss).toContain("@import '@yesid/tokens/tokens.css';");
		expect(existsSync(new URL('../src/lib/styles/tokens.css', import.meta.url))).toBe(false);
	});

	it('keeps consumer paths out of the upstream token package', () => {
		const upstreamFiles = [
			'packages/tokens/package.json',
			'packages/tokens/src/build.ts',
			'packages/tokens/src/__tests__/build.test.ts',
		];
		for (const path of upstreamFiles) {
			const source = readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
			expect(source, path).not.toMatch(/apps\/gallery|packages\/motion|\.\.\/\.\.\/DESIGN\.md/);
		}
	});
});
