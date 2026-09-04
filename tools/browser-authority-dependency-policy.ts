#!/usr/bin/env bun

import { execFileSync } from 'node:child_process';
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
const WORKSPACES = ['apps/*', 'packages/*'];
const DEPENDENCY_FIELDS = [
	'dependencies',
	'devDependencies',
	'optionalDependencies',
	'peerDependencies',
] as const;
const RESOLUTION_FIELDS = ['overrides', 'resolutions'] as const;
const registrySelector = /^[0-9A-Za-z*^~<>=|&!+._\-\s]+$/u;
const remoteSource =
	/(?:^|@)(?:(?:https?|git(?:\+[a-z0-9]+)?|ssh|github|gitlab|bitbucket|file|link):|\/\/)/iu;
const scpSource = /(?:^|@)git@[^:\s]+:/iu;
const diagnosticControls = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/gu;

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

function readBlob(root: string, commit: string, path: string, maximum: number): string {
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
	return gitText(root, ['show', object], maximum + 1);
}

function parseJsonObject(source: string, path: string): JsonRecord {
	const parsed = JSON.parse(source) as unknown;
	if (!isRecord(parsed)) throw new Error(`${path} must contain a JSON object`);
	return parsed;
}

function npmAliasIsRegistryOnly(specifier: string): boolean {
	const alias = specifier.slice(4);
	const separator = alias.startsWith('@')
		? alias.indexOf('@', alias.indexOf('/') + 1)
		: alias.indexOf('@');
	const name = separator === -1 ? alias : alias.slice(0, separator);
	const selector = separator === -1 ? 'latest' : alias.slice(separator + 1);
	return (
		/^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/u.test(name) &&
		selector.length > 0 &&
		registrySelector.test(selector)
	);
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
	if (value.startsWith('npm:')) return npmAliasIsRegistryOnly(value);
	return registrySelector.test(value) && !/\.(?:tar\.gz|tgz)$/iu.test(value);
}

function assertDependencyMap(value: unknown, location: string): void {
	if (value === undefined) return;
	if (!isRecord(value)) throw new Error(`${location} must be an object`);
	for (const [name, specifier] of Object.entries(value)) {
		if (typeof specifier !== 'string' || !dependencySpecifierIsAllowed(specifier)) {
			throw new Error(`${location}.${diagnosticText(name)} uses a non-registry dependency source`);
		}
	}
}

function assertResolutionMap(value: unknown, location: string): void {
	if (value === undefined) return;
	if (!isRecord(value)) throw new Error(`${location} must be an object`);
	for (const [name, resolution] of Object.entries(value)) {
		if (typeof resolution === 'string') {
			if (!dependencySpecifierIsAllowed(resolution)) {
				throw new Error(`${location}.${diagnosticText(name)} uses a non-registry dependency source`);
			}
		} else {
			assertResolutionMap(resolution, `${location}.${diagnosticText(name)}`);
		}
	}
}

function assertManifest(manifest: JsonRecord, path: string): void {
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
	const name = path.split('/').at(-1)!;
	if (!name.startsWith('.env')) return false;
	return !/^\.env\.(?:example|sample|template)$/u.test(name);
}

export function assertBrowserAuthorityDependencyPolicy(root: string, commit: string): void {
	if (!/^[0-9a-f]{40}$/u.test(commit)) throw new Error('commit must be a lowercase 40-hex SHA');
	const paths = gitBuffer(
		root,
		['ls-tree', '-r', '-t', '-z', '--name-only', commit],
		MAX_TREE_BYTES,
	)
		.toString('utf8')
		.split('\0')
		.filter(Boolean);
	if (paths.length > 100_000) throw new Error('repository tree exceeds the dependency policy limit');
	assertArchiveAttributes(root, commit, paths);

	for (const path of paths) {
		const name = path.split('/').at(-1)!;
		if (name === 'bunfig.toml' || isLoadedEnvironment(path)) {
			throw new Error(`${diagnosticText(path)} is not allowed in a browser authority candidate`);
		}
		if (name === '.npmrc' && path !== '.npmrc') {
			throw new Error(`${diagnosticText(path)} is not an allowed npm configuration path`);
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
	for (const path of manifestPaths) {
		const manifest = parseJsonObject(readBlob(root, commit, path, MAX_MANIFEST_BYTES), path);
		if (path === 'package.json') {
			if (
				!Array.isArray(manifest.workspaces) ||
				manifest.workspaces.length !== WORKSPACES.length ||
				manifest.workspaces.some((value, index) => value !== WORKSPACES[index])
			) {
				throw new Error(`package.json workspaces must be ${WORKSPACES.join(', ')}`);
			}
		}
		assertManifest(manifest, path);
	}

	const lockfileSource = readBlob(root, commit, 'bun.lock', MAX_LOCK_BYTES);
	const lockfile = Bun.JSONC.parse(lockfileSource) as unknown;
	if (!isRecord(lockfile)) throw new Error('bun.lock must contain an object');
	assertLockfile(lockfile);
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
