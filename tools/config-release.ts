#!/usr/bin/env bun

import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
	constants,
	copyFileSync,
	existsSync,
	lstatSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REPOSITORY_ID, pathInside, type TagIdentity } from './adopt/contract.js';
import { parseExactSemVer } from './release-core.js';
import {
	DEFAULT_MAIN_REF,
	canonicalRepositoryRoot,
	readManifestAt,
	resolveReleaseIdentity,
	runGit,
	type ReleaseIdentity,
} from './release/identity.js';

const CONFIG_RECEIPT_SCHEMA = 1 as const;
const CONFIG_PACKAGE_NAME = '@yesid/config' as const;
const CONFIG_MANIFEST_PATH = 'packages/config/package.json';
const CONFIG_RECEIPT_PATH = 'package/.yesid-config-release.json';
const MAX_CONFIG_ARCHIVE_BYTES = 8 * 1024 * 1024;
const SAFE_PACKAGE_FILE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/u;
const SECRET_FILE = /(?:^|\/)(?:\.env(?:\.|$)|[^/]*(?:credential|password|secret|token)[^/]*)/iu;

export interface ConfigReleaseOptions {
	repositoryRoot: string;
	tag: string;
	mainRef?: string;
}

export interface BuildConfigReleaseOptions extends ConfigReleaseOptions {
	output: string;
}

export interface VerifyConfigReleaseOptions extends ConfigReleaseOptions {
	archive: string;
}

export interface ConfigReleaseEvidence {
	schema: typeof CONFIG_RECEIPT_SCHEMA;
	repository: typeof REPOSITORY_ID;
	name: string;
	size: number;
	digest: string;
	checksum: string;
	package: { name: typeof CONFIG_PACKAGE_NAME; version: string };
	tag: TagIdentity;
}

interface ConfigManifest {
	name: typeof CONFIG_PACKAGE_NAME;
	version: string;
	files: string[];
}

export function parseConfigReleaseTag(tag: string): string {
	if (!tag.startsWith('config-v')) {
		throw new Error(`Invalid config release tag ${tag}; expected config-v<exact SemVer>`);
	}
	try {
		return parseExactSemVer(tag.slice('config-v'.length)).version;
	} catch {
		throw new Error(`Invalid config release tag ${tag}; expected config-v<exact SemVer>`);
	}
}

export function configReleaseAssetName(tag: string): string {
	parseConfigReleaseTag(tag);
	return `yesid-${tag}.tgz`;
}

export function configReleaseChecksumName(tag: string): string {
	return `${configReleaseAssetName(tag)}.sha256`;
}

function readConfigManifest(repositoryRoot: string, commit: string): ConfigManifest {
	const manifest = readManifestAt(repositoryRoot, commit, CONFIG_MANIFEST_PATH);
	if (manifest.name !== CONFIG_PACKAGE_NAME) {
		throw new Error(`${CONFIG_MANIFEST_PATH} must name ${CONFIG_PACKAGE_NAME}`);
	}
	if (typeof manifest.version !== 'string') {
		throw new Error(`${CONFIG_MANIFEST_PATH} must define an exact SemVer version`);
	}
	parseExactSemVer(manifest.version);
	if (manifest.private !== true) {
		throw new Error(`${CONFIG_MANIFEST_PATH} must remain private from registry publication`);
	}
	if (!Array.isArray(manifest.files) || !manifest.files.every((path) => typeof path === 'string')) {
		throw new Error(`${CONFIG_MANIFEST_PATH} must define an explicit files array`);
	}
	return {
		name: CONFIG_PACKAGE_NAME,
		version: manifest.version,
		files: manifest.files as string[],
	};
}

function assertConfigReleaseVersion(repositoryRoot: string, tag: string, commit: string): void {
	const manifest = readConfigManifest(repositoryRoot, commit);
	const expected = parseConfigReleaseTag(tag);
	if (manifest.version !== expected) {
		throw new Error(
			`tag ${tag} does not match ${CONFIG_PACKAGE_NAME} version ${manifest.version}`,
		);
	}
}

const CONFIG_IDENTITY_CONTRACT = {
	assertTag: parseConfigReleaseTag,
	assertVersions: assertConfigReleaseVersion,
} as const;

function packageFiles(repositoryRoot: string, commit: string): string[] {
	const manifest = readConfigManifest(repositoryRoot, commit);
	const files = ['package.json', ...manifest.files];
	if (new Set(files).size !== files.length) {
		throw new Error(`${CONFIG_MANIFEST_PATH} files must not contain duplicates`);
	}
	for (const path of files) {
		if (
			!SAFE_PACKAGE_FILE.test(path) ||
			path.includes('//') ||
			path.split('/').some((segment) => segment === '.' || segment === '..') ||
			SECRET_FILE.test(path) ||
			path === '.yesid-config-release.json'
		) {
			throw new Error(`${CONFIG_MANIFEST_PATH} contains unsafe release file ${path}`);
		}
		const entry = runGit(repositoryRoot, [
			'ls-tree',
			commit,
			'--',
			`packages/config/${path}`,
		]);
		const expectedSuffix = `\tpackages/config/${path}`;
		if (!entry.startsWith('100644 blob ') || !entry.endsWith(expectedSuffix) || entry.includes('\n')) {
			throw new Error(`config release file must be one tracked non-executable regular file: ${path}`);
		}
	}
	return files;
}

function configReceipt(identity: TagIdentity, version: string): string {
	return `${JSON.stringify({
		schema: CONFIG_RECEIPT_SCHEMA,
		repository: REPOSITORY_ID,
		package: { name: CONFIG_PACKAGE_NAME, version },
		tag: {
			name: identity.name,
			object: identity.object,
			peeledCommit: identity.peeledCommit,
		},
	})}\n`;
}

function taggedFile(repositoryRoot: string, commit: string, path: string): string {
	const result = spawnSync('git', ['show', `${commit}:packages/config/${path}`], {
		cwd: repositoryRoot,
		encoding: 'utf8',
	});
	if (result.status !== 0) {
		throw new Error(result.stderr.trim() || `could not read tagged config file ${path}`);
	}
	if (result.stdout.includes('\0')) {
		throw new Error(`config release file must be text without NUL bytes: ${path}`);
	}
	return result.stdout;
}

function generateConfigArchive(
	repositoryRoot: string,
	identity: ReleaseIdentity,
	destination: string,
): void {
	const manifest = readConfigManifest(repositoryRoot, identity.peeledCommit);
	const files = packageFiles(repositoryRoot, identity.peeledCommit);
	const virtualFiles = files.slice(1).map(
		(path) =>
			`--add-virtual-file=package/${path}:${taggedFile(
				repositoryRoot,
				identity.peeledCommit,
				path,
			)}`,
	);
	const archive = spawnSync(
		'git',
		[
			'-c',
			'tar.umask=0002',
			'archive',
			'--format=tar.gz',
			'--prefix=package/',
			`--mtime=@${identity.commitTime}`,
			...virtualFiles,
			`--add-virtual-file=${CONFIG_RECEIPT_PATH}:${configReceipt(identity, manifest.version)}`,
			`--output=${destination}`,
			`${identity.peeledCommit}:packages/config`,
			'--',
			'package.json',
		],
		{ cwd: repositoryRoot, encoding: 'utf8' },
	);
	if (archive.status !== 0) {
		throw new Error(archive.stderr.trim() || `git archive exited ${archive.status ?? 1}`);
	}
}

function tarOutput(archive: string, command: string, ...members: string[]): string {
	const result = spawnSync('tar', [command, archive, ...members], { encoding: 'utf8' });
	if (result.status !== 0) {
		throw new Error(result.stderr.trim() || `tar exited ${result.status ?? 1}`);
	}
	return result.stdout;
}

function sha256(archive: string): string {
	return createHash('sha256').update(readFileSync(archive)).digest('hex');
}

function verifyChecksum(archive: string, tag: string): string {
	const checksumPath = `${archive}.sha256`;
	if (!existsSync(checksumPath) || !lstatSync(checksumPath).isFile()) {
		throw new Error(`config release checksum does not exist: ${checksumPath}`);
	}
	const expected = `${sha256(archive)}  ${configReleaseAssetName(tag)}\n`;
	if (readFileSync(checksumPath, 'utf8') !== expected) {
		throw new Error('config release checksum does not match the artifact bytes');
	}
	return expected;
}

function verifyConfigBytes(
	archive: string,
	tag: string,
	identity: TagIdentity,
	files: readonly string[],
): ConfigReleaseEvidence {
	verifyChecksum(archive, tag);
	const entries = tarOutput(archive, '-tzf').trim().split('\n');
	const expectedEntries = [
		'package/',
		...files.map((path) => `package/${path}`),
		CONFIG_RECEIPT_PATH,
	];
	if (JSON.stringify(entries) !== JSON.stringify(expectedEntries)) {
		throw new Error('config release artifact contains files outside the package allowlist');
	}
	const manifest = JSON.parse(tarOutput(archive, '-xOzf', 'package/package.json')) as Record<
		string,
		unknown
	>;
	const version = parseConfigReleaseTag(tag);
	if (manifest.name !== CONFIG_PACKAGE_NAME || manifest.version !== version) {
		throw new Error('config release package identity does not match its tag');
	}
	const receipt = JSON.parse(tarOutput(archive, '-xOzf', CONFIG_RECEIPT_PATH)) as Record<
		string,
		unknown
	>;
	const expectedReceipt = JSON.parse(configReceipt(identity, version)) as Record<string, unknown>;
	if (JSON.stringify(receipt) !== JSON.stringify(expectedReceipt)) {
		throw new Error('config release receipt does not match the exact annotated tag');
	}
	const size = statSync(archive).size;
	if (size <= 0 || size > MAX_CONFIG_ARCHIVE_BYTES) {
		throw new Error('config release archive has an invalid size');
	}
	const digest = sha256(archive);
	return {
		schema: CONFIG_RECEIPT_SCHEMA,
		repository: REPOSITORY_ID,
		name: configReleaseAssetName(tag),
		size,
		digest: `sha256:${digest}`,
		checksum: configReleaseChecksumName(tag),
		package: { name: CONFIG_PACKAGE_NAME, version },
		tag: {
			name: identity.name,
			object: identity.object,
			peeledCommit: identity.peeledCommit,
		},
	};
}

function canonicalExternalArchive(repositoryRoot: string, input: string, tag: string): string {
	const absolute = resolve(input);
	if (basename(absolute) !== configReleaseAssetName(tag)) {
		throw new Error(`config release must use asset name ${configReleaseAssetName(tag)}`);
	}
	const canonical = join(realpathSync(dirname(absolute)), basename(absolute));
	if (pathInside(repositoryRoot, canonical)) {
		throw new Error('config release archive path must stay outside the repository');
	}
	return canonical;
}

export function buildConfigRelease(
	options: BuildConfigReleaseOptions,
): ConfigReleaseEvidence {
	const initialRoot = canonicalRepositoryRoot(options.repositoryRoot);
	const output = canonicalExternalArchive(initialRoot, options.output, options.tag);
	const checksum = `${output}.sha256`;
	if (existsSync(output) || existsSync(checksum)) {
		throw new Error('config release artifact or checksum already exists');
	}
	const { repositoryRoot, identity } = resolveReleaseIdentity(
		options,
		CONFIG_IDENTITY_CONTRACT,
	);
	const temporaryRoot = mkdtempSync(join(tmpdir(), 'yesid-config-release-build-'));
	const temporaryArchive = join(temporaryRoot, configReleaseAssetName(options.tag));
	try {
		generateConfigArchive(repositoryRoot, identity, temporaryArchive);
		const files = packageFiles(repositoryRoot, identity.peeledCommit);
		const digest = sha256(temporaryArchive);
		writeFileSync(
			`${temporaryArchive}.sha256`,
			`${digest}  ${configReleaseAssetName(options.tag)}\n`,
			{ flag: 'wx' },
		);
		const evidence = verifyConfigBytes(temporaryArchive, options.tag, identity, files);
		copyFileSync(temporaryArchive, output, constants.COPYFILE_EXCL);
		try {
			copyFileSync(`${temporaryArchive}.sha256`, checksum, constants.COPYFILE_EXCL);
		} catch (error) {
			rmSync(output, { force: true });
			throw error;
		}
		return evidence;
	} finally {
		rmSync(temporaryRoot, { recursive: true, force: true });
	}
}

export function verifyConfigRelease(
	options: VerifyConfigReleaseOptions,
): ConfigReleaseEvidence {
	const initialRoot = canonicalRepositoryRoot(options.repositoryRoot);
	const archive = canonicalExternalArchive(initialRoot, options.archive, options.tag);
	if (!existsSync(archive) || !lstatSync(archive).isFile()) {
		throw new Error(`config release archive does not exist: ${archive}`);
	}
	const { repositoryRoot, identity } = resolveReleaseIdentity(
		options,
		CONFIG_IDENTITY_CONTRACT,
	);
	const expectedRoot = mkdtempSync(join(tmpdir(), 'yesid-config-release-verify-'));
	const expected = join(expectedRoot, configReleaseAssetName(options.tag));
	try {
		generateConfigArchive(repositoryRoot, identity, expected);
		const files = packageFiles(repositoryRoot, identity.peeledCommit);
		writeFileSync(
			`${expected}.sha256`,
			`${sha256(expected)}  ${configReleaseAssetName(options.tag)}\n`,
		);
		const evidence = verifyConfigBytes(archive, options.tag, identity, files);
		verifyConfigBytes(expected, options.tag, identity, files);
		if (!readFileSync(archive).equals(readFileSync(expected))) {
			throw new Error('config release archive does not match the deterministic tagged package');
		}
		return evidence;
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
	const [command, ...raw] = argv;
	if (command !== 'build' && command !== 'verify') throw new Error('expected build or verify command');
	if (raw.length % 2 !== 0) throw new Error('config release options require values');
	const values = new Map<string, string>();
	for (let index = 0; index < raw.length; index += 2) {
		const key = raw[index] ?? '';
		const value = raw[index + 1] ?? '';
		if (!['--tag', '--output', '--archive', '--repository-root', '--main-ref'].includes(key)) {
			throw new Error(`unknown config release option ${key}`);
		}
		if (values.has(key)) throw new Error(`duplicate config release option ${key}`);
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
		path,
		repositoryRoot: values.get('--repository-root') ?? fileURLToPath(new URL('../', import.meta.url)),
		mainRef: values.get('--main-ref') ?? DEFAULT_MAIN_REF,
	};
}

export function main(argv = process.argv.slice(2)): number {
	try {
		const args = parseArguments(argv);
		const evidence =
			args.command === 'build'
				? buildConfigRelease({
						repositoryRoot: args.repositoryRoot,
						tag: args.tag,
						mainRef: args.mainRef,
						output: args.path,
					})
				: verifyConfigRelease({
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
