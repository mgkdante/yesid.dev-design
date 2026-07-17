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

function copyFile(source: string, dest: string): void {
	mkdirSync(dirname(dest), { recursive: true });
	cpSync(source, dest);
}

afterEach(() => {
	for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('brand cascade', () => {
	it('changes the generated CSS and TypeScript mirrors when a duration token changes in a scratch copy', () => {
		const root = mkdtempSync(join(tmpdir(), 'yesid-token-cascade-'));
		scratch.push(root);
		copyFile(join(repoRoot, 'packages/tokens/build.ts'), join(root, 'packages/tokens/build.ts'));
		copyFile(join(repoRoot, 'packages/tokens/tokens.json'), join(root, 'packages/tokens/tokens.json'));
		cpSync(join(repoRoot, 'packages/tokens/src'), join(root, 'packages/tokens/src'), {
			recursive: true,
		});

		const buildTargets = [
			'apps/gallery/src/lib/styles/tokens.css',
			'apps/gallery/src/app.css',
			'packages/motion/src/tokens.ts',
			'DESIGN.md',
			'packages/tokens/tokens.css',
		] as const;
		for (const path of buildTargets) copyFile(join(repoRoot, path), join(root, path));
		const cascadedOutputs = [
			'apps/gallery/src/lib/styles/tokens.css',
			'packages/tokens/tokens.css',
			'packages/motion/src/tokens.ts',
		] as const;
		const before = new Map(
			cascadedOutputs.map((path) => [path, readFileSync(join(root, path), 'utf-8')]),
		);

		const tokenPath = join(root, 'packages/tokens/tokens.json');
		const tokens = JSON.parse(readFileSync(tokenPath, 'utf-8')) as {
			duration: { fast: { $value: string } };
		};
		expect(tokens.duration.fast.$value).toBe('150ms');
		tokens.duration.fast.$value = '151ms';
		writeFileSync(tokenPath, `${JSON.stringify(tokens, null, '\t')}\n`, 'utf-8');

		const first = spawnSync('bun', ['packages/tokens/build.ts'], {
			cwd: root,
			encoding: 'utf-8',
		});
		expect(first.status, first.stderr).toBe(0);
		for (const path of cascadedOutputs) {
			expect(readFileSync(join(root, path), 'utf-8'), path).not.toBe(before.get(path));
		}
		expect(readFileSync(join(root, cascadedOutputs[0]), 'utf-8')).toContain(
			'--duration-fast: 151ms;',
		);

		const second = spawnSync('bun', ['packages/tokens/build.ts'], {
			cwd: root,
			encoding: 'utf-8',
		});
		expect(second.status, second.stderr).toBe(0);
		expect(second.stdout).toContain('build idempotent (no changes)');
	});
});
