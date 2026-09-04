import { randomUUID } from 'node:crypto';
import {
	closeSync,
	fsyncSync,
	linkSync,
	lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmSync,
	unlinkSync,
	writeFileSync,
	type Stats,
} from 'node:fs';
import { hostname } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fullTreeHash, type AdoptManifest } from './contract.js';
import {
	PathIdentityChangedError,
	guardDestinationPath,
	type DestinationPathGuard,
} from './path-safety.js';

export const ADOPT_EXIT = {
	OK: 0,
	INTERNAL: 1,
	USAGE: 2,
	PRECONDITION: 3,
	LOCKED: 4,
	CHECK_FAILED: 5,
	TRANSACTION_FAILED: 6,
	RECOVERY_REQUIRED: 7,
} as const;

export type AdoptExitCode = (typeof ADOPT_EXIT)[keyof typeof ADOPT_EXIT];

export class AdoptError extends Error {
	constructor(
		readonly code: AdoptExitCode,
		message: string,
		options?: ErrorOptions,
	) {
		super(message, options);
		this.name = 'AdoptError';
	}
}

export type AdoptCheckpoint =
	| 'lock.reclaim.guard.acquired'
	| 'lock.acquired'
	| 'recovery.checked'
	| 'stage.durable'
	| 'stage.ready'
	| 'noop'
	| 'backup.durable'
	| 'destination.installed'
	| 'postverify.passed'
	| 'commit.durable'
	| 'tombstone.cleanup'
	| 'rollback.started';

export interface AdoptTransactionPaths {
	dest: string;
	lock: string;
	reclaim: string;
	backup: string;
	tombstone: string;
	stage: string;
}

export interface AdoptRuntime {
	checkpoint?(point: AdoptCheckpoint, paths: Readonly<AdoptTransactionPaths>): void;
}

export interface AdoptResult {
	outcome: 'installed' | 'noop';
	manifest: AdoptManifest;
}

interface LockOwner {
	schema: 1;
	token: string;
	pid: number;
	hostname: string;
	dest: string;
	startedAt: string;
}

interface LockAcquisition {
	reclaimedTokens: string[];
}

interface InstallOptions {
	dest: string;
	build(stage: string): AdoptManifest;
	inspect(path: string): AdoptManifest;
	recognize(path: string): boolean;
	destinationGuard?: DestinationPathGuard;
	assertSourceStable?(): void;
}

function entryStats(path: string): Stats | null {
	try {
		return lstatSync(path);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
		throw error;
	}
}

function pathExists(path: string): boolean {
	return entryStats(path) !== null;
}

function assertArtifactNotLink(path: string, label: string): Stats | null {
	const stats = entryStats(path);
	if (stats?.isSymbolicLink()) {
		throw new AdoptError(
			ADOPT_EXIT.RECOVERY_REQUIRED,
			`${label}: refusing symbolic link at ${path}`,
		);
	}
	return stats;
}

interface OwnedEntryIdentity {
	dev: number;
	ino: number;
	mode: number;
}

function ownedDirectoryIdentity(path: string, label: string): OwnedEntryIdentity {
	const stats = assertArtifactNotLink(path, label);
	if (!stats?.isDirectory()) {
		throw new AdoptError(ADOPT_EXIT.RECOVERY_REQUIRED, `${label} is not an owned directory`);
	}
	return { dev: stats.dev, ino: stats.ino, mode: stats.mode };
}

function assertOwnedDirectory(
	path: string,
	label: string,
	expected: OwnedEntryIdentity,
): void {
	const stats = assertArtifactNotLink(path, label);
	if (
		!stats?.isDirectory() ||
		stats.dev !== expected.dev ||
		stats.ino !== expected.ino ||
		stats.mode !== expected.mode
	) {
		throw new AdoptError(ADOPT_EXIT.RECOVERY_REQUIRED, `${label} identity changed at ${path}`);
	}
}

function syncDirectory(path: string): void {
	if (process.platform === 'win32') return;
	const descriptor = openSync(path, 'r');
	try {
		fsyncSync(descriptor);
	} finally {
		closeSync(descriptor);
	}
}

function syncFile(path: string): void {
	const descriptor = openSync(path, 'r');
	try {
		fsyncSync(descriptor);
	} finally {
		closeSync(descriptor);
	}
}

function syncTree(path: string): void {
	const stat = lstatSync(path);
	if (stat.isSymbolicLink()) throw new Error(`refusing to sync symbolic link ${path}`);
	if (stat.isFile()) {
		syncFile(path);
		return;
	}
	if (!stat.isDirectory()) throw new Error(`refusing to sync non-regular entry ${path}`);
	for (const entry of readdirSync(path)) syncTree(join(path, entry));
	syncDirectory(path);
}

function writeDurably(path: string, content: string): void {
	const descriptor = openSync(path, 'wx', 0o600);
	try {
		writeFileSync(descriptor, content, 'utf8');
		fsyncSync(descriptor);
	} finally {
		closeSync(descriptor);
	}
}

function transactionPaths(destInput: string, token: string): AdoptTransactionPaths {
	const dest = resolve(destInput);
	const parent = dirname(dest);
	const prefix = `.${basename(dest)}.yesid-adopt`;
	return {
		dest,
		lock: join(parent, `${prefix}.lock`),
		reclaim: join(parent, `${prefix}.lock.reclaim`),
		backup: join(parent, `${prefix}.backup`),
		tombstone: join(parent, `${prefix}.tombstone-${token}`),
		stage: join(parent, `${prefix}.stage-${token}`),
	};
}

const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function parseLock(path: string): LockOwner {
	const stats = assertArtifactNotLink(path, 'adoption lock');
	if (!stats?.isFile()) {
		throw new AdoptError(ADOPT_EXIT.RECOVERY_REQUIRED, `malformed adoption lock at ${path}`);
	}
	let value: unknown;
	try {
		value = JSON.parse(readFileSync(path, 'utf8'));
	} catch (error) {
		throw new AdoptError(ADOPT_EXIT.RECOVERY_REQUIRED, `malformed adoption lock at ${path}`, {
			cause: error,
		});
	}
	if (!value || typeof value !== 'object') {
		throw new AdoptError(ADOPT_EXIT.RECOVERY_REQUIRED, `malformed adoption lock at ${path}`);
	}
	const owner = value as Partial<LockOwner>;
	if (
		owner.schema !== 1 ||
		typeof owner.token !== 'string' ||
		!TOKEN.test(owner.token) ||
		!Number.isSafeInteger(owner.pid) ||
		(owner.pid ?? 0) <= 0 ||
		typeof owner.hostname !== 'string' ||
		typeof owner.dest !== 'string' ||
		typeof owner.startedAt !== 'string'
	) {
		throw new AdoptError(ADOPT_EXIT.RECOVERY_REQUIRED, `malformed adoption lock at ${path}`);
	}
	return owner as LockOwner;
}

function processIsAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === 'ESRCH') return false;
		if (code === 'EPERM') return true;
		throw error;
	}
}

function createLockCandidate(path: string, owner: LockOwner): void {
	writeDurably(path, `${JSON.stringify(owner)}\n`);
}

function assertLockDestination(owner: LockOwner, paths: AdoptTransactionPaths, path: string): void {
	if (owner.dest !== paths.dest) {
		throw new AdoptError(
			ADOPT_EXIT.RECOVERY_REQUIRED,
			`adoption lock destination mismatch at ${path}`,
		);
	}
}

function lockIsActive(owner: LockOwner): boolean {
	return owner.hostname !== hostname() || processIsAlive(owner.pid);
}

function parseReclaimGuard(path: string): LockOwner {
	if (!lstatSync(path).isFile()) {
		throw new AdoptError(ADOPT_EXIT.RECOVERY_REQUIRED, `malformed reclaim guard at ${path}`);
	}
	return parseLock(path);
}

function acquireReclaimGuard(
	paths: AdoptTransactionPaths,
	owner: LockOwner,
	candidate: string,
): void {
	for (;;) {
		try {
			linkSync(candidate, paths.reclaim);
			syncDirectory(dirname(paths.reclaim));
			return;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
		}

		const current = parseReclaimGuard(paths.reclaim);
		assertLockDestination(current, paths, paths.reclaim);
		if (lockIsActive(current)) {
			throw new AdoptError(
				ADOPT_EXIT.LOCKED,
				`adoption lock reclamation is already running for ${paths.dest}`,
			);
		}

		const stale = `${paths.reclaim}.stale-${current.token}`;
		if (pathExists(stale)) {
			throw new AdoptError(
				ADOPT_EXIT.RECOVERY_REQUIRED,
				`stale reclaim guard requires manual recovery at ${stale}`,
			);
		}
		try {
			renameSync(paths.reclaim, stale);
			syncDirectory(dirname(paths.reclaim));
		} catch (moveError) {
			if (!pathExists(paths.reclaim)) continue;
			const latest = parseReclaimGuard(paths.reclaim);
			assertLockDestination(latest, paths, paths.reclaim);
			if (lockIsActive(latest)) {
				throw new AdoptError(
					ADOPT_EXIT.LOCKED,
					`adoption lock reclamation is already running for ${paths.dest}`,
				);
			}
			throw moveError;
		}
	}
}

function releaseReclaimGuard(paths: AdoptTransactionPaths, token: string): void {
	if (!pathExists(paths.reclaim)) return;
	const owner = parseReclaimGuard(paths.reclaim);
	if (owner.token !== token) {
		throw new AdoptError(
			ADOPT_EXIT.RECOVERY_REQUIRED,
			`reclaim guard ownership changed at ${paths.reclaim}`,
		);
	}
	unlinkSync(paths.reclaim);
	syncDirectory(dirname(paths.reclaim));
}

function acquireLock(
	paths: AdoptTransactionPaths,
	token: string,
	runtime: AdoptRuntime,
	assertParentStable: () => void,
): LockAcquisition {
	const candidate = `${paths.lock}.candidate-${token}`;
	const owner: LockOwner = {
		schema: 1,
		token,
		pid: process.pid,
		hostname: hostname(),
		dest: paths.dest,
		startedAt: new Date().toISOString(),
	};
	createLockCandidate(candidate, owner);
	let guardAcquired = false;
	let lockAcquired = false;
	let parentUnsafe = false;
	try {
		acquireReclaimGuard(paths, owner, candidate);
		guardAcquired = true;
		runtime.checkpoint?.('lock.reclaim.guard.acquired', paths);
		assertParentStable();
		const reclaimedTokens: string[] = [];
		if (pathExists(paths.lock)) {
			const current = parseLock(paths.lock);
			assertLockDestination(current, paths, paths.lock);
			if (lockIsActive(current)) {
				throw new AdoptError(
					ADOPT_EXIT.LOCKED,
					`adoption is already running for ${paths.dest} (pid ${current.pid} on ${current.hostname})`,
				);
			}
			unlinkSync(paths.lock);
			syncDirectory(dirname(paths.lock));
			reclaimedTokens.push(current.token);
		}
		linkSync(candidate, paths.lock);
		lockAcquired = true;
		unlinkSync(candidate);
		syncDirectory(dirname(paths.lock));
		return { reclaimedTokens };
	} catch (error) {
		if (error instanceof PathIdentityChangedError && !error.cleanupSafe) parentUnsafe = true;
		throw error;
	} finally {
		if (!parentUnsafe && pathExists(candidate)) rmSync(candidate, { force: true });
		if (!parentUnsafe && guardAcquired) {
			try {
				releaseReclaimGuard(paths, token);
			} catch (error) {
				if (lockAcquired) releaseLock(paths.lock, token);
				throw error;
			}
		}
	}
}

function releaseLock(path: string, token: string): void {
	if (!pathExists(path)) return;
	const owner = parseLock(path);
	if (owner.token !== token) {
		throw new AdoptError(ADOPT_EXIT.RECOVERY_REQUIRED, `adoption lock ownership changed at ${path}`);
	}
	unlinkSync(path);
	syncDirectory(dirname(path));
}

function isEmptyDirectory(path: string): boolean {
	const stats = assertArtifactNotLink(path, 'adoption path');
	return stats?.isDirectory() === true && readdirSync(path).length === 0;
}

function isRecognized(path: string, recognize: (path: string) => boolean): boolean {
	return isEmptyDirectory(path) || recognize(path);
}

function removeStaleStages(paths: AdoptTransactionPaths, reclaimedTokens: readonly string[]): void {
	let changed = false;
	for (const token of new Set(reclaimedTokens)) {
		const path = transactionPaths(paths.dest, token).stage;
		if (!pathExists(path)) continue;
		if (!lstatSync(path).isDirectory()) {
			throw new AdoptError(
				ADOPT_EXIT.RECOVERY_REQUIRED,
				`stale transaction stage is not a directory at ${path}`,
			);
		}
		rmSync(path, { recursive: true });
		changed = true;
	}
	if (changed) syncDirectory(dirname(paths.dest));
}

function tombstones(paths: AdoptTransactionPaths): string[] {
	const parent = dirname(paths.dest);
	const prefix = `.${basename(paths.dest)}.yesid-adopt.tombstone-`;
	return readdirSync(parent)
		.filter((entry) => entry.startsWith(prefix) && TOKEN.test(entry.slice(prefix.length)))
		.map((entry) => {
			const path = join(parent, entry);
			assertArtifactNotLink(path, 'adoption tombstone');
			return path;
		});
}

function cleanupTombstone(
	paths: AdoptTransactionPaths,
	tombstone: string,
	runtime: AdoptRuntime,
	assertStable?: () => void,
): void {
	try {
		runtime.checkpoint?.('tombstone.cleanup', { ...paths, tombstone });
		assertStable?.();
		assertArtifactNotLink(tombstone, 'adoption tombstone');
		rmSync(tombstone, { recursive: true, force: true });
		syncDirectory(dirname(paths.dest));
	} catch {
		// A committed destination does not depend on retired backup cleanup.
	}
}

function removeCommittedTombstones(
	paths: AdoptTransactionPaths,
	inspect: (path: string) => AdoptManifest,
	runtime: AdoptRuntime,
): void {
	const found = tombstones(paths);
	if (found.length === 0) return;
	try {
		inspect(paths.dest);
	} catch (error) {
		throw new AdoptError(
			ADOPT_EXIT.RECOVERY_REQUIRED,
			`cannot clean committed tombstones while destination is invalid at ${paths.dest}`,
			{ cause: error },
		);
	}
	for (const tombstone of found) cleanupTombstone(paths, tombstone, runtime);
}

function recover(
	paths: AdoptTransactionPaths,
	inspect: (path: string) => AdoptManifest,
	recognize: (path: string) => boolean,
	reclaimedTokens: readonly string[],
	runtime: AdoptRuntime,
): void {
	const backup = assertArtifactNotLink(paths.backup, 'adoption backup');
	if (backup) {
		if (!isRecognized(paths.backup, recognize)) {
			throw new AdoptError(
				ADOPT_EXIT.RECOVERY_REQUIRED,
				`unrecognized durable backup at ${paths.backup}`,
			);
		}
		const backupFingerprint = fullTreeHash(paths.backup);
		if (!pathExists(paths.dest)) {
			renameSync(paths.backup, paths.dest);
			syncDirectory(dirname(paths.dest));
			if (fullTreeHash(paths.dest) !== backupFingerprint) {
				throw new AdoptError(ADOPT_EXIT.RECOVERY_REQUIRED, `restored backup verification failed`);
			}
		} else {
			let currentIsValid = false;
			try {
				inspect(paths.dest);
				currentIsValid = true;
			} catch {
				currentIsValid = false;
			}
			if (currentIsValid) {
				if (pathExists(paths.tombstone)) {
					throw new AdoptError(
						ADOPT_EXIT.RECOVERY_REQUIRED,
						`recovery tombstone collision at ${paths.tombstone}`,
					);
				}
				try {
					renameSync(paths.backup, paths.tombstone);
					syncDirectory(dirname(paths.dest));
				} catch (error) {
					throw new AdoptError(
						ADOPT_EXIT.RECOVERY_REQUIRED,
						`could not durably retire recovered backup at ${paths.backup}`,
						{ cause: error },
					);
				}
			} else if (isRecognized(paths.dest, recognize)) {
				rmSync(paths.dest, { recursive: true });
				renameSync(paths.backup, paths.dest);
				syncDirectory(dirname(paths.dest));
				if (fullTreeHash(paths.dest) !== backupFingerprint) {
					throw new AdoptError(ADOPT_EXIT.RECOVERY_REQUIRED, `restored backup verification failed`);
				}
			} else {
				throw new AdoptError(
					ADOPT_EXIT.RECOVERY_REQUIRED,
					`destination and durable backup require manual recovery`,
				);
			}
		}
	}
	removeCommittedTombstones(paths, inspect, runtime);
	removeStaleStages(paths, reclaimedTokens);
}

function verifiedManifest(
	path: string,
	expected: AdoptManifest,
	inspect: (path: string) => AdoptManifest,
): AdoptManifest {
	const actual = inspect(path);
	if (!isDeepStrictEqual(actual, expected)) {
		throw new Error(`installed manifest differs from staged manifest`);
	}
	return actual;
}

function assertTransactionArtifacts(paths: AdoptTransactionPaths): void {
	for (const [path, label] of [
		[paths.lock, 'adoption lock'],
		[paths.reclaim, 'adoption reclaim guard'],
		[paths.backup, 'adoption backup'],
		[paths.tombstone, 'adoption tombstone'],
		[paths.stage, 'adoption stage'],
	] as const) {
		assertArtifactNotLink(path, label);
	}
}

function rollback(
	paths: AdoptTransactionPaths,
	oldExists: boolean,
	oldFingerprint: string | null,
	installed: boolean,
	runtime: AdoptRuntime,
	destinationGuard: DestinationPathGuard,
): void {
	runtime.checkpoint?.('rollback.started', paths);
	destinationGuard.assertParentStable();
	destinationGuard.assertLeafStable();
	if (installed && pathExists(paths.dest)) {
		rmSync(paths.dest, { recursive: true });
		destinationGuard.markLeafMissing();
	}
	assertArtifactNotLink(paths.backup, 'adoption backup');
	assertArtifactNotLink(paths.tombstone, 'adoption tombstone');
	if (pathExists(paths.backup) && pathExists(paths.tombstone)) {
		throw new Error(`rollback found both a backup and tombstone`);
	}
	const restore = pathExists(paths.backup)
		? paths.backup
		: pathExists(paths.tombstone)
			? paths.tombstone
			: null;
	if (restore) {
		if (pathExists(paths.dest)) rmSync(paths.dest, { recursive: true });
		renameSync(restore, paths.dest);
		destinationGuard.markLeafCurrent();
	}
	const stage = assertArtifactNotLink(paths.stage, 'adoption stage');
	if (stage) rmSync(paths.stage, { recursive: true, force: true });
	syncDirectory(dirname(paths.dest));
	if (oldExists) {
		if (!pathExists(paths.dest) || fullTreeHash(paths.dest) !== oldFingerprint) {
			throw new Error(`rollback did not restore the previous destination`);
		}
	} else if (pathExists(paths.dest)) {
		throw new Error(`rollback did not restore the missing destination`);
	}
}

export function installAdoption(
	options: InstallOptions,
	runtime: AdoptRuntime = {},
): AdoptResult {
	const destinationGuard = options.destinationGuard ?? guardDestinationPath(options.dest);
	destinationGuard.prepareParent();
	const token = randomUUID();
	const paths = transactionPaths(destinationGuard.path, token);
	destinationGuard.assertParentStable();
	options.assertSourceStable?.();
	assertTransactionArtifacts(paths);
	let acquisition: LockAcquisition;
	try {
		acquisition = acquireLock(paths, token, runtime, () => destinationGuard.assertParentStable());
	} catch (error) {
		if (error instanceof PathIdentityChangedError) {
			throw new AdoptError(ADOPT_EXIT.RECOVERY_REQUIRED, error.message, { cause: error });
		}
		throw error;
	}
	let oldExists = false;
	let oldFingerprint: string | null = null;
	let destinationStateCaptured = false;
	let installed = false;
	let stageOwned = false;
	let stageUnsafe = false;
	let stageIdentity: OwnedEntryIdentity | null = null;
	let parentUnsafe = false;
	let manifest: AdoptManifest | undefined;
	const assertStable = (): void => {
		options.assertSourceStable?.();
		assertDestinationStable();
	};
	const assertDestinationStable = (): void => {
		destinationGuard.assertParentStable();
		destinationGuard.assertLeafStable();
		assertTransactionArtifacts(paths);
		if (stageOwned && stageIdentity) {
			try {
				assertOwnedDirectory(paths.stage, 'adoption stage', stageIdentity);
			} catch (error) {
				stageUnsafe = true;
				throw error;
			}
		}
	};
	const checkpoint = (point: AdoptCheckpoint): void => {
		runtime.checkpoint?.(point, paths);
		assertStable();
	};
	try {
		checkpoint('lock.acquired');
		recover(
			paths,
			options.inspect,
			options.recognize,
			acquisition.reclaimedTokens,
			runtime,
		);
		destinationGuard.refreshLeaf();
		checkpoint('recovery.checked');
		if (pathExists(paths.dest) && !isRecognized(paths.dest, options.recognize)) {
			throw new AdoptError(
				ADOPT_EXIT.PRECONDITION,
				`refusing to replace a non-adoption destination at ${paths.dest}`,
			);
		}
		oldExists = pathExists(paths.dest);
		oldFingerprint = oldExists ? fullTreeHash(paths.dest) : null;
		destinationStateCaptured = true;
		assertStable();
		if (pathExists(paths.stage)) {
			throw new AdoptError(ADOPT_EXIT.RECOVERY_REQUIRED, `adoption stage already exists`);
		}
		mkdirSync(paths.stage);
		stageOwned = true;
		stageIdentity = ownedDirectoryIdentity(paths.stage, 'adoption stage');
		manifest = options.build(paths.stage);
		options.assertSourceStable?.();
		verifiedManifest(paths.stage, manifest, options.inspect);
		syncTree(paths.stage);
		checkpoint('stage.durable');
		checkpoint('stage.ready');
		if (pathExists(paths.dest)) {
			try {
				const current = options.inspect(paths.dest);
				if (isDeepStrictEqual(current, manifest)) {
					rmSync(paths.stage, { recursive: true });
					stageOwned = false;
					stageIdentity = null;
					checkpoint('noop');
					return { outcome: 'noop', manifest: current };
				}
			} catch {
				// A recognized but corrupted adoption is repairable by replacement.
			}
		}
		if (assertArtifactNotLink(paths.backup, 'adoption backup')) {
			throw new AdoptError(ADOPT_EXIT.RECOVERY_REQUIRED, `durable backup was not recovered`);
		}
		if (oldExists) {
			assertStable();
			renameSync(paths.dest, paths.backup);
			destinationGuard.markLeafMissing();
			syncDirectory(dirname(paths.dest));
			checkpoint('backup.durable');
		}
		assertStable();
		assertArtifactNotLink(paths.stage, 'adoption stage');
		renameSync(paths.stage, paths.dest);
		stageOwned = false;
		stageIdentity = null;
		installed = true;
		destinationGuard.markLeafCurrent();
		syncDirectory(dirname(paths.dest));
		checkpoint('destination.installed');
		const accepted = verifiedManifest(paths.dest, manifest, options.inspect);
		checkpoint('postverify.passed');
		if (pathExists(paths.backup)) {
			assertArtifactNotLink(paths.backup, 'adoption backup');
			if (pathExists(paths.tombstone)) {
				throw new AdoptError(ADOPT_EXIT.RECOVERY_REQUIRED, `adoption tombstone already exists`);
			}
			renameSync(paths.backup, paths.tombstone);
			syncDirectory(dirname(paths.dest));
		}
		try {
			runtime.checkpoint?.('commit.durable', paths);
		} catch {
			// Commit is already durable; a checkpoint failure cannot roll it back.
		}
		assertDestinationStable();
		if (pathExists(paths.tombstone)) {
			cleanupTombstone(paths, paths.tombstone, runtime, assertDestinationStable);
			assertDestinationStable();
		}
		return { outcome: 'installed', manifest: accepted };
	} catch (error) {
		if (error instanceof PathIdentityChangedError) {
			parentUnsafe = !error.cleanupSafe;
			if (error.subject === 'source' && destinationStateCaptured) {
				try {
					rollback(paths, oldExists, oldFingerprint, installed, runtime, destinationGuard);
				} catch (rollbackError) {
					if (rollbackError instanceof PathIdentityChangedError && !rollbackError.cleanupSafe) {
						parentUnsafe = true;
					}
					throw new AdoptError(
						ADOPT_EXIT.RECOVERY_REQUIRED,
						`adoption recovery requires manual intervention for ${paths.dest}`,
						{ cause: rollbackError },
					);
				}
			}
			const code =
				error.subject === 'source' ? ADOPT_EXIT.PRECONDITION : ADOPT_EXIT.RECOVERY_REQUIRED;
			throw new AdoptError(code, error.message, { cause: error });
		}
		if (error instanceof AdoptError) throw error;
		try {
			rollback(paths, oldExists, oldFingerprint, installed, runtime, destinationGuard);
		} catch (rollbackError) {
			if (rollbackError instanceof PathIdentityChangedError && !rollbackError.cleanupSafe) {
				parentUnsafe = true;
			}
			throw new AdoptError(
				ADOPT_EXIT.RECOVERY_REQUIRED,
				`adoption recovery requires manual intervention for ${paths.dest}`,
				{ cause: rollbackError },
			);
		}
		throw new AdoptError(
			ADOPT_EXIT.TRANSACTION_FAILED,
			`adoption transaction failed; previous destination was restored`,
			{ cause: error },
		);
	} finally {
		if (!parentUnsafe) {
			destinationGuard.assertParentStable();
			if (stageOwned && !stageUnsafe && pathExists(paths.stage)) {
				if (stageIdentity) assertOwnedDirectory(paths.stage, 'adoption stage', stageIdentity);
				assertArtifactNotLink(paths.stage, 'adoption stage');
				rmSync(paths.stage, { recursive: true, force: true });
			}
			releaseLock(paths.lock, token);
		}
	}
}
