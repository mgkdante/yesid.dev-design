#!/usr/bin/env bun

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

declare const Bun: {
	JSONC: { parse(source: string): unknown };
	YAML: { parse(source: string): unknown };
};

const MAX_LOCK_BYTES = 16 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_MANIFESTS = 128;
const MAX_TREE_BYTES = 8 * 1024 * 1024;
const MAX_LOCK_VALUES = 250_000;
export const BROWSER_AUTHORITY_ARCHIVE_LIMITS = {
	blobBytes: 16 * 1024 * 1024,
	entries: 10_000,
	totalBlobBytes: 128 * 1024 * 1024,
} as const;
const WORKSPACES = ['apps/*', 'packages/*'];
const DEPENDENCY_FIELDS = [
	'dependencies',
	'devDependencies',
	'optionalDependencies',
	'peerDependencies',
] as const;
const RESOLUTION_FIELDS = ['overrides', 'resolutions'] as const;
const AUTHORITY_TOOL_PACKAGES = ['@playwright/test', '@sveltejs/kit', 'vite'] as const;
const registrySelector = /^[0-9A-Za-z*^~<>=|&!+._\-\s]+$/u;
const remoteSource =
	/(?:^|@)(?:(?:https?|git(?:\+[a-z0-9]+)?|ssh|github|gitlab|bitbucket|file|link):|\/\/)/iu;
const scpSource = /(?:^|@)git@[^:\s]+:/iu;
const diagnosticControls =
	/(?:[\u0000-\u001f\u007f-\u009f\u2028\u2029]|\p{Bidi_Control})/gu;

type JsonRecord = Record<string, unknown>;

function diagnosticText(value: string): string {
	return value.replace(diagnosticControls, (character) => {
		const codePoint = character.codePointAt(0)!;
		return `\\u${codePoint.toString(16).padStart(4, '0')}`;
	});
}

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function containsRepositoryShorthand(value: string): boolean {
	const separator = value.lastIndexOf('@');
	const candidate =
		separator > 0 ? value.slice(separator + 1) : value.startsWith('@') ? '' : value;
	return /^[A-Za-z0-9_][A-Za-z0-9_.-]*\/[A-Za-z0-9_.-]+(?:#.*)?$/u.test(candidate);
}

function gitBuffer(
	root: string,
	args: string[],
	maxBuffer: number,
	input?: Buffer,
): Buffer {
	return execFileSync(
		'git',
		[
			'--no-replace-objects',
			'-c',
			'core.fsmonitor=false',
			'-c',
			'core.hooksPath=',
			'-c',
			'core.attributesFile=/dev/null',
			'-C',
			root,
			...args,
		],
		{
			env: { ...process.env, GIT_ATTR_NOSYSTEM: '1' },
			input,
			maxBuffer,
		},
	);
}

function gitText(root: string, args: string[], maxBuffer: number): string {
	return gitBuffer(root, args, maxBuffer).toString('utf8');
}

export function inspectArchiveTree(source: string | Buffer): {
	blobBytes: number;
	entries: number;
	paths: string[];
} {
	const records = source.toString().split('\0');
	if (records.at(-1) === '') records.pop();
	const paths: string[] = [];
	let blobBytes = 0;
	for (const record of records) {
		const separator = record.indexOf('\t');
		const metadata = separator === -1 ? [] : record.slice(0, separator).trim().split(/\s+/u);
		const path = separator === -1 ? '' : record.slice(separator + 1);
		if (metadata.length !== 4 || !path) throw new Error('git ls-tree returned malformed output');
		const [mode, type, object, rawSize] = metadata;
		if (!/^[0-9a-f]{40}$/u.test(object!)) throw new Error('git ls-tree returned an invalid object id');
		if (mode === '040000' && type === 'tree' && rawSize === '-') {
			paths.push(path);
		} else if (
			(mode === '100644' || mode === '100755') &&
			type === 'blob' &&
			/^(?:0|[1-9][0-9]*)$/u.test(rawSize!)
		) {
			const size = Number(rawSize);
			if (!Number.isSafeInteger(size)) throw new Error('archive blob size is not a safe integer');
			if (size > BROWSER_AUTHORITY_ARCHIVE_LIMITS.blobBytes) {
				throw new Error(`${diagnosticText(path)} exceeds the archive per-file byte limit`);
			}
			blobBytes += size;
			if (blobBytes > BROWSER_AUTHORITY_ARCHIVE_LIMITS.totalBlobBytes) {
				throw new Error('candidate exceeds the archive aggregate byte limit');
			}
			paths.push(path);
		} else {
			throw new Error(`${diagnosticText(path)} has an unsupported archive entry mode`);
		}
		if (paths.length > BROWSER_AUTHORITY_ARCHIVE_LIMITS.entries) {
			throw new Error('candidate exceeds the archive entry limit');
		}
	}
	return { blobBytes, entries: paths.length, paths };
}

function assertRegularBlob(root: string, commit: string, path: string): void {
	const entry = gitText(root, ['ls-tree', '-z', commit, '--', path], 4096);
	const separator = entry.indexOf('\t');
	const metadata = separator === -1 ? '' : entry.slice(0, separator);
	const entryPath = separator === -1 ? '' : entry.slice(separator + 1).replace(/\0$/u, '');
	if (!/^100(?:644|755) blob [0-9a-f]{40}$/u.test(metadata) || entryPath !== path) {
		throw new Error(`${diagnosticText(path)} must be a regular tracked file`);
	}
}

function assertArchiveAttributes(root: string, commit: string, paths: string[]): void {
	const input = Buffer.from(`${['.', ...paths].join('\0')}\0`);
	const output = gitBuffer(
		root,
		['check-attr', '-z', '--source', commit, '--stdin', 'export-ignore', 'export-subst'],
		32 * 1024 * 1024,
		input,
	)
		.toString('utf8')
		.split('\0');
	if (output.at(-1) === '') output.pop();
	if (output.length % 3 !== 0) throw new Error('git check-attr returned malformed output');
	for (let index = 0; index < output.length; index += 3) {
		const path = output[index]!;
		const attribute = output[index + 1]!;
		const value = output[index + 2]!;
		if (value !== 'unspecified' && value !== 'unset') {
			throw new Error(
				`${diagnosticText(path)} enables ${diagnosticText(attribute)} archive rewriting`,
			);
		}
	}
}

function readBlobBuffer(root: string, commit: string, path: string, maximum: number): Buffer {
	assertRegularBlob(root, commit, path);
	const object = `${commit}:${path}`;
	const rawSize = gitText(root, ['cat-file', '-s', object], 1024).trim();
	if (!/^(?:0|[1-9][0-9]*)$/u.test(rawSize)) {
		throw new Error(`could not determine ${path} size`);
	}
	const size = Number(rawSize);
	if (!Number.isSafeInteger(size) || size > maximum) {
		throw new Error(`${path} exceeds the ${maximum}-byte policy limit`);
	}
	return gitBuffer(root, ['show', object], maximum + 1);
}

function readBlob(root: string, commit: string, path: string, maximum: number): string {
	return readBlobBuffer(root, commit, path, maximum).toString('utf8');
}

function parseJsonObject(source: string, path: string): JsonRecord {
	const parsed = JSON.parse(source) as unknown;
	if (!isRecord(parsed)) throw new Error(`${path} must contain a JSON object`);
	return parsed;
}

function dependencySpecifierIsAllowed(specifier: string): boolean {
	const value = specifier.trim();
	if (
		!value ||
		remoteSource.test(value) ||
		scpSource.test(value) ||
		containsRepositoryShorthand(value)
	) {
		return false;
	}
	if (value.startsWith('workspace:')) {
		const selector = value.slice('workspace:'.length);
		return selector.length > 0 && registrySelector.test(selector);
	}
	if (value.startsWith('npm:')) return false;
	return registrySelector.test(value) && !/\.(?:tar\.gz|tgz)$/iu.test(value);
}

function assertDependencyMap(value: unknown, location: string): void {
	if (value === undefined) return;
	if (!isRecord(value)) throw new Error(`${location} must be an object`);
	for (const [name, specifier] of Object.entries(value)) {
		if (typeof specifier !== 'string' || !dependencySpecifierIsAllowed(specifier)) {
			throw new Error(`${location}.${diagnosticText(name)} uses a disallowed dependency source`);
		}
	}
}

function assertResolutionMap(value: unknown, location: string): void {
	if (value === undefined) return;
	if (!isRecord(value)) throw new Error(`${location} must be an object`);
	for (const [name, resolution] of Object.entries(value)) {
		if (typeof resolution === 'string') {
			if (!dependencySpecifierIsAllowed(resolution)) {
				throw new Error(`${location}.${diagnosticText(name)} uses a disallowed dependency source`);
			}
		} else {
			assertResolutionMap(resolution, `${location}.${diagnosticText(name)}`);
		}
	}
}

function assertManifest(manifest: JsonRecord, path: string): void {
	if (path !== 'package.json') {
		for (const field of [...RESOLUTION_FIELDS, 'patchedDependencies'] as const) {
			if (manifest[field] !== undefined) {
				throw new Error(`${path} workspace manifest may not define ${field}`);
			}
		}
	}
	for (const field of DEPENDENCY_FIELDS) {
		assertDependencyMap(manifest[field], `${path}:${field}`);
	}
	for (const field of RESOLUTION_FIELDS) {
		assertResolutionMap(manifest[field], `${path}:${field}`);
	}
}

function assertLockfile(lockfile: unknown): void {
	const pending: unknown[] = [lockfile];
	let visited = 0;
	while (pending.length > 0) {
		const value = pending.pop();
		visited += 1;
		if (visited > MAX_LOCK_VALUES) throw new Error('bun.lock exceeds the semantic value limit');
		if (typeof value === 'string') {
			if (
				remoteSource.test(value) ||
				scpSource.test(value) ||
				(value.includes('@') && containsRepositoryShorthand(value))
			) {
				throw new Error('bun.lock contains a non-registry dependency source');
			}
		} else if (Array.isArray(value)) {
			pending.push(...value);
		} else if (isRecord(value)) {
			pending.push(...Object.values(value));
		}
	}
}

function isLoadedEnvironment(path: string): boolean {
	const separator = path.lastIndexOf('/');
	const directory = separator === -1 ? '' : path.slice(0, separator);
	if (directory !== '' && directory !== 'apps/gallery') return false;
	const name = path.split('/').at(-1)!;
	if (!name.startsWith('.env')) return false;
	return !/^\.env\.(?:example|sample|template)$/u.test(name);
}

function stringMap(value: unknown, location: string): Record<string, string> {
	if (!isRecord(value)) throw new Error(`${location} must be an object`);
	const entries = Object.entries(value);
	if (entries.some(([, item]) => typeof item !== 'string')) {
		throw new Error(`${location} values must be strings`);
	}
	return Object.fromEntries(entries) as Record<string, string>;
}

function sortedEntries(value: Record<string, string>): [string, string][] {
	return Object.entries(value).sort(([left], [right]) =>
		left < right ? -1 : left > right ? 1 : 0,
	);
}

function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
	if (isRecord(value)) {
		return `{${Object.keys(value)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
			.join(',')}}`;
	}
	const primitive = JSON.stringify(value);
	if (primitive === undefined) throw new Error('bun.lock contains a non-JSON value');
	return primitive;
}

function lockResolutionSurface(lockfile: JsonRecord): string {
	const { workspaces: _workspaceMetadata, ...resolutionSurface } = lockfile;
	return canonicalJson(resolutionSurface);
}

function assertWorkspaceLockMetadata(
	lockfile: JsonRecord,
	workspaceManifests: Map<string, JsonRecord>,
): void {
	if (!isRecord(lockfile.workspaces)) throw new Error('bun.lock workspaces must be an object');
	const expectedPaths = [...workspaceManifests.keys()].sort();
	const actualPaths = Object.keys(lockfile.workspaces).sort();
	if (JSON.stringify(expectedPaths) !== JSON.stringify(actualPaths)) {
		throw new Error('bun.lock workspace paths must match tracked workspace manifests');
	}
	for (const [path, manifest] of workspaceManifests) {
		const locked = lockfile.workspaces[path];
		if (!isRecord(locked) || locked.name !== manifest.name) {
			throw new Error(`${path || 'package.json'} workspace name must match bun.lock`);
		}
	}
}

function assertTrustedFile(
	root: string,
	commit: string,
	trustedRoot: string,
	path: string,
	maximum: number,
): void {
	const candidate = readBlobBuffer(root, commit, path, maximum);
	const trusted = readFileSync(resolve(trustedRoot, path));
	if (trusted.byteLength > maximum || !candidate.equals(trusted)) {
		throw new Error(`${diagnosticText(path)} must match the immutable browser authority`);
	}
}

function assertTrustedDependencyInputs(
	root: string,
	commit: string,
	trustedRoot: string,
	rootManifest: JsonRecord,
	galleryManifest: JsonRecord,
	lockfile: JsonRecord,
): void {
	const trustedManifest = parseJsonObject(
		readFileSync(resolve(trustedRoot, 'package.json'), 'utf8'),
		'immutable package.json',
	);
	for (const field of RESOLUTION_FIELDS) {
		if (JSON.stringify(rootManifest[field]) !== JSON.stringify(trustedManifest[field])) {
			throw new Error(`package.json:${field} must match the immutable browser authority`);
		}
	}
	const candidatePatches = stringMap(
		rootManifest.patchedDependencies,
		'package.json:patchedDependencies',
	);
	const trustedPatches = stringMap(
		trustedManifest.patchedDependencies,
		'immutable package.json:patchedDependencies',
	);
	if (JSON.stringify(sortedEntries(candidatePatches)) !== JSON.stringify(sortedEntries(trustedPatches))) {
		throw new Error('package.json:patchedDependencies must match the immutable browser authority');
	}
	for (const path of Object.values(trustedPatches)) {
		if (!/^patches\/[A-Za-z0-9@._+-]+\.patch$/u.test(path)) {
			throw new Error('immutable package.json contains an invalid dependency patch path');
		}
		assertTrustedFile(root, commit, trustedRoot, path, MAX_MANIFEST_BYTES);
	}
	const trustedGallery = parseJsonObject(
		readFileSync(resolve(trustedRoot, 'apps/gallery/package.json'), 'utf8'),
		'immutable apps/gallery/package.json',
	);
	const candidateTools = stringMap(
		galleryManifest.devDependencies,
		'apps/gallery/package.json:devDependencies',
	);
	const trustedTools = stringMap(
		trustedGallery.devDependencies,
		'immutable apps/gallery/package.json:devDependencies',
	);
	for (const name of AUTHORITY_TOOL_PACKAGES) {
		if (candidateTools[name] !== trustedTools[name]) {
			throw new Error(
				`apps/gallery/package.json:${name} must match the immutable browser authority`,
			);
		}
	}
	const trustedLockfile = Bun.JSONC.parse(
		readFileSync(resolve(trustedRoot, 'bun.lock'), 'utf8'),
	) as unknown;
	if (!isRecord(trustedLockfile)) throw new Error('immutable bun.lock must contain an object');
	if (lockResolutionSurface(lockfile) !== lockResolutionSurface(trustedLockfile)) {
		throw new Error('bun.lock dependency graph must match the immutable browser authority');
	}
}

export function assertBrowserAuthorityDependencyPolicy(
	root: string,
	commit: string,
	trustedRoot = resolve(import.meta.dirname, '..'),
): void {
	if (!/^[0-9a-f]{40}$/u.test(commit)) throw new Error('commit must be a lowercase 40-hex SHA');
	const { paths } = inspectArchiveTree(gitBuffer(
		root,
		['ls-tree', '-r', '-t', '-l', '-z', '--full-tree', commit],
		MAX_TREE_BYTES,
	));
	assertArchiveAttributes(root, commit, paths);

	for (const path of paths) {
		if (
			path === 'bunfig.toml' ||
			path === 'apps/gallery/bunfig.toml' ||
			isLoadedEnvironment(path)
		) {
			throw new Error(`${diagnosticText(path)} is not allowed in a browser authority candidate`);
		}
		if (/(?:^|\/)node_modules(?:\/|$)/u.test(path)) {
			throw new Error(`${diagnosticText(path)} is not allowed in a browser authority candidate`);
		}
	}

	if (paths.includes('.npmrc')) {
		const npmrc = readBlob(root, commit, '.npmrc', MAX_MANIFEST_BYTES).replace(/\r\n/gu, '\n');
		if (npmrc !== 'engine-strict=true\n') {
			throw new Error('.npmrc may contain only engine-strict=true');
		}
	}

	const manifestPaths = paths.filter(
		(path) => path === 'package.json' || /^(?:apps|packages)\/[^/]+\/package\.json$/u.test(path),
	);
	if (!manifestPaths.includes('package.json')) throw new Error('package.json is required');
	if (manifestPaths.length > MAX_MANIFESTS) {
		throw new Error(`candidate has more than ${MAX_MANIFESTS} workspace manifests`);
	}
	let rootManifest: JsonRecord | undefined;
	let galleryManifest: JsonRecord | undefined;
	const workspaceManifests = new Map<string, JsonRecord>();
	const workspaceNames = new Set<string>();
	for (const path of manifestPaths) {
		const manifest = parseJsonObject(readBlob(root, commit, path, MAX_MANIFEST_BYTES), path);
		if (path === 'package.json') {
			rootManifest = manifest;
			workspaceManifests.set('', manifest);
			if (
				!Array.isArray(manifest.workspaces) ||
				manifest.workspaces.length !== WORKSPACES.length ||
				manifest.workspaces.some((value, index) => value !== WORKSPACES[index])
			) {
				throw new Error(`package.json workspaces must be ${WORKSPACES.join(', ')}`);
			}
		} else {
			const name = manifest.name;
			if (typeof name !== 'string' || !/^@yesid\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u.test(name)) {
				throw new Error(`${diagnosticText(path)} has an invalid workspace name`);
			}
			if (workspaceNames.has(name)) {
				throw new Error(`${diagnosticText(path)} has a duplicate workspace name`);
			}
			workspaceNames.add(name);
			workspaceManifests.set(path.slice(0, -'/package.json'.length), manifest);
			if (path === 'apps/gallery/package.json') galleryManifest = manifest;
		}
		assertManifest(manifest, path);
	}
	if (!rootManifest) throw new Error('package.json is required');
	if (!galleryManifest) throw new Error('apps/gallery/package.json is required');

	const lockfileSource = readBlob(root, commit, 'bun.lock', MAX_LOCK_BYTES);
	const lockfile = Bun.JSONC.parse(lockfileSource) as unknown;
	if (!isRecord(lockfile)) throw new Error('bun.lock must contain an object');
	assertLockfile(lockfile);
	assertWorkspaceLockMetadata(lockfile, workspaceManifests);
	assertTrustedDependencyInputs(
		root,
		commit,
		trustedRoot,
		rootManifest,
		galleryManifest,
		lockfile,
	);
}

function assertWorkflowImage(root: string, commit: string, expectedImage: string): void {
	const source = readBlob(root, commit, '.github/workflows/ci.yml', MAX_MANIFEST_BYTES);
	const workflow = Bun.YAML.parse(source) as unknown;
	if (!isRecord(workflow) || !isRecord(workflow.jobs)) {
		throw new Error('.github/workflows/ci.yml must define jobs');
	}
	const browserJob = workflow.jobs['browser-authority-work'];
	if (!isRecord(browserJob) || !isRecord(browserJob.container)) {
		throw new Error('.github/workflows/ci.yml must define browser-authority-work.container');
	}
	if (browserJob.container.image !== expectedImage) {
		throw new Error('authority pin mismatch: browser-authority-work.container.image');
	}
}

if (import.meta.main) {
	try {
		if (process.argv.length !== 5) {
			throw new Error('expected repository root, commit SHA, and browser image');
		}
		assertBrowserAuthorityDependencyPolicy(resolve(process.argv[2]!), process.argv[3]!);
		assertWorkflowImage(resolve(process.argv[2]!), process.argv[3]!, process.argv[4]!);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`browser authority dependency policy: ${diagnosticText(message)}`);
		process.exitCode = 2;
	}
}
