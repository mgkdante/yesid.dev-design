import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
	constants,
	copyFileSync,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { acquireArchive } from './adopt/acquisition.js';
import {
	REPOSITORY_ID,
	assertCommit,
	assertTag,
	pathInside,
	type TagIdentity,
} from './adopt/contract.js';

const RELEASE_RECEIPT_SCHEMA = 1 as const;
const DEFAULT_MAIN_REF = 'origin/main';
const RELEASED_PACKAGES = ['tokens', 'motion', 'gates', 'ui'] as const;
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;

interface ReleaseIdentity extends TagIdentity {
	commitTime: number;
}

export interface ReleaseArchiveOptions {
	repositoryRoot: string;
	tag: string;
	mainRef?: string;
}

export interface BuildReleaseArchiveOptions extends ReleaseArchiveOptions {
	output: string;
}

export interface VerifyReleaseArchiveOptions extends ReleaseArchiveOptions {
	archive: string;
}

export interface ReleaseArchiveEvidence {
	schema: typeof RELEASE_RECEIPT_SCHEMA;
	repository: typeof REPOSITORY_ID;
	name: string;
	size: number;
	digest: string;
	tag: TagIdentity;
}

interface GitResult {
	status: number;
	stdout: string;
	stderr: string;
}

function git(repositoryRoot: string, args: readonly string[]): GitResult {
	const result = spawnSync('git', [...args], {
		cwd: repositoryRoot,
		encoding: 'utf8',
	});
	return {
		status: result.status ?? 1,
		stdout: result.stdout.trim(),
		stderr: result.stderr.trim(),
	};
}

function runGit(repositoryRoot: string, args: readonly string[]): string {
	const result = git(repositoryRoot, args);
	if (result.status !== 0) {
		throw new Error(result.stderr || result.stdout || `git ${args[0] ?? ''} exited ${result.status}`);
	}
	return result.stdout;
}

function canonicalRepositoryRoot(input: string): string {
	const root = realpathSync(resolve(input));
	const topLevel = realpathSync(runGit(root, ['rev-parse', '--show-toplevel']));
	if (topLevel !== root) throw new Error(`repository root must be the Git top level: ${topLevel}`);
	return root;
}

function assertClean(repositoryRoot: string): void {
	const status = runGit(repositoryRoot, [
		'status',
		'--porcelain=v1',
		'--untracked-files=all',
	]);
	if (status !== '') throw new Error(`release archive requires a clean worktree`);
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

function readManifestAt(
	repositoryRoot: string,
	commit: string,
	path: string,
): Record<string, unknown> {
	const raw = runGit(repositoryRoot, ['show', `${commit}:${path}`]);
	try {
		const value = JSON.parse(raw) as unknown;
		if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
		return value as Record<string, unknown>;
	} catch (error) {
		throw new Error(`release manifest is invalid at ${path}`, { cause: error });
	}
}

function assertReleaseVersions(repositoryRoot: string, tag: string, commit: string): void {
	const expectedVersion = tag.slice(1);
	const manifests = [
		{ path: 'package.json', name: 'yesid-dev-design' },
		...RELEASED_PACKAGES.map((name) => ({
			path: `packages/${name}/package.json`,
			name: `@yesid/${name}`,
		})),
	];
	for (const expected of manifests) {
		const manifest = readManifestAt(repositoryRoot, commit, expected.path);
		if (manifest.name !== expected.name) {
			throw new Error(`release manifest ${expected.path} has unexpected package identity`);
		}
		if (manifest.version !== expectedVersion) {
			throw new Error(
				`tag ${tag} does not match ${expected.name} version ${String(manifest.version)}`,
			);
		}
	}
}

function resolveReleaseIdentity(options: ReleaseArchiveOptions): {
	repositoryRoot: string;
	identity: ReleaseIdentity;
} {
	assertTag(options.tag);
	const repositoryRoot = canonicalRepositoryRoot(options.repositoryRoot);
	assertClean(repositoryRoot);
	const tagRef = `refs/tags/${options.tag}`;
	const tagResult = git(repositoryRoot, [
		'rev-parse',
		'--verify',
		'--end-of-options',
		`${tagRef}^{tag}`,
	]);
	if (tagResult.status !== 0) {
		throw new Error(`release requires an annotated tag ${options.tag}`);
	}
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
	if (ancestry.status === 1) {
		throw new Error(`tag ${options.tag} is not an ancestor of ${mainRef}`);
	}
	if (ancestry.status !== 0) {
		throw new Error(ancestry.stderr || `could not prove ${options.tag} ancestry against ${mainRef}`);
	}
	assertReleaseVersions(repositoryRoot, options.tag, peeledCommit);
	const commitTime = Number(runGit(repositoryRoot, ['show', '-s', '--format=%ct', peeledCommit]));
	if (!Number.isSafeInteger(commitTime) || commitTime < 0) {
		throw new Error(`release commit has an invalid timestamp`);
	}
	return {
		repositoryRoot,
		identity: { name: options.tag, object, peeledCommit, commitTime },
	};
}

export function releaseAssetName(tag: string): string {
	assertTag(tag);
	return `yesid.dev-design-${tag}.tar`;
}

function canonicalExternalPath(repositoryRoot: string, input: string, tag: string): string {
	const absolute = resolve(input);
	if (basename(absolute) !== releaseAssetName(tag)) {
		throw new Error(`release archive must use the canonical asset name ${releaseAssetName(tag)}`);
	}
	const parent = realpathSync(dirname(absolute));
	const path = join(parent, basename(absolute));
	if (pathInside(repositoryRoot, path)) {
		throw new Error(`release archive path must stay outside the repository`);
	}
	return path;
}

function receipt(identity: TagIdentity): string {
	return `${JSON.stringify({
		schema: RELEASE_RECEIPT_SCHEMA,
		repository: REPOSITORY_ID,
		tag: {
			name: identity.name,
			object: identity.object,
			peeledCommit: identity.peeledCommit,
		},
	})}\n`;
}

function verifyBytes(
	tag: string,
	archive: string,
	identity: TagIdentity,
): ReleaseArchiveEvidence {
	const acquired = acquireArchive(archive, tag);
	try {
		if (
			acquired.provenance.tag.name !== identity.name ||
			acquired.provenance.tag.object !== identity.object ||
			acquired.provenance.tag.peeledCommit !== identity.peeledCommit
		) {
			throw new Error(`release archive receipt does not match the exact annotated tag`);
		}
	} finally {
		acquired.cleanup();
	}
	const size = statSync(archive).size;
	if (size <= 0 || size > MAX_ARCHIVE_BYTES) {
		throw new Error(`release archive has an invalid size`);
	}
	return {
		schema: RELEASE_RECEIPT_SCHEMA,
		repository: REPOSITORY_ID,
		name: releaseAssetName(tag),
		size,
		digest: `sha256:${createHash('sha256').update(readFileSync(archive)).digest('hex')}`,
		tag: {
			name: identity.name,
			object: identity.object,
			peeledCommit: identity.peeledCommit,
		},
	};
}

function generateDeterministicArchive(
	repositoryRoot: string,
	tag: string,
	identity: ReleaseIdentity,
	destination: string,
): void {
	const existingReceipt = runGit(repositoryRoot, [
		'ls-tree',
		'--name-only',
		identity.peeledCommit,
		'--',
		'.yesid-release.json',
	]);
	if (existingReceipt !== '') {
		throw new Error(`.yesid-release.json is reserved for the release archive builder`);
	}
	const rootName = `yesid.dev-design-${tag}`;
	const archive = spawnSync(
		'git',
		[
			'-c',
			'tar.umask=0002',
			'archive',
			'--format=tar',
			`--prefix=${rootName}/`,
			`--mtime=@${identity.commitTime}`,
			`--add-virtual-file=${rootName}/.yesid-release.json:${receipt(identity)}`,
			`--output=${destination}`,
			`${identity.peeledCommit}^{tree}`,
		],
		{ cwd: repositoryRoot, encoding: 'utf8' },
	);
	if (archive.status !== 0) {
		throw new Error(archive.stderr.trim() || `git archive exited ${archive.status ?? 1}`);
	}
}

export function buildReleaseArchive(options: BuildReleaseArchiveOptions): ReleaseArchiveEvidence {
	const initialRoot = canonicalRepositoryRoot(options.repositoryRoot);
	const output = canonicalExternalPath(initialRoot, options.output, options.tag);
	if (existsSync(output)) throw new Error(`release archive output already exists: ${output}`);
	const { repositoryRoot, identity } = resolveReleaseIdentity(options);
	mkdirSync(dirname(output), { recursive: true });
	const temporary = join(dirname(output), `.${basename(output)}.${process.pid}.${randomUUID()}.tmp`);
	try {
		generateDeterministicArchive(repositoryRoot, options.tag, identity, temporary);
		const evidence = verifyBytes(options.tag, temporary, identity);
		try {
			copyFileSync(temporary, output, constants.COPYFILE_EXCL);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
				throw new Error(`release archive output already exists: ${output}`, { cause: error });
			}
			throw error;
		}
		return evidence;
	} finally {
		rmSync(temporary, { force: true });
	}
}

export function verifyReleaseArchive(options: VerifyReleaseArchiveOptions): ReleaseArchiveEvidence {
	const initialRoot = canonicalRepositoryRoot(options.repositoryRoot);
	const archive = canonicalExternalPath(initialRoot, options.archive, options.tag);
	if (!existsSync(archive) || !lstatSync(archive).isFile()) {
		throw new Error(`release archive does not exist: ${archive}`);
	}
	const { repositoryRoot, identity } = resolveReleaseIdentity(options);
	const expectedRoot = mkdtempSync(join(tmpdir(), 'yesid-release-verify-'));
	const expectedArchive = join(expectedRoot, releaseAssetName(options.tag));
	try {
		generateDeterministicArchive(repositoryRoot, options.tag, identity, expectedArchive);
		const actualEvidence = verifyBytes(options.tag, archive, identity);
		verifyBytes(options.tag, expectedArchive, identity);
		const actualBytes = readFileSync(archive);
		const expectedBytes = readFileSync(expectedArchive);
		if (!actualBytes.equals(expectedBytes)) {
			throw new Error(`release archive does not match the deterministic tagged tree`);
		}
		return actualEvidence;
	} finally {
		rmSync(expectedRoot, { recursive: true, force: true });
	}
}

interface CliArguments {
	command: 'build' | 'verify';
	tag: string;
	repositoryRoot: string;
	mainRef: string;
	path: string;
}

function parseArguments(argv: readonly string[]): CliArguments {
	const [command, ...rawOptions] = argv;
	if (command !== 'build' && command !== 'verify') throw new Error(`expected build or verify command`);
	if (rawOptions.length % 2 !== 0) throw new Error(`release archive options require values`);
	const values = new Map<string, string>();
	for (let index = 0; index < rawOptions.length; index += 2) {
		const key = rawOptions[index] ?? '';
		const value = rawOptions[index + 1] ?? '';
		if (!['--tag', '--output', '--archive', '--repository-root', '--main-ref'].includes(key)) {
			throw new Error(`unknown release archive option ${key}`);
		}
		if (values.has(key)) throw new Error(`duplicate release archive option ${key}`);
		values.set(key, value);
	}
	const tag = values.get('--tag');
	const path = values.get(command === 'build' ? '--output' : '--archive');
	if (!tag || !path) {
		throw new Error(`${command} requires --tag and ${command === 'build' ? '--output' : '--archive'}`);
	}
	const incompatible = command === 'build' ? '--archive' : '--output';
	if (values.has(incompatible)) throw new Error(`${incompatible} is not valid for ${command}`);
	return {
		command,
		tag,
		repositoryRoot: values.get('--repository-root') ?? fileURLToPath(new URL('../', import.meta.url)),
		mainRef: values.get('--main-ref') ?? DEFAULT_MAIN_REF,
		path,
	};
}

export function main(argv = process.argv.slice(2)): number {
	try {
		const args = parseArguments(argv);
		const evidence =
			args.command === 'build'
				? buildReleaseArchive({
						repositoryRoot: args.repositoryRoot,
						tag: args.tag,
						mainRef: args.mainRef,
						output: args.path,
					})
				: verifyReleaseArchive({
						repositoryRoot: args.repositoryRoot,
						tag: args.tag,
						mainRef: args.mainRef,
						archive: args.path,
					});
		console.log(JSON.stringify(evidence));
		return 0;
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		return 1;
	}
}

const entrypoint = process.argv[1] ? resolve(process.argv[1]) : '';
if (entrypoint === fileURLToPath(import.meta.url)) process.exitCode = main();
