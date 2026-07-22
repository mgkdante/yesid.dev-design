import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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

import {
	buildReleaseArchive,
	releaseAssetName,
	verifyReleaseArchive,
} from '../../../tools/release-archive.js';

const TAG = 'v1.2.3-rc.1';
const VERSION = '1.2.3-rc.1';
const ADOPT_TOOL = fileURLToPath(new URL('../../../tools/adopt.ts', import.meta.url));
const scratch: string[] = [];

function tempDir(prefix = 'yesid-release-test-'): string {
	const path = mkdtempSync(join(tmpdir(), prefix));
	scratch.push(path);
	return path;
}

function write(path: string, content: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content, 'utf8');
}

function git(root: string, ...args: string[]): string {
	const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
	if (result.status !== 0) throw new Error(result.stderr || result.stdout);
	return result.stdout.trim();
}

function manifest(name: string, version = VERSION): string {
	return `${JSON.stringify({ name, version }, null, '\t')}\n`;
}

function repository(options: { lightweight?: boolean; version?: string } = {}): {
	root: string;
	tagObject: string;
	peeledCommit: string;
	commitTime: number;
} {
	const root = join(tempDir(), 'repository');
	mkdirSync(root);
	git(root, 'init', '-q', '-b', 'main');
	git(root, 'config', 'user.name', 'Release Test');
	git(root, 'config', 'user.email', 'release-test@example.com');
	write(join(root, 'package.json'), manifest('yesid-dev-design', options.version));
	write(join(root, 'LICENSE'), 'MIT\n');
	write(join(root, 'README.md'), 'repository-only documentation\n');
	write(join(root, 'tools', 'adopt.ts'), 'export {};\n');
	write(join(root, 'tools', 'adopt', 'contract.ts'), 'export {};\n');
	for (const name of ['tokens', 'motion', 'gates', 'seo-kit', 'ui']) {
		write(join(root, 'packages', name, 'package.json'), manifest(`@yesid/${name}`, options.version));
		write(join(root, 'packages', name, 'src', 'index.ts'), `export const name = '${name}';\n`);
	}
	write(join(root, 'packages', 'config', 'package.json'), manifest('@yesid/config', '0.1.0'));
	write(join(root, 'packages', 'config', '.env'), 'DO_NOT_SHIP=secret\n');
	git(root, 'add', '.');
	git(root, 'commit', '-qm', 'release fixture');
	if (options.lightweight) git(root, 'tag', TAG);
	else git(root, 'tag', '-a', TAG, '-m', TAG);
	git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
	return {
		root,
		tagObject: git(root, 'rev-parse', `refs/tags/${TAG}`),
		peeledCommit: git(root, 'rev-parse', `refs/tags/${TAG}^{commit}`),
		commitTime: Number(git(root, 'show', '-s', '--format=%ct', `refs/tags/${TAG}^{commit}`)),
	};
}

function tar(root: string, ...args: string[]): string {
	const result = spawnSync('tar', args, { cwd: root, encoding: 'utf8' });
	if (result.status !== 0) throw new Error(result.stderr || result.stdout);
	return result.stdout;
}

function tarMtimes(archive: Buffer): number[] {
	const mtimes: number[] = [];
	let offset = 0;
	while (offset + 512 <= archive.length) {
		const header = archive.subarray(offset, offset + 512);
		if (header.every((byte) => byte === 0)) break;
		const size = Number.parseInt(
			header.subarray(124, 136).toString('ascii').replace(/\0.*$/u, '').trim(),
			8,
		);
		mtimes.push(
			Number.parseInt(
				header.subarray(136, 148).toString('ascii').replace(/\0.*$/u, '').trim(),
				8,
			),
		);
		offset += 512 + Math.ceil(size / 512) * 512;
	}
	return mtimes;
}

function tamperTarFile(archive: Buffer, suffix: string): Buffer {
	const tampered = Buffer.from(archive);
	let offset = 0;
	while (offset + 512 <= tampered.length) {
		const header = tampered.subarray(offset, offset + 512);
		if (header.every((byte) => byte === 0)) break;
		const field = (start: number, length: number): string => {
			const raw = header.subarray(start, start + length);
			const end = raw.indexOf(0);
			return raw.subarray(0, end === -1 ? raw.length : end).toString('utf8');
		};
		const name = field(0, 100);
		const prefix = field(345, 155);
		const path = prefix ? `${prefix}/${name}` : name;
		const size = Number.parseInt(field(124, 12).trim(), 8);
		if (path.endsWith(suffix)) {
			if (size < 1) throw new Error(`cannot tamper empty entry ${path}`);
			tampered[offset + 512] = (tampered[offset + 512] ?? 0) ^ 1;
			return tampered;
		}
		offset += 512 + Math.ceil(size / 512) * 512;
	}
	throw new Error(`archive entry not found: ${suffix}`);
}

afterEach(() => {
	for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('immutable release archive', () => {
	it('builds byte-identical POSIX ustar archives with the exact acquisition receipt', () => {
		const source = repository();
		const firstRoot = tempDir();
		const secondRoot = tempDir();
		const assetName = releaseAssetName(TAG);
		const firstPath = join(firstRoot, assetName);
		const secondPath = join(secondRoot, assetName);

		const first = buildReleaseArchive({
			repositoryRoot: source.root,
			tag: TAG,
			output: firstPath,
		});
		git(source.root, 'config', 'tar.umask', '0077');
		const second = buildReleaseArchive({
			repositoryRoot: source.root,
			tag: TAG,
			output: secondPath,
		});

		expect(readFileSync(firstPath)).toEqual(readFileSync(secondPath));
		expect(first).toEqual(second);
		expect(first).toMatchObject({
			name: assetName,
			digest: `sha256:${createHash('sha256').update(readFileSync(firstPath)).digest('hex')}`,
			tag: {
				name: TAG,
				object: source.tagObject,
				peeledCommit: source.peeledCommit,
			},
		});

		const entries = tar(firstRoot, '-tf', firstPath).trim().split('\n');
		expect(entries.length).toBeGreaterThan(10);
		expect(entries.every((entry) => entry.startsWith(`yesid.dev-design-${TAG}/`))).toBe(true);
		expect(entries).not.toContain('.git');
		expect(entries.some((entry) => entry.includes('/packages/config/'))).toBe(false);
		expect(entries.some((entry) => entry.endsWith('/README.md'))).toBe(false);
		expect(entries.filter((entry) => entry.endsWith('/.yesid-release.json'))).toHaveLength(1);
		expect(tarMtimes(readFileSync(firstPath))).not.toHaveLength(0);
		expect(tarMtimes(readFileSync(firstPath)).every((mtime) => mtime === source.commitTime)).toBe(
			true,
		);
		const receipt = tar(
			firstRoot,
			'-xOf',
			firstPath,
			`yesid.dev-design-${TAG}/.yesid-release.json`,
		);
		expect(receipt).toBe(
			`${JSON.stringify({
				schema: 1,
				repository: 'github.com/mgkdante/yesid.dev-design',
				tag: {
					name: TAG,
					object: source.tagObject,
					peeledCommit: source.peeledCommit,
				},
			})}\n`,
		);

		expect(verifyReleaseArchive({
			repositoryRoot: source.root,
			tag: TAG,
			archive: firstPath,
		})).toEqual(first);

		const adoption = join(tempDir(), 'vendor', 'design');
		const adopted = spawnSync(
			'bun',
			[
				ADOPT_TOOL,
				'--tag',
				TAG,
				'--packages',
				'tokens,motion,gates,seo-kit,ui',
				'--dest',
				adoption,
				'--archive',
				firstPath,
			],
			{ encoding: 'utf8' },
		);
		expect(adopted.status, `${adopted.stdout}\n${adopted.stderr}`).toBe(0);
		const checked = spawnSync('bun', [ADOPT_TOOL, '--check', '--dest', adoption], {
			encoding: 'utf8',
		});
		expect(checked.status, `${checked.stdout}\n${checked.stderr}`).toBe(0);
	});

	it('fails closed before writing for dirty, lightweight, or version-mismatched trust roots', () => {
		const dirty = repository();
		write(join(dirty.root, 'dirty.txt'), 'not committed\n');
		const dirtyOutput = join(tempDir(), releaseAssetName(TAG));
		expect(() =>
			buildReleaseArchive({ repositoryRoot: dirty.root, tag: TAG, output: dirtyOutput }),
		).toThrow(/clean worktree/i);
		expect(existsSync(dirtyOutput)).toBe(false);

		const lightweight = repository({ lightweight: true });
		const lightweightOutput = join(tempDir(), releaseAssetName(TAG));
		expect(() =>
			buildReleaseArchive({
				repositoryRoot: lightweight.root,
				tag: TAG,
				output: lightweightOutput,
			}),
		).toThrow(/annotated tag/i);
		expect(existsSync(lightweightOutput)).toBe(false);

		const mismatch = repository({ version: '1.2.4' });
		const mismatchOutput = join(tempDir(), releaseAssetName(TAG));
		expect(() =>
			buildReleaseArchive({
				repositoryRoot: mismatch.root,
				tag: TAG,
				output: mismatchOutput,
			}),
		).toThrow(/does not match.*version/i);
		expect(existsSync(mismatchOutput)).toBe(false);
	});

	it('rejects a tag outside main ancestry and an unsafe tagged tree', () => {
		const outsideMain = repository();
		git(outsideMain.root, 'checkout', '--orphan', 'unrelated');
		git(outsideMain.root, 'rm', '-qrf', '.');
		write(join(outsideMain.root, 'README.md'), 'unrelated\n');
		git(outsideMain.root, 'add', '.');
		git(outsideMain.root, 'commit', '-qm', 'unrelated main');
		git(outsideMain.root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
		const outsideOutput = join(tempDir(), releaseAssetName(TAG));
		expect(() =>
			buildReleaseArchive({
				repositoryRoot: outsideMain.root,
				tag: TAG,
				output: outsideOutput,
			}),
		).toThrow(/ancestor of origin\/main/i);

		const unsafe = repository({ version: '1.2.4' });
		write(join(unsafe.root, 'outside.txt'), 'target\n');
		git(unsafe.root, 'add', 'outside.txt');
		git(unsafe.root, 'commit', '-qm', 'target');
		const symlink = join(unsafe.root, 'packages', 'ui', 'unsafe-link');
		const linkResult = spawnSync('ln', ['-s', '../../../outside.txt', symlink]);
		if (linkResult.status !== 0) throw new Error('could not create symlink fixture');
		git(unsafe.root, 'add', 'packages/ui/unsafe-link');
		git(unsafe.root, 'commit', '-qm', 'unsafe symlink');
		git(unsafe.root, 'tag', '-a', 'v1.2.4', '-m', 'v1.2.4');
		git(unsafe.root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
		const unsafeOutput = join(tempDir(), releaseAssetName('v1.2.4'));
		expect(() =>
			buildReleaseArchive({
				repositoryRoot: unsafe.root,
				tag: 'v1.2.4',
				output: unsafeOutput,
			}),
		).toThrow(/unsafe archive/i);
		expect(existsSync(unsafeOutput)).toBe(false);
	});

	it('requires the canonical external asset path and refuses overwrite', () => {
		const source = repository();
		const external = tempDir();
		const wrongName = join(external, 'release.tar');
		expect(() =>
			buildReleaseArchive({ repositoryRoot: source.root, tag: TAG, output: wrongName }),
		).toThrow(/canonical asset name/i);

		const insideRepository = join(source.root, releaseAssetName(TAG));
		expect(() =>
			buildReleaseArchive({
				repositoryRoot: source.root,
				tag: TAG,
				output: insideRepository,
			}),
		).toThrow(/outside the repository/i);

		const output = join(external, releaseAssetName(TAG));
		write(output, 'keep me\n');
		expect(() =>
			buildReleaseArchive({ repositoryRoot: source.root, tag: TAG, output }),
		).toThrow(/already exists/i);
		expect(readFileSync(output, 'utf8')).toBe('keep me\n');
	});

	it('rejects changed tagged payload bytes even when the valid receipt is preserved', () => {
		const source = repository();
		const builtRoot = tempDir();
		const tamperedRoot = tempDir();
		const assetName = releaseAssetName(TAG);
		const built = join(builtRoot, assetName);
		const tampered = join(tamperedRoot, assetName);
		buildReleaseArchive({ repositoryRoot: source.root, tag: TAG, output: built });
		writeFileSync(tampered, tamperTarFile(readFileSync(built), '/packages/tokens/src/index.ts'));

		expect(() =>
			verifyReleaseArchive({
				repositoryRoot: source.root,
				tag: TAG,
				archive: tampered,
			}),
		).toThrow(/does not match the deterministic tagged tree/i);
	});
});
