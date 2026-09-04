#!/usr/bin/env bun

import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
	constants,
	copyFileSync,
	existsSync,
	lstatSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REPOSITORY_ID, pathInside, type TagIdentity } from './adopt/contract.js';
import { guardExistingFile, readStableFile } from './adopt/path-safety.js';
import {
	CONFIG_ARCHIVE_LIMITS,
	parseConfigArchive,
} from './config-archive.js';
import { compareVersions, parseExactSemVer } from './release-core.js';
import {
	DEFAULT_MAIN_REF,
	canonicalRepositoryRoot,
	resolveReleaseIdentity,
	runGit,
	type ReleaseIdentity,
} from './release/identity.js';

const CONFIG_RECEIPT_SCHEMA = 1 as const;
const CONFIG_PACKAGE_NAME = '@yesid/config' as const;
const CONFIG_MANIFEST_PATH = 'packages/config/package.json';
const CONFIG_RECEIPT_PATH = 'package/.yesid-config-release.json';
const MAX_CONFIG_MANIFEST_BYTES = 64 * 1024;
const MAX_CHECKSUM_BYTES = 256;
const GIT_READ_TIMEOUT_MS = 10_000;
const GIT_ARCHIVE_TIMEOUT_MS = 30_000;
const MAX_COMMAND_OUTPUT_BYTES = 64 * 1024;
const EMPTY_GIT_CONFIG = process.platform === 'win32' ? 'NUL' : '/dev/null';
const CONFIG_DIRECTORY_LAYOUT_CUTOVER = '0.2.2';
const MAX_LEGACY_VIRTUAL_ARGUMENT_BYTES = 24 * 1024;
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

type ConfigArchiveLayout = 'legacy-files' | 'explicit-directories';

interface ConfigArchivePlan {
	manifest: ConfigManifest;
	files: string[];
	receipt: string;
	layout: ConfigArchiveLayout;
	entries: string[];
}

function taggedBlobSize(repositoryRoot: string, commit: string, path: string): number {
	const raw = runGit(repositoryRoot, ['cat-file', '-s', `${commit}:${path}`]);
	if (!/^\d+$/u.test(raw)) throw new Error(`tagged config file has an invalid size: ${path}`);
	const size = Number(raw);
	if (!Number.isSafeInteger(size) || size < 0) {
		throw new Error(`tagged config file has an invalid size: ${path}`);
	}
	return size;
}

function taggedFileBytes(
	repositoryRoot: string,
	commit: string,
	path: string,
	maxBytes = CONFIG_ARCHIVE_LIMITS.memberBytes,
): Buffer {
	const expectedSize = taggedBlobSize(repositoryRoot, commit, path);
	if (expectedSize > maxBytes) {
		throw new Error(`tagged config file exceeds its size limit: ${path}`);
	}
	const result = spawnSync(
		'git',
		[
			'--no-replace-objects',
			'-c',
			'core.fsmonitor=false',
			'-c',
			'core.hooksPath=',
			'-c',
			`core.attributesFile=${EMPTY_GIT_CONFIG}`,
			'show',
			`${commit}:${path}`,
		],
		{
			cwd: repositoryRoot,
			env: {
				...process.env,
				GIT_ATTR_NOSYSTEM: '1',
			},
			maxBuffer: maxBytes + 1,
			timeout: GIT_READ_TIMEOUT_MS,
		},
	);
	if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
		const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8').trim() : '';
		const detail = result.error?.message || stderr || `git show exited ${result.status ?? 1}`;
		throw new Error(`could not read tagged config file ${path}: ${detail}`);
	}
	if (result.stdout.length !== expectedSize) {
		throw new Error(`tagged config file changed while reading: ${path}`);
	}
	if (result.stdout.includes(0)) {
		throw new Error(`config release file must be text without NUL bytes: ${path}`);
	}
	return result.stdout;
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

function configArchiveLayout(tag: string): ConfigArchiveLayout {
	const version = parseExactSemVer(parseConfigReleaseTag(tag));
	return compareVersions(version, parseExactSemVer(CONFIG_DIRECTORY_LAYOUT_CUTOVER)) >= 0
		? 'explicit-directories'
		: 'legacy-files';
}

function readConfigManifest(repositoryRoot: string, commit: string): ConfigManifest {
	let manifest: Record<string, unknown>;
	try {
		const raw = taggedFileBytes(
			repositoryRoot,
			commit,
			CONFIG_MANIFEST_PATH,
			MAX_CONFIG_MANIFEST_BYTES,
		);
		const value = JSON.parse(raw.toString('utf8')) as unknown;
		if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
		manifest = value as Record<string, unknown>;
	} catch (error) {
		const detail = error instanceof Error ? `: ${error.message}` : '';
		throw new Error(`release manifest is invalid at ${CONFIG_MANIFEST_PATH}${detail}`, { cause: error });
	}
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

function plannedEntries(files: readonly string[], layout: ConfigArchiveLayout): string[] {
	if (layout === 'legacy-files') {
		return [
			'package/',
			'package/package.json',
			...files.slice(1).map((path) => `package/${path}`),
			CONFIG_RECEIPT_PATH,
		];
	}
	const payloadEntries = new Set<string>();
	for (const file of files) {
		const parts = file.split('/');
		for (let depth = 1; depth < parts.length; depth += 1) {
			payloadEntries.add(`package/${parts.slice(0, depth).join('/')}/`);
		}
		payloadEntries.add(`package/${file}`);
	}
	return ['package/', ...[...payloadEntries].sort(), CONFIG_RECEIPT_PATH];
}

function configArchivePlan(
	repositoryRoot: string,
	identity: ReleaseIdentity,
): ConfigArchivePlan {
	const manifest = readConfigManifest(repositoryRoot, identity.peeledCommit);
	const files = ['package.json', ...manifest.files];
	if (new Set(files).size !== files.length) {
		throw new Error(`${CONFIG_MANIFEST_PATH} files must not contain duplicates`);
	}
	const receipt = configReceipt(identity, manifest.version);
	const layout = configArchiveLayout(identity.name);
	const entries = plannedEntries(files, layout);
	if (entries.length > CONFIG_ARCHIVE_LIMITS.entries) {
		throw new Error(`config release archive entry limit is ${CONFIG_ARCHIVE_LIMITS.entries}`);
	}
	let payloadBytes = Buffer.byteLength(receipt);
	let legacyArgumentBytes = 0;
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
			identity.peeledCommit,
			'--',
			`packages/config/${path}`,
		]);
		const expectedSuffix = `\tpackages/config/${path}`;
		if (!entry.startsWith('100644 blob ') || !entry.endsWith(expectedSuffix) || entry.includes('\n')) {
			throw new Error(`config release file must be one tracked non-executable regular file: ${path}`);
		}
		const size = taggedBlobSize(repositoryRoot, identity.peeledCommit, `packages/config/${path}`);
		if (size > CONFIG_ARCHIVE_LIMITS.memberBytes) {
			throw new Error(`config release file exceeds the 256 KiB member size limit: ${path}`);
		}
		payloadBytes += size;
		if (payloadBytes > CONFIG_ARCHIVE_LIMITS.payloadBytes) {
			throw new Error('config release files exceed the 1 MiB payload size limit');
		}
		if (layout === 'legacy-files' && path !== 'package.json') {
			legacyArgumentBytes += Buffer.byteLength(`--add-virtual-file=package/${path}:`) + size;
		}
	}
	if (layout === 'legacy-files' && legacyArgumentBytes > MAX_LEGACY_VIRTUAL_ARGUMENT_BYTES) {
		throw new Error('legacy config release virtual-file argument limit is 24 KiB');
	}
	return { manifest, files, receipt, layout, entries };
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

function generateConfigArchive(
	repositoryRoot: string,
	identity: ReleaseIdentity,
	destination: string,
): ConfigArchivePlan {
	const plan = configArchivePlan(repositoryRoot, identity);
	const contentArguments =
		plan.layout === 'legacy-files'
			? plan.files.slice(1).map((path) => {
					const content = taggedFileBytes(
						repositoryRoot,
						identity.peeledCommit,
						`packages/config/${path}`,
					).toString('utf8');
					return `--add-virtual-file=package/${path}:${content}`;
				})
			: [];
	const selectedFiles = plan.layout === 'legacy-files' ? ['package.json'] : plan.files;
	const archive = spawnSync(
		'git',
		[
			'--no-replace-objects',
			'-c',
			'core.fsmonitor=false',
			'-c',
			'core.hooksPath=',
			'-c',
			`core.attributesFile=${EMPTY_GIT_CONFIG}`,
			'-c',
			'tar.umask=0002',
			'-c',
			'tar.tar.gz.command=gzip -cn',
			'archive',
			'--format=tar.gz',
			'--prefix=package/',
			`--mtime=@${identity.commitTime}`,
			...contentArguments,
			`--add-virtual-file=${CONFIG_RECEIPT_PATH}:${plan.receipt}`,
			`--output=${destination}`,
			`${identity.peeledCommit}:packages/config`,
			'--',
			...selectedFiles,
		],
		{
			cwd: repositoryRoot,
			encoding: 'utf8',
			env: {
				...process.env,
				GIT_ATTR_NOSYSTEM: '1',
			},
			maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
			timeout: GIT_ARCHIVE_TIMEOUT_MS,
		},
	);
	if (archive.error || archive.status !== 0 || archive.signal) {
		const detail = archive.error?.message || archive.stderr.trim() ||
			`git archive exited ${archive.status ?? 1}${archive.signal ? ` via ${archive.signal}` : ''}`;
		throw new Error(detail);
	}
	return plan;
}

function readConfigArchive(path: string): Buffer {
	return readStableFile(
		guardExistingFile(path, 'config release archive'),
		CONFIG_ARCHIVE_LIMITS.compressedBytes,
		'config release archive compressed size limit is 8 MiB',
	);
}

function sha256(bytes: Buffer): string {
	return createHash('sha256').update(bytes).digest('hex');
}

function verifyChecksum(archive: string, tag: string, archiveBytes: Buffer): string {
	const checksumPath = `${archive}.sha256`;
	if (!existsSync(checksumPath) || !lstatSync(checksumPath).isFile()) {
		throw new Error(`config release checksum does not exist: ${checksumPath}`);
	}
	const expected = `${sha256(archiveBytes)}  ${configReleaseAssetName(tag)}\n`;
	const checksumBytes = readStableFile(
		guardExistingFile(checksumPath, 'config release checksum'),
		MAX_CHECKSUM_BYTES,
		'config release checksum size limit is 256 bytes',
	);
	if (!checksumBytes.equals(Buffer.from(expected))) {
		throw new Error('config release checksum does not match the artifact bytes');
	}
	return expected;
}

function verifyConfigBytes(
	archiveBytes: Buffer,
	tag: string,
	identity: TagIdentity,
	plan: ConfigArchivePlan,
	taggedManifest: Buffer,
): ConfigReleaseEvidence {
	const parsed = parseConfigArchive(archiveBytes);
	const entries = parsed.map((entry) => entry.path);
	if (JSON.stringify(entries) !== JSON.stringify(plan.entries)) {
		throw new Error('config release artifact contains files outside the package allowlist');
	}
	const version = parseConfigReleaseTag(tag);
	const manifest = parsed.find((entry) => entry.path === 'package/package.json');
	if (!manifest || manifest.type !== 'file' || !manifest.content.equals(taggedManifest)) {
		throw new Error('config release package bytes do not match the exact tagged manifest');
	}
	const receipt = parsed.find((entry) => entry.path === CONFIG_RECEIPT_PATH);
	if (
		!receipt ||
		receipt.type !== 'file' ||
		!receipt.content.equals(Buffer.from(plan.receipt))
	) {
		throw new Error('config release receipt does not match the exact annotated tag');
	}
	return {
		schema: CONFIG_RECEIPT_SCHEMA,
		repository: REPOSITORY_ID,
		name: configReleaseAssetName(tag),
		size: archiveBytes.length,
		digest: `sha256:${sha256(archiveBytes)}`,
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
	const temporaryRoot = realpathSync.native(
		mkdtempSync(join(tmpdir(), 'yesid-config-release-build-')),
	);
	const temporaryArchive = join(temporaryRoot, configReleaseAssetName(options.tag));
	try {
		const plan = generateConfigArchive(repositoryRoot, identity, temporaryArchive);
		const archiveBytes = readConfigArchive(temporaryArchive);
		const digest = sha256(archiveBytes);
		writeFileSync(
			`${temporaryArchive}.sha256`,
			`${digest}  ${configReleaseAssetName(options.tag)}\n`,
			{ flag: 'wx' },
		);
		verifyChecksum(temporaryArchive, options.tag, archiveBytes);
		const taggedManifest = taggedFileBytes(
			repositoryRoot,
			identity.peeledCommit,
			CONFIG_MANIFEST_PATH,
			MAX_CONFIG_MANIFEST_BYTES,
		);
		const evidence = verifyConfigBytes(
			archiveBytes,
			options.tag,
			identity,
			plan,
			taggedManifest,
		);
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
	const archiveBytes = readConfigArchive(archive);
	verifyChecksum(archive, options.tag, archiveBytes);
	const { repositoryRoot, identity } = resolveReleaseIdentity(
		options,
		CONFIG_IDENTITY_CONTRACT,
	);
	const expectedRoot = realpathSync.native(
		mkdtempSync(join(tmpdir(), 'yesid-config-release-verify-')),
	);
	const expected = join(expectedRoot, configReleaseAssetName(options.tag));
	try {
		const plan = generateConfigArchive(repositoryRoot, identity, expected);
		const expectedBytes = readConfigArchive(expected);
		if (!archiveBytes.equals(expectedBytes)) {
			throw new Error('config release archive does not match the deterministic tagged package');
		}
		const taggedManifest = taggedFileBytes(
			repositoryRoot,
			identity.peeledCommit,
			CONFIG_MANIFEST_PATH,
			MAX_CONFIG_MANIFEST_BYTES,
		);
		return verifyConfigBytes(
			archiveBytes,
			options.tag,
			identity,
			plan,
			taggedManifest,
		);
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
