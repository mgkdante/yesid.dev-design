import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	realpathSync,
	renameSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	ADOPT_EXIT,
	adopt,
	adoptFromSource,
	checkAdoption,
	main,
	parseArgs,
	type AdoptManifest,
	type AdoptProvenance,
} from '../../../tools/adopt.js';
import { fullTreeHash } from '../../../tools/adopt/contract.js';

const scratch: string[] = [];
const crashFixture = fileURLToPath(new URL('./fixtures/adopt-crash.ts', import.meta.url));
const OLD_COMMIT = 'fedcba9876543210fedcba9876543210fedcba98';
const NEW_COMMIT = '0123456789abcdef0123456789abcdef01234567';
const LEGAL_FILES = [
	['LICENSE', 'test license\n'],
	['NOTICE', 'test notice\n'],
	['TRADEMARK.md', 'test trademark\n'],
] as const;

function worktreeProvenance(tag: string, commit: string): AdoptProvenance {
	return {
		mode: 'worktree',
		tag: { name: tag, object: commit, peeledCommit: commit },
		asset: null,
	};
}

function tempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), 'yesid-adopt-test-'));
	scratch.push(dir);
	return dir;
}

function write(path: string, content: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content, 'utf-8');
}

function linkDirectory(target: string, path: string): void {
	symlinkSync(target, path, process.platform === 'win32' ? 'junction' : 'dir');
}

function makeSource(root: string): void {
	for (const [name, content] of LEGAL_FILES) write(join(root, name), content);
	write(join(root, 'tools', 'adopt.ts'), "export * from './adopt/runtime.js';\n");
	write(join(root, 'tools', 'adopt', 'runtime.ts'), "export const schema = 2;\n");
	for (const name of ['tokens', 'motion', 'gates', 'seo-kit', 'ui', 'analytics', 'i18n-core']) {
		const dependencies = name === 'ui' ? { '@yesid/motion': 'workspace:*' } : undefined;
		const exports = {
			'.': {
				types: './src/runtime.ts',
				...(name === 'ui' ? { svelte: './src/runtime.ts' } : {}),
				default: './src/runtime.ts',
			},
		};
		write(
			join(root, 'packages', name, 'package.json'),
			JSON.stringify(
				{ name: `@yesid/${name}`, version: '0.0.0', exports, dependencies },
				null,
				2,
			) + '\n',
		);
		write(join(root, 'packages', name, 'src', 'runtime.ts'), `export const name = '${name}';\n`);
		write(join(root, 'packages', name, 'src', 'runtime.test.ts'), 'throw new Error();\n');
		write(join(root, 'packages', name, 'src', '__tests__', 'hidden.ts'), 'test only\n');
		write(join(root, 'packages', name, 'src', 'test-fixtures', 'hidden.ts'), 'fixture\n');
		write(join(root, 'packages', name, 'scripts', 'hidden.ts'), 'script\n');
		write(join(root, 'packages', name, 'research', 'hidden.md'), 'research\n');
		write(join(root, 'packages', name, 'node_modules', 'hidden.js'), 'dependency cache\n');
		write(join(root, 'packages', name, '.turbo', 'hidden.json'), 'build cache\n');
		write(join(root, 'packages', name, 'vitest.config.ts'), 'test config\n');
		write(join(root, 'packages', name, '.gitignore'), 'ignored\n');
	}
}

type Checkpoint =
	| 'lock.acquired'
	| 'recovery.checked'
	| 'stage.ready'
	| 'noop'
	| 'backup.durable'
	| 'destination.installed'
	| 'postverify.passed'
	| 'recovery.finalize'
	| 'rollback.started';

interface TransactionPaths {
	dest: string;
	lock: string;
	backup: string;
	stage: string;
}

interface AdoptionResult {
	outcome: 'installed' | 'noop';
	manifest: ReturnType<typeof checkAdoption>;
}

function adoptWithRuntime(
	options: Parameters<typeof adoptFromSource>[0],
	checkpoint?: (point: Checkpoint, paths: Readonly<TransactionPaths>) => void,
): AdoptionResult {
	return (
		adoptFromSource as unknown as (
			input: Parameters<typeof adoptFromSource>[0] & {
				runtime?: { checkpoint?: typeof checkpoint };
			},
		) => AdoptionResult
	)({ ...options, runtime: checkpoint ? { checkpoint } : undefined });
}

function adoptionSnapshot(dest: string): { manifest: string; tree: string } {
	return {
		manifest: readFileSync(join(dest, 'manifest.json'), 'utf8'),
		tree: fullTreeHash(dest),
	};
}

function crashAdoption(
	options: Parameters<typeof adoptFromSource>[0],
	point: Checkpoint,
): ReturnType<typeof spawnSync> {
	return spawnSync(
		'bun',
		[
			crashFixture,
			options.source,
			options.dest,
			options.provenance.tag.name,
			options.provenance.tag.object,
			options.provenance.tag.peeledCommit,
			point,
		],
		{ encoding: 'utf8' },
	);
}

afterEach(() => {
	for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('adoptFromSource', () => {
	it('copies runtime files, applies Transit exclusions, rewrites workspace links, and writes a checkable manifest', () => {
		const root = tempDir();
		const source = join(root, 'source');
		const dest = join(root, 'product', 'vendor', 'design');
		makeSource(source);

		const result = adoptFromSource({
			source,
			dest,
			packages: ['tokens', 'motion', 'gates', 'seo-kit', 'ui', 'analytics', 'i18n-core'],
			provenance: worktreeProvenance('v9.8.7', NEW_COMMIT),
		});
		const { manifest } = result;

		expect(result.outcome).toBe('installed');
		expect(Object.keys(manifest)).toEqual([
			'schema',
			'repository',
			'provenance',
			'packages',
			'exclusionPolicyDigest',
			'toolDigest',
			'treeHash',
		]);
		expect(manifest).toMatchObject({
			schema: 2,
			repository: 'github.com/mgkdante/yesid.dev-design',
			provenance: {
				mode: 'worktree',
				tag: {
					name: 'v9.8.7',
					object: '0123456789abcdef0123456789abcdef01234567',
					peeledCommit: '0123456789abcdef0123456789abcdef01234567',
				},
				asset: null,
			},
		});
		expect(manifest.exclusionPolicyDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
		expect(manifest.toolDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
		expect(manifest.treeHash).toMatch(/^sha256:[0-9a-f]{64}$/);
		expect(manifest.packages).toEqual([
			'tokens',
			'motion',
			'gates',
			'seo-kit',
			'ui',
			'analytics',
			'i18n-core',
		]);
		for (const [name, content] of LEGAL_FILES) {
			const installed = join(dest, name);
			expect(existsSync(installed), name).toBe(true);
			if (existsSync(installed)) expect(readFileSync(installed, 'utf-8')).toBe(content);
		}
		expect(readFileSync(join(dest, 'tools', 'adopt.ts'), 'utf-8')).toContain("./adopt/runtime.js");
		expect(existsSync(join(dest, 'tools', 'adopt', 'runtime.ts'))).toBe(true);
		expect(existsSync(join(dest, 'ui', 'src', 'runtime.ts'))).toBe(true);
		expect(existsSync(join(dest, 'ui', 'src', 'runtime.test.ts'))).toBe(false);
		expect(existsSync(join(dest, 'ui', 'src', '__tests__', 'hidden.ts'))).toBe(false);
		expect(existsSync(join(dest, 'ui', 'src', 'test-fixtures', 'hidden.ts'))).toBe(false);
		expect(existsSync(join(dest, 'ui', 'scripts', 'hidden.ts'))).toBe(false);
		expect(existsSync(join(dest, 'ui', 'research', 'hidden.md'))).toBe(false);
		expect(existsSync(join(dest, 'ui', 'node_modules', 'hidden.js'))).toBe(false);
		expect(existsSync(join(dest, 'ui', '.turbo', 'hidden.json'))).toBe(false);
		expect(existsSync(join(dest, 'ui', 'vitest.config.ts'))).toBe(false);
		expect(existsSync(join(dest, 'ui', '.gitignore'))).toBe(false);
		expect(readFileSync(join(dest, 'ui', 'package.json'), 'utf-8')).toContain(
			'"@yesid/motion": "file:../motion"',
		);
		const adoptedUiManifest = JSON.parse(
			readFileSync(join(dest, 'ui', 'package.json'), 'utf-8'),
		) as {
			exports: Record<string, Record<string, string>>;
			dependencies: Record<string, string>;
		};
		expect(adoptedUiManifest.exports).toEqual({
			'.': {
				types: './src/runtime.ts',
				svelte: './src/runtime.ts',
				default: './src/runtime.ts',
			},
		});
		expect(Object.keys(adoptedUiManifest.exports['.'] ?? {})).toEqual([
			'types',
			'svelte',
			'default',
		]);
		expect(adoptedUiManifest.dependencies).toEqual({ '@yesid/motion': 'file:../motion' });
		expect(checkAdoption(dest)).toEqual(manifest);
	});

	it.each(LEGAL_FILES)('requires the tagged source legal file %s', (name) => {
		const root = tempDir();
		const source = join(root, 'source');
		const dest = join(root, 'vendor', 'design');
		makeSource(source);
		rmSync(join(source, name));

		expect(() =>
			adoptFromSource({
				source,
				dest,
				packages: ['tokens'],
				provenance: worktreeProvenance('v1.0.0', OLD_COMMIT),
			}),
		).toThrow(new RegExp(`required legal file ${name.replace('.', '\\.')}`, 'u'));
		expect(existsSync(dest)).toBe(false);
	});

	it.each(LEGAL_FILES)('binds installed legal file %s into the tree hash', (name) => {
		const root = tempDir();
		const source = join(root, 'source');
		const dest = join(root, 'vendor', 'design');
		makeSource(source);
		adoptFromSource({
			source,
			dest,
			packages: ['tokens'],
			provenance: worktreeProvenance('v1.0.0', OLD_COMMIT),
		});

		write(join(dest, name), 'tampered\n');
		expect(() => checkAdoption(dest)).toThrow(/tree hash mismatch/iu);
	});

	it('detects changed, added, and removed vendor files through --check semantics', () => {
		const root = tempDir();
		const source = join(root, 'source');
		const dest = join(root, 'vendor', 'design');
		makeSource(source);
		const options: Parameters<typeof adoptFromSource>[0] = {
			source,
			dest,
			packages: ['tokens'],
			provenance: worktreeProvenance('v1.0.0', OLD_COMMIT),
		};
		adoptFromSource(options);

		write(join(dest, 'tokens', 'src', 'runtime.ts'), 'hand edit\n');
		expect(() => checkAdoption(dest)).toThrow(/tree hash mismatch/);

		adoptFromSource(options);
		write(join(dest, 'tokens', 'src', 'extra.ts'), 'extra file\n');
		expect(() => checkAdoption(dest)).toThrow(/tree hash mismatch/);

		adoptFromSource(options);
		rmSync(join(dest, 'tokens', 'src', 'runtime.ts'));
		expect(() => checkAdoption(dest)).toThrow(/tree hash mismatch/);
	});

	it('rejects unrecognized nested manifest fields', () => {
		const root = tempDir();
		const source = join(root, 'source');
		const dest = join(root, 'vendor', 'design');
		makeSource(source);
		adoptFromSource({
			source,
			dest,
			packages: ['tokens'],
			provenance: worktreeProvenance('v1.0.0', OLD_COMMIT),
		});

		const manifestPath = join(dest, 'manifest.json');
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
			provenance: Record<string, unknown>;
		};
		manifest.provenance.timestamp = 'not allowed';
		write(manifestPath, `${JSON.stringify(manifest, null, '\t')}\n`);

		expect(() => checkAdoption(dest)).toThrow(/manifest.*canonical/i);
	});

	it('binds provenance and package closure into the installed tree hash', () => {
		const root = tempDir();
		const source = join(root, 'source');
		const dest = join(root, 'vendor', 'design');
		makeSource(source);
		const options: Parameters<typeof adoptFromSource>[0] = {
			source,
			dest,
			packages: ['tokens'],
			provenance: worktreeProvenance('v1.0.0', OLD_COMMIT),
		};
		const mutateAndReject = (mutate: (manifest: AdoptManifest) => void): void => {
			adoptFromSource(options);
			const manifestPath = join(dest, 'manifest.json');
			const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as AdoptManifest;
			mutate(manifest);
			write(manifestPath, `${JSON.stringify(manifest, null, '\t')}\n`);
			expect(() => checkAdoption(dest)).toThrow(/tree hash mismatch/);
		};

		mutateAndReject((manifest) => {
			manifest.provenance.tag = {
				name: 'v9.9.9',
				object: NEW_COMMIT,
				peeledCommit: NEW_COMMIT,
			};
		});
		mutateAndReject((manifest) => {
			manifest.provenance.mode = 'archive';
		});
		mutateAndReject((manifest) => {
			manifest.packages = ['motion'];
		});

		adoptFromSource({
			...options,
			provenance: {
				mode: 'release',
				tag: { name: 'v1.0.0', object: OLD_COMMIT, peeledCommit: OLD_COMMIT },
				asset: {
					name: 'yesid.dev-design-v1.0.0.tar',
					size: 1024,
					digest: `sha256:${'a'.repeat(64)}`,
				},
			},
		});
		const manifestPath = join(dest, 'manifest.json');
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as AdoptManifest;
		manifest.provenance.asset!.size++;
		write(manifestPath, `${JSON.stringify(manifest, null, '\t')}\n`);
		expect(() => checkAdoption(dest)).toThrow(/tree hash mismatch/);
	});

	it('rejects a package set with an omitted internal dependency', () => {
		const root = tempDir();
		const source = join(root, 'source');
		makeSource(source);

		expect(() =>
			adoptFromSource({
				source,
				dest: join(root, 'vendor', 'design'),
				packages: ['ui'],
				provenance: worktreeProvenance('v1.0.0', OLD_COMMIT),
			}),
		).toThrow(/ui requires motion/);
	});

	it('closes and rewrites every valid workspace selector for internal packages', () => {
		const root = tempDir();
		const source = join(root, 'source');
		const uiManifest = join(source, 'packages', 'ui', 'package.json');
		makeSource(source);
		write(uiManifest, readFileSync(uiManifest, 'utf8').replace('workspace:*', 'workspace:^'));

		expect(() =>
			adoptFromSource({
				source,
				dest: join(root, 'incomplete'),
				packages: ['ui'],
				provenance: worktreeProvenance('v1.0.0', OLD_COMMIT),
			}),
		).toThrow(/ui requires motion/);

		const dest = join(root, 'complete');
		adoptFromSource({
			source,
			dest,
			packages: ['motion', 'ui'],
			provenance: worktreeProvenance('v1.0.0', OLD_COMMIT),
		});
		expect(readFileSync(join(dest, 'ui', 'package.json'), 'utf8')).toContain(
			'"@yesid/motion": "file:../motion"',
		);
	});

	it('fails closed when an internal package bypasses the workspace protocol', () => {
		const root = tempDir();
		const source = join(root, 'source');
		const uiManifest = join(source, 'packages', 'ui', 'package.json');
		makeSource(source);
		write(uiManifest, readFileSync(uiManifest, 'utf8').replace('workspace:*', '^1.0.0'));

		expect(() =>
			adoptFromSource({
				source,
				dest: join(root, 'vendor', 'design'),
				packages: ['motion', 'ui'],
				provenance: worktreeProvenance('v1.0.0', OLD_COMMIT),
			}),
		).toThrow(/internal dependency @yesid\/motion must use workspace:/);
	});

	it('refuses to replace an unrelated nonempty destination', () => {
		const root = tempDir();
		const source = join(root, 'source');
		const dest = join(root, 'product', 'src');
		makeSource(source);
		write(join(dest, 'keep.ts'), 'product source\n');

		expect(() =>
			adoptFromSource({
				source,
				dest,
				packages: ['tokens'],
				provenance: worktreeProvenance('v1.0.0', OLD_COMMIT),
			}),
		).toThrow(/refusing to replace a non-adoption destination/);
		expect(readFileSync(join(dest, 'keep.ts'), 'utf-8')).toBe('product source\n');
	});

	it('uses a sibling stage and leaves no transaction artifacts after an idempotent no-op', () => {
		const root = tempDir();
		const source = join(root, 'source');
		const dest = join(root, 'product', 'vendor', 'design');
		makeSource(source);
		const options: Parameters<typeof adoptFromSource>[0] = {
			source,
			dest,
			packages: ['tokens'],
			provenance: worktreeProvenance('v1.0.0', OLD_COMMIT),
		};
		const first = adoptWithRuntime(options);
		expect(first.outcome).toBe('installed');
		const before = statSync(dest);
		const checkpoints: Checkpoint[] = [];
		let observedPaths: TransactionPaths | undefined;

		const second = adoptWithRuntime(options, (point, paths) => {
			checkpoints.push(point);
			observedPaths = { ...paths };
			if (point === 'stage.ready') {
				expect(realpathSync.native(dirname(paths.stage))).toBe(realpathSync.native(dirname(dest)));
			}
		});

		expect(second.outcome).toBe('noop');
		expect(second.manifest).toEqual(first.manifest);
		expect(checkpoints).toContain('noop');
		expect(checkpoints).not.toContain('backup.durable');
		expect(statSync(dest).ino).toBe(before.ino);
		expect(statSync(dest).mtimeMs).toBe(before.mtimeMs);
		expect(observedPaths).toBeDefined();
		for (const path of [observedPaths!.lock, observedPaths!.backup, observedPaths!.stage]) {
			expect(existsSync(path), path).toBe(false);
		}
	});

	it('rejects a concurrent adoption without touching the active transaction', () => {
		const root = tempDir();
		const source = join(root, 'source');
		const dest = join(root, 'vendor', 'design');
		makeSource(source);
		const options: Parameters<typeof adoptFromSource>[0] = {
			source,
			dest,
			packages: ['tokens'],
			provenance: worktreeProvenance('v1.0.0', OLD_COMMIT),
		};
		let concurrentError: unknown;

		adoptWithRuntime(options, (point) => {
			if (point !== 'lock.acquired') return;
			try {
				adoptWithRuntime(options);
			} catch (error) {
				concurrentError = error;
			}
		});

		expect(concurrentError).toMatchObject({ code: 4 });
		expect(checkAdoption(dest).schema).toBe(2);
	});

	it.each([
		['stage.ready', Object.assign(new Error('disk full'), { code: 'ENOSPC' })],
		['backup.durable', new Error('interrupted after backup')],
	] as const)('restores the exact prior adoption when %s fails', (faultPoint, fault) => {
		const root = tempDir();
		const source = join(root, 'source');
		const dest = join(root, 'vendor', 'design');
		makeSource(source);
		const base: Parameters<typeof adoptFromSource>[0] = {
			source,
			dest,
			packages: ['tokens'],
			provenance: worktreeProvenance('v1.0.0', OLD_COMMIT),
		};
		adoptWithRuntime(base);
		const before = adoptionSnapshot(dest);

		let thrown: unknown;
		try {
			adoptWithRuntime(
				{
					...base,
					provenance: worktreeProvenance('v1.0.1', NEW_COMMIT),
				},
				(point) => {
					if (point === faultPoint) throw fault;
				},
			);
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toMatchObject({ code: ADOPT_EXIT.TRANSACTION_FAILED });
		expect(thrown).toBeInstanceOf(Error);
		expect((thrown as Error).message).toMatch(/adoption transaction failed/i);
		expect(adoptionSnapshot(dest)).toEqual(before);
	});

	it('rolls back when post-install verification detects corruption', () => {
		const root = tempDir();
		const source = join(root, 'source');
		const dest = join(root, 'vendor', 'design');
		makeSource(source);
		const base: Parameters<typeof adoptFromSource>[0] = {
			source,
			dest,
			packages: ['tokens'],
			provenance: worktreeProvenance('v1.0.0', OLD_COMMIT),
		};
		adoptWithRuntime(base);
		const before = adoptionSnapshot(dest);

		expect(() =>
			adoptWithRuntime(
				{
					...base,
					provenance: worktreeProvenance('v1.0.1', NEW_COMMIT),
				},
				(point, paths) => {
					if (point === 'destination.installed') {
						write(join(paths.dest, 'tokens', 'src', 'runtime.ts'), 'corrupted\n');
					}
				},
			),
		).toThrow(/adoption transaction failed/i);
		expect(adoptionSnapshot(dest)).toEqual(before);
	});

	it.each([
		['backup.durable', 'installed'],
		['destination.installed', 'noop'],
	] as const)(
		'recovers within one second after process death at %s',
		(crashPoint, expectedOutcome) => {
			const root = tempDir();
			const source = join(root, 'source');
			const dest = join(root, 'vendor', 'design');
			makeSource(source);
			const base: Parameters<typeof adoptFromSource>[0] = {
				source,
				dest,
				packages: ['tokens'],
				provenance: worktreeProvenance('v1.0.0', OLD_COMMIT),
			};
			adoptWithRuntime(base);
			const next = {
				...base,
				provenance: worktreeProvenance('v1.0.1', NEW_COMMIT),
			};

			const crashed = crashAdoption(next, crashPoint);
			expect(crashed.status, String(crashed.stderr)).toBe(97);
			const parent = dirname(dest);
			const prefix = `.${basename(dest)}.yesid-adopt`;
			expect(existsSync(join(parent, `${prefix}.lock`))).toBe(true);
			expect(existsSync(join(parent, `${prefix}.backup`))).toBe(true);

			const started = performance.now();
			const recovered = adoptWithRuntime(next);
			const recoveryMs = performance.now() - started;

			expect(recovered.outcome).toBe(expectedOutcome);
			expect(recoveryMs).toBeLessThan(1_000);
			expect(checkAdoption(dest)).toEqual(recovered.manifest);
			expect(existsSync(join(parent, `${prefix}.lock`))).toBe(false);
			expect(existsSync(join(parent, `${prefix}.backup`))).toBe(false);
			expect(readdirSync(parent).filter((entry) => entry.startsWith(`${prefix}.stage-`))).toEqual([]);
		},
	);

	it('returns recovery-required and preserves the durable backup when rollback fails', () => {
		const root = tempDir();
		const source = join(root, 'source');
		const dest = join(root, 'vendor', 'design');
		makeSource(source);
		const base: Parameters<typeof adoptFromSource>[0] = {
			source,
			dest,
			packages: ['tokens'],
			provenance: worktreeProvenance('v1.0.0', OLD_COMMIT),
		};
		adoptWithRuntime(base);
		let thrown: unknown;
		try {
			adoptWithRuntime(
				{
					...base,
					provenance: worktreeProvenance('v1.0.1', NEW_COMMIT),
				},
				(point) => {
					if (point === 'backup.durable') throw new Error('primary fault');
					if (point === 'rollback.started') throw new Error('rollback fault');
				},
			);
		} catch (error) {
			thrown = error;
		}
		const backup = join(dirname(dest), `.${basename(dest)}.yesid-adopt.backup`);
		const lock = join(dirname(dest), `.${basename(dest)}.yesid-adopt.lock`);
		expect(thrown).toMatchObject({ code: 7 });
		expect(existsSync(backup)).toBe(true);
		expect(existsSync(dest)).toBe(false);
		expect(existsSync(lock)).toBe(true);
	});
});

describe('adoption path safety', () => {
	it('rejects a symbolic-link component in the source path', () => {
		const root = tempDir();
		const sourceParent = join(root, 'source-parent');
		const source = join(sourceParent, 'source');
		const alias = join(root, 'source-alias');
		const dest = join(root, 'vendor', 'design');
		makeSource(source);
		linkDirectory(sourceParent, alias);

		expect(() =>
			adoptFromSource({
				source: join(alias, 'source'),
				dest,
				packages: ['tokens'],
				provenance: worktreeProvenance('v1.0.0', OLD_COMMIT),
			}),
		).toThrow(/source.*refusing symbolic link/iu);
		expect(existsSync(dest)).toBe(false);
	});

	it('rejects a symbolic-link component in the destination path', () => {
		const root = tempDir();
		const source = join(root, 'source');
		const outside = join(root, 'outside-product');
		const alias = join(root, 'product-alias');
		const dest = join(alias, 'vendor', 'design');
		makeSource(source);
		write(join(outside, 'sentinel.txt'), 'outside\n');
		linkDirectory(outside, alias);

		expect(() =>
			adoptFromSource({
				source,
				dest,
				packages: ['tokens'],
				provenance: worktreeProvenance('v1.0.0', OLD_COMMIT),
			}),
		).toThrow(/destination.*refusing symbolic link/iu);
		expect(readFileSync(join(outside, 'sentinel.txt'), 'utf8')).toBe('outside\n');
		expect(existsSync(join(outside, 'vendor'))).toBe(false);
	});

	it('rejects both canonical source and destination containment directions', () => {
		const root = tempDir();
		const source = join(root, 'source');
		makeSource(source);
		const provenance = worktreeProvenance('v1.0.0', OLD_COMMIT);

		expect(() =>
			adoptFromSource({ source, dest: join(source, 'vendor', 'design'), packages: ['tokens'], provenance }),
		).toThrow(/destination and source must not contain one another/iu);
		expect(() =>
			adoptFromSource({ source, dest: dirname(source), packages: ['tokens'], provenance }),
		).toThrow(/destination and source must not contain one another/iu);
	});

	it.skipIf(process.platform === 'win32')('rejects existing and broken final destination links', () => {
		for (const broken of [false, true]) {
			const root = tempDir();
			const source = join(root, 'source');
			const target = join(root, broken ? 'missing-target' : 'target');
			const dest = join(root, 'vendor', 'design');
			makeSource(source);
			if (!broken) write(join(target, 'sentinel.txt'), 'target\n');
			mkdirSync(dirname(dest), { recursive: true });
			symlinkSync(target, dest, 'dir');

			expect(() =>
				adoptFromSource({
					source,
					dest,
					packages: ['tokens'],
					provenance: worktreeProvenance('v1.0.0', OLD_COMMIT),
				}),
			).toThrow(/destination.*refusing symbolic link/iu);
			if (!broken) expect(readFileSync(join(target, 'sentinel.txt'), 'utf8')).toBe('target\n');
		}
	});

	it('installs into a missing final destination with multiple missing parent components', () => {
		const root = tempDir();
		const source = join(root, 'source');
		const dest = join(root, 'new', 'product', 'vendor', 'design');
		makeSource(source);

		const result = adoptFromSource({
			source,
			dest,
			packages: ['tokens'],
			provenance: worktreeProvenance('v1.0.0', OLD_COMMIT),
		});

		expect(result.outcome).toBe('installed');
		expect(checkAdoption(dest)).toEqual(result.manifest);
	});

	it('rechecks a newly created final destination link before installation', () => {
		const root = tempDir();
		const source = join(root, 'source');
		const target = join(root, 'foreign-target');
		const dest = join(root, 'vendor', 'design');
		makeSource(source);
		write(join(target, 'sentinel.txt'), 'foreign\n');
		let thrown: unknown;

		try {
			adoptWithRuntime(
				{
					source,
					dest,
					packages: ['tokens'],
					provenance: worktreeProvenance('v1.0.0', OLD_COMMIT),
				},
				(point) => {
					if (point === 'stage.ready') linkDirectory(target, dest);
				},
			);
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toMatchObject({ code: ADOPT_EXIT.RECOVERY_REQUIRED });
		expect((thrown as Error).message).toMatch(/destination.*refusing symbolic link/iu);
		expect(readFileSync(join(target, 'sentinel.txt'), 'utf8')).toBe('foreign\n');
	});

	it('detects a source directory replacement after locking', () => {
		const root = tempDir();
		const source = join(root, 'source');
		const displaced = join(root, 'source-displaced');
		const dest = join(root, 'vendor', 'design');
		makeSource(source);

		expect(() =>
			adoptWithRuntime(
				{
					source,
					dest,
					packages: ['tokens'],
					provenance: worktreeProvenance('v1.0.0', OLD_COMMIT),
				},
				(point) => {
					if (point !== 'lock.acquired') return;
					renameSync(source, displaced);
					makeSource(source);
					write(join(source, 'packages', 'tokens', 'src', 'runtime.ts'), 'attacker bytes\n');
				},
			),
		).toThrow(/source.*path identity changed/iu);
		expect(existsSync(dest)).toBe(false);
		expect(existsSync(displaced)).toBe(true);
	});

	it('restores the previous destination when the source changes after backup', () => {
		const root = tempDir();
		const source = join(root, 'source');
		const displaced = join(root, 'source-displaced');
		const dest = join(root, 'vendor', 'design');
		makeSource(source);
		const initial: Parameters<typeof adoptFromSource>[0] = {
			source,
			dest,
			packages: ['tokens'],
			provenance: worktreeProvenance('v1.0.0', OLD_COMMIT),
		};
		adoptWithRuntime(initial);
		const before = adoptionSnapshot(dest);
		let thrown: unknown;

		try {
			adoptWithRuntime(
				{ ...initial, provenance: worktreeProvenance('v1.0.1', NEW_COMMIT) },
				(point) => {
					if (point !== 'backup.durable') return;
					renameSync(source, displaced);
					makeSource(source);
				},
			);
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toMatchObject({ code: ADOPT_EXIT.PRECONDITION });
		expect(existsSync(dest)).toBe(true);
		if (existsSync(dest)) expect(adoptionSnapshot(dest)).toEqual(before);
		expect(existsSync(join(dirname(dest), `.${basename(dest)}.yesid-adopt.backup`))).toBe(false);
	});

	it('preserves the committed destination when the source changes during finalization', () => {
		const root = tempDir();
		const source = join(root, 'source');
		const displaced = join(root, 'source-displaced');
		const dest = join(root, 'vendor', 'design');
		makeSource(source);
		const base: Parameters<typeof adoptFromSource>[0] = {
			source,
			dest,
			packages: ['tokens'],
			provenance: worktreeProvenance('v1.0.0', OLD_COMMIT),
		};
		adoptWithRuntime(base);
		let thrown: unknown;

		try {
			adoptWithRuntime(
				{ ...base, provenance: worktreeProvenance('v1.0.1', NEW_COMMIT) },
				(point) => {
					if (point !== 'recovery.finalize') return;
					renameSync(source, displaced);
					makeSource(source);
				},
			);
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toMatchObject({ code: ADOPT_EXIT.RECOVERY_REQUIRED });
		expect(checkAdoption(dest).provenance.tag.name).toBe('v1.0.1');
		expect(existsSync(displaced)).toBe(true);
	});

	it('returns recovery-required without following a replaced destination parent', () => {
		const root = tempDir();
		const source = join(root, 'source');
		const dest = join(root, 'product', 'vendor', 'design');
		const parent = dirname(dest);
		const displaced = join(root, 'vendor-displaced');
		const attacker = join(root, 'attacker-parent');
		makeSource(source);
		let thrown: unknown;

		try {
			adoptWithRuntime(
				{
					source,
					dest,
					packages: ['tokens'],
					provenance: worktreeProvenance('v1.0.0', OLD_COMMIT),
				},
				(point) => {
					if (point !== 'stage.ready') return;
					renameSync(parent, displaced);
					write(join(attacker, 'sentinel.txt'), 'attacker\n');
					linkDirectory(attacker, parent);
				},
			);
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toMatchObject({ code: ADOPT_EXIT.RECOVERY_REQUIRED });
		expect(readFileSync(join(attacker, 'sentinel.txt'), 'utf8')).toBe('attacker\n');
		expect(readdirSync(displaced).some((entry) => entry.includes('.yesid-adopt.'))).toBe(true);
	});

	it('rejects a symbolic-link alias in check mode', () => {
		const root = tempDir();
		const source = join(root, 'source');
		const dest = join(root, 'vendor', 'design');
		const alias = join(root, 'design-alias');
		makeSource(source);
		adoptFromSource({
			source,
			dest,
			packages: ['tokens'],
			provenance: worktreeProvenance('v1.0.0', OLD_COMMIT),
		});
		linkDirectory(dest, alias);

		expect(() => checkAdoption(alias)).toThrow(/destination.*refusing symbolic link/iu);
	});
});

describe('schema 2 hashing', () => {
	it('length-prefixes records so NUL bytes cannot create structural collisions', () => {
		const root = tempDir();
		const oneFile = join(root, 'one-file');
		const twoFiles = join(root, 'two-files');
		mkdirSync(oneFile);
		mkdirSync(twoFiles);
		writeFileSync(join(oneFile, 'a'), Buffer.from([0x62, 0x00, 0x63, 0x00]));
		writeFileSync(join(twoFiles, 'a'), 'b');
		writeFileSync(join(twoFiles, 'c'), '');

		expect(fullTreeHash(oneFile)).not.toBe(fullTreeHash(twoFiles));
	});

	it.skipIf(process.platform === 'win32')('rejects special filesystem nodes instead of omitting them', () => {
		const root = tempDir();
		const fifo = join(root, 'hidden-fifo');
		const created = spawnSync('mkfifo', [fifo], { encoding: 'utf8' });
		expect(created.status, created.stderr).toBe(0);
		expect(() => fullTreeHash(root)).toThrow(/non-regular filesystem entry/);
	});
});

describe('stable CLI exits', () => {
	async function invoke(argv: string[]): Promise<{ code: number; errors: string[] }> {
		const errors: string[] = [];
		const error = vi.spyOn(console, 'error').mockImplementation((...values: unknown[]) => {
			errors.push(values.map(String).join(' '));
		});
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		try {
			return { code: await main(argv), errors };
		} finally {
			error.mockRestore();
			log.mockRestore();
		}
	}

	it('keeps the public exit-code table stable', () => {
		expect(ADOPT_EXIT).toEqual({
			OK: 0,
			INTERNAL: 1,
			USAGE: 2,
			PRECONDITION: 3,
			LOCKED: 4,
			CHECK_FAILED: 5,
			TRANSACTION_FAILED: 6,
			RECOVERY_REQUIRED: 7,
		});
	});

	it('preserves the transaction exit when acquired-source cleanup also fails', async () => {
		const root = tempDir();
		const source = join(root, 'source');
		makeSource(source);

		await expect(
			adopt(
				{
					mode: 'adopt',
					tag: 'v1.0.0',
					packages: ['tokens'],
					dest: join(root, 'vendor', 'design'),
				},
				{
					checkpoint(point) {
						if (point === 'stage.ready') throw new Error('transaction fault');
					},
				},
				{
					async acquire() {
						return {
							source,
							provenance: worktreeProvenance('v1.0.0', OLD_COMMIT),
							cleanup() {
								throw new Error('cleanup fault');
							},
						};
					},
				},
			),
		).rejects.toMatchObject({ code: ADOPT_EXIT.TRANSACTION_FAILED });
	});

	it.each([
		['usage', ['--wat'], ADOPT_EXIT.USAGE, true],
		['check', ['--check', '--dest', 'missing/vendor/design'], ADOPT_EXIT.CHECK_FAILED, false],
		[
			'precondition',
			[
				'--tag',
				'v1.0.0',
				'--packages',
				'tokens',
				'--dest',
				'missing/vendor/design',
				'--source',
				'missing/source',
			],
			ADOPT_EXIT.PRECONDITION,
			false,
		],
	] as const)('maps %s failures without noisy usage text', async (_label, argv, expected, hasUsage) => {
		const result = await invoke([...argv]);
		expect(result.code).toBe(expected);
		expect(result.errors.some((line) => line.includes('Usage:'))).toBe(hasUsage);
	});
});

describe('parseArgs', () => {
	it('parses local-source adoption and check mode without accepting unknown input', () => {
		expect(
			parseArgs([
				'--tag',
				'v1.2.3',
				'--packages',
				'tokens,motion',
				'--dest',
				'vendor/design',
				'--source',
				'../yesid.dev-design',
			]),
		).toMatchObject({
			mode: 'adopt',
			tag: 'v1.2.3',
			packages: ['tokens', 'motion'],
			dest: 'vendor/design',
			source: '../yesid.dev-design',
		});
		expect(
			parseArgs([
				'--tag',
				'v1.2.3',
				'--packages',
				'tokens',
				'--dest',
				'vendor/design',
				'--archive',
				'./release.tar',
			]),
		).toMatchObject({ mode: 'adopt', archive: './release.tar' });
		expect(parseArgs(['--check', '--dest', 'vendor/design'])).toEqual({
			mode: 'check',
			dest: 'vendor/design',
		});
		expect(() => parseArgs(['--wat'])).toThrow(/unknown argument/);
		expect(() =>
			parseArgs([
				'--tag',
				'v1.2.3',
				'--packages',
				'tokens',
				'--dest',
				'vendor/design',
				'--source',
				'../source',
				'--archive',
				'./release.tar',
			]),
		).toThrow(/mutually exclusive/);
		expect(() =>
			parseArgs(['--tag', 'v1.2.3', '--packages', 'tokens,unknown', '--dest', 'vendor/design']),
		).toThrow(/unknown package/);
		expect(() =>
			parseArgs(['--tag', 'v1.2.3', '--packages', 'config', '--dest', 'vendor/design']),
		).toThrow(/unknown package/);
	});
});
