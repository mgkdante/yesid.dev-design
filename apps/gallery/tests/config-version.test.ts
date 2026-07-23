import { spawnSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { lockWorkspaceVersion } from '../../../tools/release-core.js';

const TOOL = fileURLToPath(new URL('../../../tools/config-version.ts', import.meta.url));
const COORDINATED_PACKAGES = ['tokens', 'motion', 'gates', 'seo-kit', 'ui', 'analytics'] as const;
const scratch: string[] = [];

function tempDir(): string {
	const path = mkdtempSync(join(tmpdir(), 'yesid-config-version-test-'));
	scratch.push(path);
	return path;
}

function write(path: string, source: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, source);
}

function manifest(name: string, version: string): string {
	return `${JSON.stringify({ name, version, private: true }, null, '\t')}\n`;
}

function lockfile(configVersion = '0.1.0', rootVersion = '7.7.7'): string {
	return `{
  "lockfileVersion": 1,
  "configVersion": 1,
  "workspaces": {
    "": { "name": "yesid-dev-design" },
    "packages/config": {
      "name": "@yesid/config",
      "version": "${configVersion}",
    },
    "packages/analytics": {
      "name": "@yesid/analytics",
      "version": "${rootVersion}",
    },
    "packages/tokens": {
      "name": "@yesid/tokens",
      "version": "${rootVersion}",
    },
    "packages/motion": {
      "name": "@yesid/motion",
      "version": "${rootVersion}",
    },
    "packages/gates": {
      "name": "@yesid/gates",
      "version": "${rootVersion}",
    },
    "packages/seo-kit": {
      "name": "@yesid/seo-kit",
      "version": "${rootVersion}",
    },
    "packages/ui": {
      "name": "@yesid/ui",
      "version": "${rootVersion}",
    },
  },
}
`;
}

function repository(): string {
	const root = tempDir();
	write(join(root, 'package.json'), manifest('yesid-dev-design', '7.7.7'));
	write(join(root, 'CHANGELOG.md'), '# Changelog\n\n## 7.7.7\n\nRoot release.\n');
	for (const name of COORDINATED_PACKAGES) {
		write(join(root, `packages/${name}/package.json`), manifest(`@yesid/${name}`, '7.7.7'));
	}
	write(join(root, 'packages/config/package.json'), manifest('@yesid/config', '0.1.0'));
	write(
		join(root, 'packages/config/CHANGELOG.md'),
		'# Changelog\n\n## 0.1.0\n\n<!-- config-release-fragment: st0-distribution -->\n- Establish the independent distribution boundary.\n',
	);
	write(join(root, 'bun.lock'), lockfile());
	return root;
}

function run(root: string, ...args: string[]): ReturnType<typeof spawnSync> {
	return spawnSync('bun', [TOOL, ...args], { cwd: root, encoding: 'utf8' });
}

function rootReleaseBytes(root: string): Map<string, Buffer> {
	return new Map(
		[
			'package.json',
			'CHANGELOG.md',
			...COORDINATED_PACKAGES.map((name) => `packages/${name}/package.json`),
		].map((path) => [path, readFileSync(join(root, path))]),
	);
}

afterEach(() => {
	for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('independent @yesid/config version line', () => {
	it('prepares and checks config-only fragments without touching coordinated release bytes', () => {
		const root = repository();
		const unchanged = rootReleaseBytes(root);
		write(
			join(root, '.config-changes/neutral-config.md'),
			'---\nbump: minor\n---\n\nAdd neutral shared configuration.\n',
		);

		const prepared = run(root, 'prepare', '--version', '0.2.0');
		expect(prepared.status, `${prepared.stdout}\n${prepared.stderr}`).toBe(0);
		expect(JSON.parse(readFileSync(join(root, 'packages/config/package.json'), 'utf8'))).toMatchObject({
			name: '@yesid/config',
			version: '0.2.0',
		});
		expect(readFileSync(join(root, 'bun.lock'), 'utf8')).toContain(
			'"packages/config": {\n      "name": "@yesid/config",\n      "version": "0.2.0"',
		);
		const preparedLockfile = readFileSync(join(root, 'bun.lock'), 'utf8');
		for (const name of COORDINATED_PACKAGES) {
			expect(lockWorkspaceVersion(preparedLockfile, `packages/${name}`), name).toBe('7.7.7');
		}
		expect(readFileSync(join(root, 'packages/config/CHANGELOG.md'), 'utf8')).toContain(
			'## 0.2.0\n\n<!-- config-release-fragment: neutral-config -->',
		);
		expect(existsSync(join(root, '.config-changes/neutral-config.md'))).toBe(false);
		for (const [path, bytes] of unchanged) {
			expect(readFileSync(join(root, path)), path).toEqual(bytes);
		}

		const checked = run(root, 'check', '--version', '0.2.0', '--tag', 'config-v0.2.0');
		expect(checked.status, `${checked.stdout}\n${checked.stderr}`).toBe(0);
	});

	it('rejects non-config tags, malformed fragments, and version transitions outside the bump', () => {
		const root = repository();
		write(join(root, '.config-changes/bad.md'), '---\nbump: patch\n---\n\nPatch.\n');
		expect(run(root, 'prepare', '--version', '0.2.0').stderr).toMatch(/requested patch bump/i);
		expect(run(root, 'check', '--version', '0.1.0', '--tag', 'v0.1.0').stderr).toMatch(
			/expected config-v/i,
		);

		write(join(root, '.config-changes/bad.md'), 'no front matter\n');
		expect(run(root, 'prepare', '--version', '0.1.1').stderr).toMatch(/front matter/i);
	});
});
