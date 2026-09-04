import { spawnSync } from 'node:child_process';
import { lstatSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

import { assertCommit, type TagIdentity } from '../adopt/contract.js';

export const DEFAULT_MAIN_REF = 'origin/main';

export interface ReleaseIdentity extends TagIdentity {
	commitTime: number;
}

export interface ReleaseIdentityOptions {
	repositoryRoot: string;
	tag: string;
	mainRef?: string;
}

export interface ReleaseIdentityContract {
	assertTag(tag: string): void;
	assertVersions(repositoryRoot: string, tag: string, commit: string): void;
}

export interface GitResult {
	status: number;
	stdout: string;
	stderr: string;
	error?: string;
	signal?: NodeJS.Signals;
}

export interface GitOptions {
	timeoutMs?: number;
	maxOutputBytes?: number;
	executable?: string;
}

const DEFAULT_GIT_TIMEOUT_MS = 10_000;
const DEFAULT_GIT_OUTPUT_BYTES = 64 * 1024;
const MAX_RELEASE_MANIFEST_BYTES = 64 * 1024;
const SAFE_GIT_CONFIG = [
	'--no-replace-objects',
	'-c',
	'core.fsmonitor=false',
	'-c',
	'core.hooksPath=',
	'-c',
	`core.attributesFile=${process.platform === 'win32' ? 'NUL' : '/dev/null'}`,
] as const;

export function git(
	repositoryRoot: string,
	args: readonly string[],
	options: GitOptions = {},
): GitResult {
	const result = spawnSync(options.executable ?? 'git', [...SAFE_GIT_CONFIG, ...args], {
		cwd: repositoryRoot,
		encoding: 'utf8',
		env: { ...process.env, GIT_ATTR_NOSYSTEM: '1' },
		timeout: options.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS,
		maxBuffer: options.maxOutputBytes ?? DEFAULT_GIT_OUTPUT_BYTES,
	});
	return {
		status: result.status ?? 1,
		stdout: (result.stdout ?? '').trim(),
		stderr: (result.stderr ?? '').trim(),
		...(result.error ? { error: result.error.message } : {}),
		...(result.signal ? { signal: result.signal } : {}),
	};
}

export function runGit(
	repositoryRoot: string,
	args: readonly string[],
	options: GitOptions = {},
): string {
	const result = git(repositoryRoot, args, options);
	if (result.error || result.signal || result.status !== 0) {
		throw new Error(
			result.error ||
				result.stderr ||
				result.stdout ||
				`git ${args[0] ?? ''} exited ${result.status}${result.signal ? ` via ${result.signal}` : ''}`,
		);
	}
	return result.stdout;
}

export function canonicalRepositoryRoot(input: string): string {
	const root = realpathSync(resolve(input));
	const topLevel = realpathSync(runGit(root, ['rev-parse', '--show-toplevel']));
	if (topLevel !== root) throw new Error(`repository root must be the Git top level: ${topLevel}`);
	assertNoLocalGitOverrides(root);
	return root;
}

function assertNoLocalGitOverrides(repositoryRoot: string): void {
	for (const relative of ['info/attributes', 'info/grafts']) {
		const configured = resolve(
			repositoryRoot,
			runGit(repositoryRoot, ['rev-parse', '--git-path', relative]),
		);
		try {
			const stats = lstatSync(configured);
			if (stats.isSymbolicLink() || !stats.isFile() || stats.size !== 0) {
				throw new Error(`release tooling refuses local Git override ${relative} at ${configured}`);
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
			throw error;
		}
	}
}

export function assertClean(repositoryRoot: string): void {
	const status = runGit(repositoryRoot, [
		'status',
		'--porcelain=v1',
		'--untracked-files=all',
	]);
	if (status !== '') throw new Error('release archive requires a clean worktree');
}

export function readManifestAt(
	repositoryRoot: string,
	commit: string,
	path: string,
): Record<string, unknown> {
	const sizeRaw = runGit(repositoryRoot, ['cat-file', '-s', `${commit}:${path}`], {
		maxOutputBytes: 128,
	});
	if (!/^\d+$/u.test(sizeRaw)) {
		throw new Error(`release manifest has an invalid size at ${path}`);
	}
	const size = Number(sizeRaw);
	if (!Number.isSafeInteger(size) || size < 0 || size > MAX_RELEASE_MANIFEST_BYTES) {
		throw new Error(`release manifest exceeds the 64 KiB size limit at ${path}`);
	}
	const raw = runGit(repositoryRoot, ['show', `${commit}:${path}`], {
		maxOutputBytes: MAX_RELEASE_MANIFEST_BYTES,
	});
	try {
		const value = JSON.parse(raw) as unknown;
		if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
		return value as Record<string, unknown>;
	} catch (error) {
		throw new Error(`release manifest is invalid at ${path}`, { cause: error });
	}
}

function tagHeaders(repositoryRoot: string, object: string): Map<string, string> {
	const headers = new Map<string, string>();
	for (const line of runGit(repositoryRoot, ['cat-file', '-p', object]).split('\n')) {
		if (line === '') break;
		const separator = line.indexOf(' ');
		if (separator > 0) headers.set(line.slice(0, separator), line.slice(separator + 1));
	}
	return headers;
}

export function resolveReleaseIdentity(
	options: ReleaseIdentityOptions,
	contract: ReleaseIdentityContract,
): { repositoryRoot: string; identity: ReleaseIdentity } {
	contract.assertTag(options.tag);
	const repositoryRoot = canonicalRepositoryRoot(options.repositoryRoot);
	assertClean(repositoryRoot);
	const tagRef = `refs/tags/${options.tag}`;
	const tagResult = git(repositoryRoot, [
		'rev-parse',
		'--verify',
		'--end-of-options',
		`${tagRef}^{tag}`,
	]);
	if (tagResult.status !== 0) throw new Error(`release requires an annotated tag ${options.tag}`);
	const object = tagResult.stdout;
	assertCommit(object);
	if (runGit(repositoryRoot, ['cat-file', '-t', object]) !== 'tag') {
		throw new Error(`release requires an annotated tag ${options.tag}`);
	}
	const headers = tagHeaders(repositoryRoot, object);
	const peeledCommit = headers.get('object') ?? '';
	assertCommit(peeledCommit);
	if (headers.get('type') !== 'commit' || headers.get('tag') !== options.tag) {
		throw new Error(`annotated tag ${options.tag} must point directly to its exact commit`);
	}
	const peeledByGit = runGit(repositoryRoot, [
		'rev-parse',
		'--verify',
		'--end-of-options',
		`${tagRef}^{commit}`,
	]);
	if (peeledByGit !== peeledCommit) {
		throw new Error(`annotated tag ${options.tag} has inconsistent peeled commit identity`);
	}
	const mainRef = options.mainRef ?? DEFAULT_MAIN_REF;
	const mainCommit = runGit(repositoryRoot, [
		'rev-parse',
		'--verify',
		'--end-of-options',
		`${mainRef}^{commit}`,
	]);
	assertCommit(mainCommit);
	const ancestry = git(repositoryRoot, ['merge-base', '--is-ancestor', peeledCommit, mainCommit]);
	if (ancestry.status === 1) throw new Error(`tag ${options.tag} is not an ancestor of ${mainRef}`);
	if (ancestry.status !== 0) {
		throw new Error(ancestry.stderr || `could not prove ${options.tag} ancestry against ${mainRef}`);
	}
	contract.assertVersions(repositoryRoot, options.tag, peeledCommit);
	const commitTime = Number(runGit(repositoryRoot, ['show', '-s', '--format=%ct', peeledCommit]));
	if (!Number.isSafeInteger(commitTime) || commitTime < 0) {
		throw new Error('release commit has an invalid timestamp');
	}
	return {
		repositoryRoot,
		identity: { name: options.tag, object, peeledCommit, commitTime },
	};
}
