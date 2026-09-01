import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import {
	adoptFromSource,
	checkAdoption,
	type PackageName,
} from '../../../tools/adopt.js';

const scratch: string[] = [];
const repository = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const COMMIT = '0123456789abcdef0123456789abcdef01234567';

function tempDir(): string {
	const path = mkdtempSync(join(tmpdir(), 'yesid-adopt-cascade-'));
	scratch.push(path);
	return path;
}

function relativeMarkdownLinks(markdown: string): string[] {
	return [...markdown.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/gu)]
		.map((match) => match[1]!)
		.filter(
			(target) =>
				!target.startsWith('#') &&
				!target.startsWith('//') &&
				!/^[a-z][a-z0-9+.-]*:/iu.test(target),
		);
}

afterEach(() => {
	for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('real repository adoption cascade', () => {
	it('vendors every package and the complete tool into an offline-checkable exact no-op', () => {
		const dest = join(tempDir(), 'vendor', 'design');
		const options = {
			source: repository,
			dest,
			packages: [
				'tokens',
				'motion',
				'gates',
				'seo-kit',
				'ui',
				'analytics',
				'i18n-core',
			] as PackageName[],
			provenance: {
				mode: 'worktree' as const,
				tag: { name: 'v0.7.0-test.1', object: COMMIT, peeledCommit: COMMIT },
				asset: null,
			},
		};

		const first = adoptFromSource(options);
		expect(first.outcome).toBe('installed');
		expect(checkAdoption(dest)).toEqual(first.manifest);
		const uiReadme = readFileSync(join(dest, 'ui', 'README.md'), 'utf8');
		expect(uiReadme).toContain(
			'https://github.com/mgkdante/yesid.dev-design/blob/v0.13.1/docs/BUILD-A-YESID-PRODUCT.md#4-configure-ui-once-per-module-graph-at-boot',
		);
		expect(uiReadme).not.toContain('](../../docs/');
		const uiRoot = join(dest, 'ui');
		for (const target of relativeMarkdownLinks(uiReadme)) {
			const linkedPath = resolve(uiRoot, decodeURIComponent(target.split(/[?#]/u, 1)[0]!));
			const packageRelativePath = relative(uiRoot, linkedPath);
			expect(packageRelativePath, `${target} must stay inside the installed UI package`).not.toMatch(
				/^\.\.(?:[/\\]|$)|^(?:[/\\])/u,
			);
			expect(existsSync(linkedPath), `${target} must resolve inside the installed UI package`).toBe(
				true,
			);
		}
		for (const module of ['acquisition.ts', 'contract.ts', 'payload.ts', 'transaction.ts']) {
			expect(existsSync(join(dest, 'tools', 'adopt', module))).toBe(true);
		}

		const checked = spawnSync('bun', [join(dest, 'tools', 'adopt.ts'), '--check', '--dest', dest], {
			encoding: 'utf8',
		});
		expect(checked.status, checked.stderr).toBe(0);
		const before = statSync(dest);
		const second = adoptFromSource(options);
		expect(second.outcome).toBe('noop');
		expect(second.manifest).toEqual(first.manifest);
		expect(statSync(dest).ino).toBe(before.ino);
		expect(statSync(dest).mtimeMs).toBe(before.mtimeMs);
	});
});
