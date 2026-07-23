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
	assertTag,
	pathInside,
	type TagIdentity,
} from './adopt/contract.js';
import {
	DEFAULT_MAIN_REF,
	canonicalRepositoryRoot,
	git,
	readManifestAt,
	resolveReleaseIdentity,
	runGit,
	type ReleaseIdentity,
} from './release/identity.js';

const RELEASE_RECEIPT_SCHEMA = 1 as const;
const RELEASED_PACKAGES = ['tokens', 'motion', 'gates', 'seo-kit', 'ui', 'analytics'] as const;
const RELEASE_PATHS = [
	'LICENSE',
	'tools/adopt.ts',
	'tools/adopt',
	...RELEASED_PACKAGES.map((name) => `packages/${name}`),
] as const;
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;

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

const RELEASE_IDENTITY_CONTRACT = { assertTag, assertVersions: assertReleaseVersions } as const;

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
	const releasePaths = [...RELEASE_PATHS];
	if (git(repositoryRoot, ['cat-file', '-e', `${identity.peeledCommit}:NOTICE`]).status === 0) {
		releasePaths.splice(1, 0, 'NOTICE');
	}
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
			'--',
			...releasePaths,
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
	const { repositoryRoot, identity } = resolveReleaseIdentity(
		options,
		RELEASE_IDENTITY_CONTRACT,
	);
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
	const { repositoryRoot, identity } = resolveReleaseIdentity(
		options,
		RELEASE_IDENTITY_CONTRACT,
	);
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
