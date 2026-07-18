import { afterEach, describe, expect, it } from 'vitest';
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const scratch: string[] = [];
const artifactPaths = [
	'DESIGN.md',
	'apps/gallery/src/app.css',
	'packages/motion/src/tokens.ts',
	'packages/tokens/tokens.css',
] as const;
const sourceInputs = [
	'packages/tokens/tokens.json',
	'packages/ui/package.json',
	'packages/ui/src/brand/index.ts',
] as const;

function copy(source: string, root: string): void {
	const destination = join(root, source);
	mkdirSync(dirname(destination), { recursive: true });
	cpSync(join(repoRoot, source), destination);
}

afterEach(() => {
	for (const directory of scratch.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe('brand cascade', () => {
	it('updates every affected artifact and is idempotent', () => {
		const root = mkdtempSync(join(tmpdir(), 'yesid-token-cascade-'));
		scratch.push(root);
		for (const path of [...sourceInputs, ...artifactPaths]) copy(path, root);

		const tokenPath = join(root, 'packages/tokens/tokens.json');
		const tokens = JSON.parse(readFileSync(tokenPath, 'utf8')) as {
			duration: { fast: { $value: string } };
		};
		expect(tokens.duration.fast.$value).toBe('150ms');
		tokens.duration.fast.$value = '151ms';
		writeFileSync(tokenPath, `${JSON.stringify(tokens, null, '\t')}\n`, 'utf8');

		const first = spawnSync(
			'bun',
			[join(repoRoot, 'tools/build-tokens.ts'), '--root', root],
			{ encoding: 'utf8' },
		);
		expect(first.status, first.stderr).toBe(0);
		expect(first.stdout).toContain('wrote packages/motion/src/tokens.ts');
		expect(first.stdout).toContain('wrote packages/tokens/tokens.css');
		expect(first.stdout).not.toContain('wrote apps/gallery/src/app.css');
		expect(readFileSync(join(root, 'packages/tokens/tokens.css'), 'utf8')).toContain(
			'--duration-fast: 151ms;',
		);

		const second = spawnSync(
			'bun',
			[join(repoRoot, 'tools/build-tokens.ts'), '--root', root, '--check'],
			{ encoding: 'utf8' },
		);
		expect(second.status, second.stderr).toBe(0);
		expect(second.stdout).toContain('build idempotent (no changes)');
	});
});
