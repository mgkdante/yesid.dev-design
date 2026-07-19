import { randomUUID } from 'node:crypto';
import {
	closeSync,
	existsSync,
	fsyncSync,
	linkSync,
	mkdirSync,
	openSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { hostname } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fullTreeHash, type AdoptManifest } from './contract.js';

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
	| 'lock.acquired'
	| 'recovery.checked'
	| 'stage.ready'
	| 'noop'
	| 'backup.durable'
	| 'destination.installed'
	| 'postverify.passed'
	| 'rollback.started';

export interface AdoptTransactionPaths {
	dest: string;
	lock: string;
	backup: string;
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

interface InstallOptions {
	dest: string;
	build(stage: string): AdoptManifest;
	inspect(path: string): AdoptManifest;
	recognize(path: string): boolean;
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
		backup: join(parent, `${prefix}.backup`),
		stage: join(parent, `${prefix}.stage-${token}`),
	};
}

function parseLock(path: string): LockOwner {
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

function acquireLock(paths: AdoptTransactionPaths, token: string): LockOwner {
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
	try {
		for (;;) {
			try {
				linkSync(candidate, paths.lock);
				unlinkSync(candidate);
				syncDirectory(dirname(paths.lock));
				return owner;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
				const current = parseLock(paths.lock);
				if (current.dest !== paths.dest) {
					throw new AdoptError(
						ADOPT_EXIT.RECOVERY_REQUIRED,
						`adoption lock destination mismatch at ${paths.lock}`,
					);
				}
				if (current.hostname !== hostname() || processIsAlive(current.pid)) {
					throw new AdoptError(
						ADOPT_EXIT.LOCKED,
						`adoption is already running for ${paths.dest} (pid ${current.pid} on ${current.hostname})`,
					);
				}
				const stale = `${paths.lock}.stale-${current.token}`;
				try {
					renameSync(paths.lock, stale);
				} catch (moveError) {
					if (!existsSync(paths.lock)) continue;
					throw moveError;
				}
				rmSync(stale, { force: true });
			}
		}
	} finally {
		if (existsSync(candidate)) rmSync(candidate, { force: true });
	}
}

function releaseLock(path: string, token: string): void {
	if (!existsSync(path)) return;
	const owner = parseLock(path);
	if (owner.token !== token) {
		throw new AdoptError(ADOPT_EXIT.RECOVERY_REQUIRED, `adoption lock ownership changed at ${path}`);
	}
	unlinkSync(path);
	syncDirectory(dirname(path));
}

function isEmptyDirectory(path: string): boolean {
	return statSync(path).isDirectory() && readdirSync(path).length === 0;
}

function isRecognized(path: string, recognize: (path: string) => boolean): boolean {
	return isEmptyDirectory(path) || recognize(path);
}

function removeStaleStages(paths: AdoptTransactionPaths): void {
	const parent = dirname(paths.dest);
	const prefix = `.${basename(paths.dest)}.yesid-adopt.stage-`;
	for (const entry of readdirSync(parent)) {
		if (!entry.startsWith(prefix)) continue;
		const path = join(parent, entry);
		if (path !== paths.stage) rmSync(path, { recursive: true, force: true });
	}
}

function recover(
	paths: AdoptTransactionPaths,
	inspect: (path: string) => AdoptManifest,
	recognize: (path: string) => boolean,
): void {
	if (existsSync(paths.backup)) {
		if (!isRecognized(paths.backup, recognize)) {
			throw new AdoptError(
				ADOPT_EXIT.RECOVERY_REQUIRED,
				`unrecognized durable backup at ${paths.backup}`,
			);
		}
		const backupFingerprint = fullTreeHash(paths.backup);
		if (!existsSync(paths.dest)) {
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
				rmSync(paths.backup, { recursive: true });
				syncDirectory(dirname(paths.dest));
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
	removeStaleStages(paths);
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

function rollback(
	paths: AdoptTransactionPaths,
	oldExists: boolean,
	oldFingerprint: string | null,
	installed: boolean,
	runtime: AdoptRuntime,
): void {
	runtime.checkpoint?.('rollback.started', paths);
	if (installed && existsSync(paths.dest)) rmSync(paths.dest, { recursive: true });
	if (existsSync(paths.backup)) {
		if (existsSync(paths.dest)) rmSync(paths.dest, { recursive: true });
		renameSync(paths.backup, paths.dest);
	}
	if (existsSync(paths.stage)) rmSync(paths.stage, { recursive: true, force: true });
	syncDirectory(dirname(paths.dest));
	if (oldExists) {
		if (!existsSync(paths.dest) || fullTreeHash(paths.dest) !== oldFingerprint) {
			throw new Error(`rollback did not restore the previous destination`);
		}
	} else if (existsSync(paths.dest)) {
		throw new Error(`rollback did not restore the missing destination`);
	}
}

export function installAdoption(
	options: InstallOptions,
	runtime: AdoptRuntime = {},
): AdoptResult {
	const token = randomUUID();
	const paths = transactionPaths(options.dest, token);
	mkdirSync(dirname(paths.dest), { recursive: true });
	acquireLock(paths, token);
	let oldExists = false;
	let oldFingerprint: string | null = null;
	let installed = false;
	let manifest: AdoptManifest | undefined;
	try {
		runtime.checkpoint?.('lock.acquired', paths);
		recover(paths, options.inspect, options.recognize);
		runtime.checkpoint?.('recovery.checked', paths);
		if (existsSync(paths.dest) && !isRecognized(paths.dest, options.recognize)) {
			throw new AdoptError(
				ADOPT_EXIT.PRECONDITION,
				`refusing to replace a non-adoption destination at ${paths.dest}`,
			);
		}
		oldExists = existsSync(paths.dest);
		oldFingerprint = oldExists ? fullTreeHash(paths.dest) : null;
		mkdirSync(paths.stage);
		manifest = options.build(paths.stage);
		verifiedManifest(paths.stage, manifest, options.inspect);
		runtime.checkpoint?.('stage.ready', paths);
		if (existsSync(paths.dest)) {
			try {
				const current = options.inspect(paths.dest);
				if (isDeepStrictEqual(current, manifest)) {
					rmSync(paths.stage, { recursive: true });
					runtime.checkpoint?.('noop', paths);
					return { outcome: 'noop', manifest: current };
				}
			} catch {
				// A recognized but corrupted adoption is repairable by replacement.
			}
		}
		if (existsSync(paths.backup)) {
			throw new AdoptError(ADOPT_EXIT.RECOVERY_REQUIRED, `durable backup was not recovered`);
		}
		if (oldExists) {
			renameSync(paths.dest, paths.backup);
			syncDirectory(dirname(paths.dest));
			runtime.checkpoint?.('backup.durable', paths);
		}
		renameSync(paths.stage, paths.dest);
		installed = true;
		syncDirectory(dirname(paths.dest));
		runtime.checkpoint?.('destination.installed', paths);
		const accepted = verifiedManifest(paths.dest, manifest, options.inspect);
		runtime.checkpoint?.('postverify.passed', paths);
		if (existsSync(paths.backup)) {
			rmSync(paths.backup, { recursive: true });
			syncDirectory(dirname(paths.dest));
		}
		return { outcome: 'installed', manifest: accepted };
	} catch (error) {
		if (error instanceof AdoptError) throw error;
		try {
			rollback(paths, oldExists, oldFingerprint, installed, runtime);
		} catch (rollbackError) {
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
		if (existsSync(paths.stage)) rmSync(paths.stage, { recursive: true, force: true });
		releaseLock(paths.lock, token);
	}
}
