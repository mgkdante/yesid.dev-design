import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));
const artifactPaths = [
	'DESIGN.md',
	'packages/tokens/theme.css',
	'packages/motion/src/tokens.ts',
	'packages/tokens/tokens.css',
] as const;

function sourceFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
	});
}

describe('token artifact ownership', () => {
	it('maps every logical output to its committed repository artifact', () => {
		const check = spawnSync('bun', ['tools/build-tokens.ts', '--check'], {
			cwd: repositoryRoot,
			encoding: 'utf8',
		});

		expect(check.status, check.stderr).toBe(0);
		expect(check.stdout).toContain('build idempotent (no changes)');
		for (const path of artifactPaths) {
			expect(existsSync(new URL(`../../../${path}`, import.meta.url)), path).toBe(true);
		}
	});

	it('keeps consumer paths out of the upstream token package', () => {
		const upstreamFiles = [
			join(repositoryRoot, 'packages/tokens/package.json'),
			...sourceFiles(join(repositoryRoot, 'packages/tokens/src')),
		];
		for (const path of upstreamFiles) {
			const source = readFileSync(path, 'utf8');
			expect(source, path).not.toMatch(/apps\/gallery|packages\/motion|\.\.\/\.\.\/DESIGN\.md/);
		}
	});
});
