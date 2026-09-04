import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
	ADOPT_EXIT,
	installAdoption,
	type AdoptCheckpoint,
	type AdoptRuntime,
	type AdoptTransactionPaths,
} from '../../../tools/adopt/transaction.js';
import type { AdoptManifest } from '../../../tools/adopt/contract.js';

const scratch: string[] = [];
const DEAD_PID = 2_147_483_647;
const ZERO_SHA1 = '0'.repeat(40);
const ZERO_SHA256 = `sha256:${'0'.repeat(64)}`;

type HardeningCheckpoint =
	| AdoptCheckpoint
	| 'lock.reclaim.guard.acquired'
	| 'stage.durable'
	| 'commit.durable'
	| 'tombstone.cleanup';

type HardeningPaths = AdoptTransactionPaths & {
	reclaim: string;
	tombstone: string;
};

function tempDir(): string {
	const path = mkdtempSync(join(tmpdir(), 'yesid-adopt-hardening-'));
	scratch.push(path);
	return path;
}

function write(path: string, content: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content, 'utf8');
}

function manifest(tag: string): AdoptManifest {
	return {
		schema: 2,
		repository: 'github.com/mgkdante/yesid.dev-design',
		provenance: {
			mode: 'worktree',
			tag: { name: tag, object: ZERO_SHA1, peeledCommit: ZERO_SHA1 },
			asset: null,
		},
		packages: ['tokens'],
		exclusionPolicyDigest: ZERO_SHA256,
		toolDigest: ZERO_SHA256,
		treeHash: ZERO_SHA256,
	};
}

function inspect(path: string): AdoptManifest {
	return JSON.parse(readFileSync(join(path, 'manifest.json'), 'utf8')) as AdoptManifest;
}

function runtime(
	checkpoint: (point: HardeningCheckpoint, paths: Readonly<HardeningPaths>) => void,
): AdoptRuntime {
	return { checkpoint } as unknown as AdoptRuntime;
}

function install(
	dest: string,
	tag: string,
	adoptRuntime: AdoptRuntime = {},
): ReturnType<typeof installAdoption> {
	const expected = manifest(tag);
	return installAdoption(
		{
			dest,
			build(stage) {
				write(join(stage, 'manifest.json'), `${JSON.stringify(expected)}\n`);
				return expected;
			},
			inspect,
			recognize(path) {
				try {
					inspect(path);
					return true;
				} catch {
					return false;
				}
			},
		},
		adoptRuntime,
	);
}

function prefix(dest: string): string {
	return join(dirname(dest), `.${basename(dest)}.yesid-adopt`);
}

function writeLock(dest: string, token: string, pid: number): string {
	const path = `${prefix(dest)}.lock`;
	write(
		path,
		`${JSON.stringify({
			schema: 1,
			token,
			pid,
			hostname: hostname(),
			dest: resolve(dest),
			startedAt: new Date().toISOString(),
		})}\n`,
	);
	return path;
}

function crashInstall(
	root: string,
	dest: string,
	tag: string,
	point: HardeningCheckpoint,
	partialTombstone = false,
): ReturnType<typeof spawnSync> {
	const script = join(root, `crash-${point.replaceAll('.', '-')}.ts`);
	const transactionUrl = new URL('../../../tools/adopt/transaction.ts', import.meta.url).href;
	const expected = manifest(tag);
	write(
		script,
		[
			`import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';`,
			`import { join } from 'node:path';`,
			`import { installAdoption } from ${JSON.stringify(transactionUrl)};`,
			`const dest = ${JSON.stringify(dest)};`,
			`const expected = ${JSON.stringify(expected)};`,
			`const inspect = (path) => JSON.parse(readFileSync(join(path, 'manifest.json'), 'utf8'));`,
			`installAdoption({`,
			`  dest,`,
			`  build(stage) { mkdirSync(stage, { recursive: true }); writeFileSync(join(stage, 'manifest.json'), JSON.stringify(expected) + '\\n'); return expected; },`,
			`  inspect,`,
			`  recognize(path) { try { inspect(path); return true; } catch { return false; } },`,
			`}, { checkpoint(point, paths) {`,
			`  if (point !== ${JSON.stringify(point)}) return;`,
			...(partialTombstone
				? [
						`  rmSync(join(paths.tombstone, 'manifest.json'));`,
						`  writeFileSync(join(paths.tombstone, 'partial.tmp'), 'partial cleanup\\n');`,
					]
				: []),
			`  process.exit(97);`,
			`} });`,
		].join('\n'),
	);
	return spawnSync('bun', [script], { encoding: 'utf8' });
}

afterEach(() => {
	for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('transaction lock hardening', () => {
	it.skipIf(process.platform === 'win32')('does not follow a parent replaced during reclaim locking', () => {
		const root = tempDir();
		const dest = join(root, 'product', 'vendor', 'design');
		const parent = dirname(dest);
		const displaced = join(root, 'reclaim-displaced');
		const attacker = join(root, 'reclaim-attacker');
		let thrown: unknown;

		try {
			install(
				dest,
				'v1.0.0',
				runtime((point) => {
					if (point !== 'lock.reclaim.guard.acquired') return;
					renameSync(parent, displaced);
					write(join(attacker, 'sentinel.txt'), 'attacker\n');
					symlinkSync(attacker, parent, 'dir');
				}),
			);
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toMatchObject({ code: ADOPT_EXIT.RECOVERY_REQUIRED });
		expect(readFileSync(join(attacker, 'sentinel.txt'), 'utf8')).toBe('attacker\n');
		expect(readdirSync(displaced).some((entry) => entry.includes('.yesid-adopt.'))).toBe(true);
	});

	it('re-reads the lock under a fixed reclaim guard and preserves a newly live owner', () => {
		const root = tempDir();
		const dest = join(root, 'vendor', 'design');
		const staleToken = randomUUID();
		const liveToken = randomUUID();
		const lock = writeLock(dest, staleToken, DEAD_PID);
		let interleaved = false;
		let reclaim = '';

		let thrown: unknown;
		try {
			install(
				dest,
				'v1.0.0',
				runtime((point, paths) => {
					if (point !== 'lock.reclaim.guard.acquired') return;
					interleaved = true;
					reclaim = paths.reclaim;
					expect(existsSync(reclaim)).toBe(true);
					rmSync(paths.lock);
					writeLock(dest, liveToken, process.pid);
				}),
			);
		} catch (error) {
			thrown = error;
		}

		expect(interleaved).toBe(true);
		expect(thrown).toMatchObject({ code: ADOPT_EXIT.LOCKED });
		expect(JSON.parse(readFileSync(lock, 'utf8'))).toMatchObject({ token: liveToken });
		expect(existsSync(reclaim)).toBe(false);
		expect(existsSync(dest)).toBe(false);
	});

	it('removes only the stale stage bound to the reclaimed lock token', () => {
		const root = tempDir();
		const dest = join(root, 'vendor', 'design');
		const staleToken = randomUUID();
		const unrelatedToken = randomUUID();
		writeLock(dest, staleToken, DEAD_PID);
		const staleStage = `${prefix(dest)}.stage-${staleToken}`;
		const unrelatedStage = `${prefix(dest)}.stage-${unrelatedToken}`;
		const arbitraryPrefixMatch = `${prefix(dest)}.stage-keep-me`;
		write(join(staleStage, 'partial.tmp'), 'interrupted transaction\n');
		write(join(unrelatedStage, 'personal.txt'), 'not this transaction\n');
		write(join(arbitraryPrefixMatch, 'personal.txt'), 'not a transaction\n');

		const result = install(dest, 'v1.0.0');

		expect(result.outcome).toBe('installed');
		expect(existsSync(staleStage)).toBe(false);
		expect(readFileSync(join(unrelatedStage, 'personal.txt'), 'utf8')).toBe(
			'not this transaction\n',
		);
		expect(readFileSync(join(arbitraryPrefixMatch, 'personal.txt'), 'utf8')).toBe(
			'not a transaction\n',
		);
	});

	it('publishes a complete reclaim owner before process death and recovers it', () => {
		const root = tempDir();
		const dest = join(root, 'vendor', 'design');
		const crashed = crashInstall(root, dest, 'v1.0.0', 'lock.reclaim.guard.acquired');
		const reclaim = `${prefix(dest)}.lock.reclaim`;

		expect(crashed.status, String(crashed.stderr)).toBe(97);
		expect(JSON.parse(readFileSync(reclaim, 'utf8'))).toMatchObject({
			schema: 1,
			dest: resolve(dest),
		});
		expect(install(dest, 'v1.0.0').outcome).toBe('installed');
		expect(existsSync(reclaim)).toBe(false);
	});
});

describe('transaction durability hardening', () => {
	it.skipIf(process.platform === 'win32')('refuses a symlinked durable backup without touching its target', () => {
		const root = tempDir();
		const dest = join(root, 'vendor', 'design');
		const foreign = join(root, 'foreign-adoption');
		const backup = `${prefix(dest)}.backup`;
		const expected = manifest('v1.0.0');
		write(join(foreign, 'manifest.json'), `${JSON.stringify(expected)}\n`);
		write(join(foreign, 'sentinel.txt'), 'foreign\n');
		mkdirSync(dirname(dest), { recursive: true });
		symlinkSync(foreign, backup, 'dir');

		let thrown: unknown;
		try {
			install(dest, 'v1.0.0');
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toMatchObject({ code: ADOPT_EXIT.RECOVERY_REQUIRED });
		expect((thrown as Error).message).toMatch(/backup.*refusing symbolic link/iu);
		expect(readFileSync(join(foreign, 'sentinel.txt'), 'utf8')).toBe('foreign\n');
		expect(existsSync(dest)).toBe(false);
	});

	it('rechecks the owned stage identity immediately before installation', () => {
		const root = tempDir();
		const dest = join(root, 'vendor', 'design');
		const displaced = join(root, 'displaced-stage');
		let replacement = '';
		let thrown: unknown;

		try {
			install(
				dest,
				'v1.0.0',
				runtime((point, paths) => {
					if (point !== 'stage.ready') return;
					replacement = paths.stage;
					renameSync(paths.stage, displaced);
					write(join(paths.stage, 'manifest.json'), `${JSON.stringify(manifest('v1.0.0'))}\n`);
					write(join(paths.stage, 'foreign.txt'), 'foreign\n');
				}),
			);
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toMatchObject({ code: ADOPT_EXIT.RECOVERY_REQUIRED });
		expect((thrown as Error).message).toMatch(/stage.*identity changed/iu);
		expect(readFileSync(join(replacement, 'foreign.txt'), 'utf8')).toBe('foreign\n');
		expect(existsSync(displaced)).toBe(true);
		expect(existsSync(dest)).toBe(false);
	});

	it.skipIf(process.platform === 'win32')('refuses a symlinked committed tombstone without cleanup', () => {
		const root = tempDir();
		const dest = join(root, 'vendor', 'design');
		const foreign = join(root, 'foreign-tombstone');
		install(dest, 'v1.0.0');
		write(join(foreign, 'sentinel.txt'), 'foreign\n');
		const tombstone = `${prefix(dest)}.tombstone-${randomUUID()}`;
		symlinkSync(foreign, tombstone, 'dir');

		let thrown: unknown;
		try {
			install(dest, 'v1.0.0');
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toMatchObject({ code: ADOPT_EXIT.RECOVERY_REQUIRED });
		expect((thrown as Error).message).toMatch(/tombstone.*refusing symbolic link/iu);
		expect(readFileSync(join(foreign, 'sentinel.txt'), 'utf8')).toBe('foreign\n');
		expect(existsSync(tombstone)).toBe(true);
	});

	it('syncs the complete stage before declaring it ready', () => {
		const root = tempDir();
		const dest = join(root, 'vendor', 'design');
		const checkpoints: HardeningCheckpoint[] = [];

		install(
			dest,
			'v1.0.0',
			runtime((point) => {
				checkpoints.push(point);
			}),
		);

		expect(checkpoints).toContain('stage.durable');
		expect(checkpoints.indexOf('stage.durable')).toBeLessThan(checkpoints.indexOf('stage.ready'));
	});

	it('does not roll back a verified destination when tombstone cleanup fails', () => {
		const root = tempDir();
		const dest = join(root, 'vendor', 'design');
		install(dest, 'v1.0.0');
		let cleanupAttempted = false;
		let tombstone = '';

		const result = install(
			dest,
			'v1.0.1',
			runtime((point, paths) => {
				if (point !== 'tombstone.cleanup') return;
				cleanupAttempted = true;
				tombstone = paths.tombstone;
				throw new Error('injected cleanup failure');
			}),
		);

		expect(cleanupAttempted).toBe(true);
		expect(result.outcome).toBe('installed');
		expect(inspect(dest).provenance.tag.name).toBe('v1.0.1');
		expect(existsSync(`${prefix(dest)}.backup`)).toBe(false);
		expect(existsSync(tombstone)).toBe(true);
		expect(install(dest, 'v1.0.1').outcome).toBe('noop');
		expect(existsSync(tombstone)).toBe(false);
	});

	it('atomically retires a recovery backup before best-effort cleanup', () => {
		const root = tempDir();
		const dest = join(root, 'vendor', 'design');
		install(dest, 'v1.0.0');
		const crashed = crashInstall(root, dest, 'v1.0.1', 'destination.installed');
		expect(crashed.status, String(crashed.stderr)).toBe(97);
		expect(existsSync(`${prefix(dest)}.backup`)).toBe(true);
		expect(inspect(dest).provenance.tag.name).toBe('v1.0.1');
		let cleanupAttempted = false;
		let tombstone = '';

		const recovered = install(
			dest,
			'v1.0.1',
			runtime((point, paths) => {
				if (point !== 'tombstone.cleanup') return;
				cleanupAttempted = true;
				tombstone = paths.tombstone;
				throw new Error('injected recovery cleanup failure');
			}),
		);

		expect(recovered.outcome).toBe('noop');
		expect(cleanupAttempted).toBe(true);
		expect(existsSync(`${prefix(dest)}.backup`)).toBe(false);
		expect(existsSync(tombstone)).toBe(true);
		expect(inspect(dest).provenance.tag.name).toBe('v1.0.1');
		expect(install(dest, 'v1.0.1').outcome).toBe('noop');
		expect(existsSync(tombstone)).toBe(false);
	});

	it('recovers a committed install after process death before tombstone cleanup', () => {
		const root = tempDir();
		const dest = join(root, 'vendor', 'design');
		install(dest, 'v1.0.0');
		const crashed = crashInstall(root, dest, 'v1.0.1', 'commit.durable');
		expect(crashed.status, String(crashed.stderr)).toBe(97);
		expect(inspect(dest).provenance.tag.name).toBe('v1.0.1');
		expect(existsSync(`${prefix(dest)}.lock`)).toBe(true);
		expect(readdirSync(dirname(dest)).some((entry) => entry.includes('.tombstone-'))).toBe(true);

		const recovered = install(dest, 'v1.0.1');
		expect(recovered.outcome).toBe('noop');
		expect(inspect(dest).provenance.tag.name).toBe('v1.0.1');
		expect(existsSync(`${prefix(dest)}.lock`)).toBe(false);
		expect(readdirSync(dirname(dest)).some((entry) => entry.includes('.tombstone-'))).toBe(false);
	});

	it('cleans a partial committed tombstone as opaque garbage', () => {
		const root = tempDir();
		const dest = join(root, 'vendor', 'design');
		install(dest, 'v1.0.0');
		const crashed = crashInstall(root, dest, 'v1.0.1', 'tombstone.cleanup', true);
		expect(crashed.status, String(crashed.stderr)).toBe(97);
		expect(inspect(dest).provenance.tag.name).toBe('v1.0.1');
		expect(readdirSync(dirname(dest)).some((entry) => entry.includes('.tombstone-'))).toBe(true);

		const recovered = install(dest, 'v1.0.1');
		expect(recovered.outcome).toBe('noop');
		expect(inspect(dest).provenance.tag.name).toBe('v1.0.1');
		expect(readdirSync(dirname(dest)).some((entry) => entry.includes('.tombstone-'))).toBe(false);
	});
});
