#!/usr/bin/env bun

import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseConfigReleaseTag } from './config-release.js';
import {
	compareVersions,
	lockWorkspaceVersion,
	parseExactSemVer,
	replaceLockWorkspaceVersion,
	sameCore,
	type ExactSemVer,
} from './release-core.js';

const CONFIG_PACKAGE = '@yesid/config';
const CONFIG_MANIFEST = 'packages/config/package.json';
const CONFIG_CHANGELOG = 'packages/config/CHANGELOG.md';
const CONFIG_CHANGES = '.config-changes';
const CONFIG_WORKSPACE = 'packages/config';
const FRAGMENT_PATH = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/u;

type ConfigBump = 'patch' | 'minor' | 'major';

interface ConfigFragment {
	id: string;
	path: string;
	bump: ConfigBump;
	description: string;
}

interface ConfigVersionState {
	version: string;
	manifest: string;
	lockfile: string;
	changelog: string;
}

function parseFragment(path: string, source: string): ConfigFragment {
	const name = path.slice(`${CONFIG_CHANGES}/`.length);
	if (!FRAGMENT_PATH.test(name)) throw new Error(`${path} is not a safe config fragment path`);
	const normalized = source.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
	const match = normalized.match(/^---\nbump: (patch|minor|major)\n---\n+([\s\S]+)$/u);
	if (!match?.[1] || !match[2]) {
		throw new Error(`${path} must contain config release front matter and a description`);
	}
	const description = match[2].trim();
	if (!description) throw new Error(`${path} must contain a non-empty description`);
	return { id: name.slice(0, -3), path, bump: match[1] as ConfigBump, description };
}

function readFragments(repositoryRoot: string): ConfigFragment[] {
	const directory = join(repositoryRoot, CONFIG_CHANGES);
	if (!existsSync(directory)) return [];
	return readdirSync(directory, { withFileTypes: true })
		.sort((left, right) => left.name.localeCompare(right.name))
		.map((entry) => {
			if (!entry.isFile()) throw new Error(`${CONFIG_CHANGES}/${entry.name} must be a file`);
			const path = `${CONFIG_CHANGES}/${entry.name}`;
			return parseFragment(path, readFileSync(join(repositoryRoot, path), 'utf8'));
		});
}

function readState(repositoryRoot: string): ConfigVersionState {
	const manifest = readFileSync(join(repositoryRoot, CONFIG_MANIFEST), 'utf8');
	const parsed = JSON.parse(manifest) as { name?: unknown; version?: unknown };
	if (parsed.name !== CONFIG_PACKAGE || typeof parsed.version !== 'string') {
		throw new Error(`${CONFIG_MANIFEST} must name ${CONFIG_PACKAGE} with an exact version`);
	}
	const version = parseExactSemVer(parsed.version).version;
	const lockfile = readFileSync(join(repositoryRoot, 'bun.lock'), 'utf8');
	const lockVersion = lockWorkspaceVersion(lockfile, CONFIG_WORKSPACE);
	if (lockVersion !== version) {
		throw new Error(`Config version drift: bun.lock is ${lockVersion}; expected ${version}`);
	}
	return {
		version,
		manifest,
		lockfile,
		changelog: readFileSync(join(repositoryRoot, CONFIG_CHANGELOG), 'utf8'),
	};
}

function changelogVersions(changelog: string): string[] {
	const versions = [...changelog.matchAll(/^## ([^\n]+)$/gmu)].map((match) =>
		parseExactSemVer(match[1] ?? '').version,
	);
	if (new Set(versions).size !== versions.length) {
		throw new Error(`${CONFIG_CHANGELOG} contains duplicate releases`);
	}
	return versions;
}

function consumedFragments(changelog: string): Set<string> {
	const consumed = new Set<string>();
	for (const match of changelog.matchAll(
		/^<!-- config-release-fragment: ([a-z0-9]+(?:-[a-z0-9]+)*) -->$/gmu,
	)) {
		const id = match[1] ?? '';
		if (consumed.has(id)) throw new Error(`Config release fragment ${id} was consumed twice`);
		consumed.add(id);
	}
	return consumed;
}

function highestBump(fragments: readonly ConfigFragment[]): ConfigBump {
	const rank: Record<ConfigBump, number> = { patch: 0, minor: 1, major: 2 };
	return fragments.reduce<ConfigBump>(
		(highest, fragment) => (rank[fragment.bump] > rank[highest] ? fragment.bump : highest),
		'patch',
	);
}

function expectedCore(current: ExactSemVer, bump: ConfigBump): [bigint, bigint, bigint] {
	if (bump === 'major') return [current.major + 1n, 0n, 0n];
	if (bump === 'minor') return [current.major, current.minor + 1n, 0n];
	return [current.major, current.minor, current.patch + 1n];
}

function assertTransition(
	current: ExactSemVer,
	target: ExactSemVer,
	fragments: readonly ConfigFragment[],
	latest: string | undefined,
): void {
	if (compareVersions(target, current) <= 0) {
		throw new Error(`Config release ${target.version} must advance from ${current.version}`);
	}
	if (fragments.length === 0) {
		if (
			current.prerelease.length === 0 ||
			target.prerelease.length !== 0 ||
			target.build.length !== 0 ||
			!sameCore(current, target) ||
			latest !== current.version
		) {
			throw new Error('Config release without fragments must be a same-core prerelease promotion');
		}
		return;
	}
	if (current.prerelease.length > 0 && target.prerelease.length > 0 && sameCore(current, target)) {
		return;
	}
	const bump = highestBump(fragments);
	const expected = expectedCore(current, bump);
	if (
		target.major !== expected[0] ||
		target.minor !== expected[1] ||
		target.patch !== expected[2]
	) {
		throw new Error(
			`Config release ${target.version} does not satisfy the requested ${bump} bump from ${current.version}`,
		);
	}
}

function replaceManifestVersion(source: string, current: string, target: string): string {
	const pattern = /^(\s*"version"\s*:\s*")([^"]+)("\s*,?\s*)$/gmu;
	const matches = [...source.matchAll(pattern)];
	if (matches.length !== 1 || matches[0]?.[2] !== current) {
		throw new Error(`${CONFIG_MANIFEST} must contain one current top-level version`);
	}
	return source.replace(pattern, `$1${target}$3`);
}

let temporarySequence = 0;

function writeAtomic(path: string, source: string): void {
	mkdirSync(dirname(path), { recursive: true });
	const temporary = `${path}.config-release-${process.pid}-${temporarySequence++}.tmp`;
	try {
		writeFileSync(temporary, source, 'utf8');
		renameSync(temporary, path);
	} finally {
		rmSync(temporary, { force: true });
	}
}

function renderFragment(fragment: ConfigFragment): string {
	const description = fragment.description.replaceAll('\n', '\n  ');
	return `<!-- config-release-fragment: ${fragment.id} -->\n- ${description}`;
}

export function prepareConfigVersion(repositoryRootInput: string, version: string): void {
	const repositoryRoot = resolve(repositoryRootInput);
	const state = readState(repositoryRoot);
	const current = parseExactSemVer(state.version);
	const target = parseExactSemVer(version);
	const fragments = readFragments(repositoryRoot);
	const consumed = consumedFragments(state.changelog);
	for (const fragment of fragments) {
		if (consumed.has(fragment.id)) {
			throw new Error(`Config release fragment ${fragment.id} was already consumed`);
		}
	}
	const versions = changelogVersions(state.changelog);
	assertTransition(current, target, fragments, versions[0]);
	let changelog: string;
	if (fragments.length > 0) {
		if (versions.includes(target.version)) {
			throw new Error(`${CONFIG_CHANGELOG} already contains ${target.version}`);
		}
		const heading = `## ${target.version}\n\n${fragments.map(renderFragment).join('\n\n')}`;
		changelog = state.changelog.startsWith('# Changelog\n')
			? state.changelog.replace('# Changelog\n', `# Changelog\n\n${heading}\n`)
			: (() => {
					throw new Error(`${CONFIG_CHANGELOG} must start with # Changelog`);
				})();
	} else {
		changelog = state.changelog.replace(`## ${current.version}\n`, `## ${target.version}\n`);
	}
	writeAtomic(
		join(repositoryRoot, CONFIG_MANIFEST),
		replaceManifestVersion(state.manifest, current.version, target.version),
	);
	writeAtomic(
		join(repositoryRoot, 'bun.lock'),
		replaceLockWorkspaceVersion(
			state.lockfile,
			CONFIG_WORKSPACE,
			current.version,
			target.version,
		),
	);
	writeAtomic(join(repositoryRoot, CONFIG_CHANGELOG), changelog);
	for (const fragment of fragments) rmSync(join(repositoryRoot, fragment.path));
}

export function checkConfigVersion(
	repositoryRootInput: string,
	version: string,
	tag?: string,
): void {
	const repositoryRoot = resolve(repositoryRootInput);
	const expected = parseExactSemVer(version).version;
	const state = readState(repositoryRoot);
	if (state.version !== expected) {
		throw new Error(`Prepared config version is ${state.version}; expected ${expected}`);
	}
	if (tag !== undefined && parseConfigReleaseTag(tag) !== expected) {
		throw new Error(`Config release tag ${tag} does not match version ${expected}`);
	}
	const pending = readFragments(repositoryRoot);
	if (pending.length > 0) {
		throw new Error(`Prepared config release still has pending fragments`);
	}
	const versions = changelogVersions(state.changelog);
	if (versions[0] !== expected) {
		throw new Error(`Latest ${CONFIG_CHANGELOG} release is ${versions[0] ?? '<missing>'}`);
	}
	if (consumedFragments(state.changelog).size === 0) {
		throw new Error(`${CONFIG_CHANGELOG} has no consumed config release fragments`);
	}
}

interface Arguments {
	command: 'prepare' | 'check';
	version: string;
	tag?: string;
}

function parseArguments(argv: readonly string[]): Arguments {
	const [command, ...raw] = argv;
	if (command !== 'prepare' && command !== 'check') {
		throw new Error('usage: bun tools/config-version.ts <prepare|check> --version <exact SemVer>');
	}
	const values = new Map<string, string>();
	for (let index = 0; index < raw.length; index += 2) {
		const key = raw[index] ?? '';
		const value = raw[index + 1] ?? '';
		if (!['--version', '--tag'].includes(key) || !value) {
			throw new Error(`invalid config version argument ${key || '<missing>'}`);
		}
		if (values.has(key)) throw new Error(`duplicate config version argument ${key}`);
		values.set(key, value);
	}
	const version = values.get('--version');
	if (!version) throw new Error(`${command} requires --version`);
	if (command === 'prepare' && values.has('--tag')) throw new Error('prepare does not accept --tag');
	const tag = values.get('--tag');
	return tag === undefined ? { command, version } : { command, version, tag };
}

export function main(argv = process.argv.slice(2), repositoryRoot = process.cwd()): number {
	try {
		const args = parseArguments(argv);
		if (args.command === 'prepare') prepareConfigVersion(repositoryRoot, args.version);
		else checkConfigVersion(repositoryRoot, args.version, args.tag);
		console.log(`Config release ${args.version} ${args.command === 'prepare' ? 'prepared' : 'checked'}`);
		return 0;
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		return 1;
	}
}

const entrypoint = process.argv[1] ? resolve(process.argv[1]) : '';
if (entrypoint === fileURLToPath(import.meta.url)) process.exitCode = main();
