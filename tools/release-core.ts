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

export const RELEASED_PACKAGES = [
	'@yesid/tokens',
	'@yesid/motion',
	'@yesid/gates',
	'@yesid/seo-kit',
	'@yesid/ui',
] as const;

export type ReleasedPackageName = (typeof RELEASED_PACKAGES)[number];
export type ReleaseBump = 'patch' | 'minor' | 'major';

export interface ParsedChangeFragment {
	id: string;
	path: string;
	packages: ReadonlyMap<ReleasedPackageName, ReleaseBump>;
	description: string;
}

export interface ChangeFragmentInput {
	path: string;
	source: string;
}

export interface ExactSemVer {
	version: string;
	major: bigint;
	minor: bigint;
	patch: bigint;
	prerelease: readonly (bigint | string)[];
	build: readonly string[];
}

export interface PreparedReleaseExpectation {
	version: string;
	tag?: string;
}

const RELEASED_WORKSPACES: Readonly<
	Record<ReleasedPackageName, `packages/${'tokens' | 'motion' | 'gates' | 'seo-kit' | 'ui'}`>
> = {
	'@yesid/tokens': 'packages/tokens',
	'@yesid/motion': 'packages/motion',
	'@yesid/gates': 'packages/gates',
	'@yesid/seo-kit': 'packages/seo-kit',
	'@yesid/ui': 'packages/ui',
};
const FRAGMENT_PATH = /^\.changes\/([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/u;
const NUMERIC_IDENTIFIER = /^(?:0|[1-9]\d*)$/u;
const CORE_IDENTIFIER = '(0|[1-9]\\d*)';
const PRERELEASE_IDENTIFIER = '(?:0|[1-9]\\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)';
const BUILD_IDENTIFIER = '[0-9A-Za-z-]+';
const EXACT_SEMVER = new RegExp(
	`^${CORE_IDENTIFIER}\\.${CORE_IDENTIFIER}\\.${CORE_IDENTIFIER}` +
		`(?:-(${PRERELEASE_IDENTIFIER}(?:\\.${PRERELEASE_IDENTIFIER})*))?` +
		`(?:\\+(${BUILD_IDENTIFIER}(?:\\.${BUILD_IDENTIFIER})*))?$`,
	'u',
);

function normalizeLineEndings(source: string): string {
	return source.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

function isReleasedPackage(value: string): value is ReleasedPackageName {
	return RELEASED_PACKAGES.some((packageName) => packageName === value);
}

function isReleaseBump(value: string): value is ReleaseBump {
	return value === 'patch' || value === 'minor' || value === 'major';
}

export function parseExactSemVer(value: string): ExactSemVer {
	const match = value.length <= 256 ? EXACT_SEMVER.exec(value) : null;
	if (!match?.[1] || !match[2] || !match[3]) throw new Error(`Invalid exact SemVer: ${value}`);
	const prerelease = match[4]
		? match[4]
				.split('.')
				.map((identifier) =>
					NUMERIC_IDENTIFIER.test(identifier) ? BigInt(identifier) : identifier,
				)
		: [];
	return {
		version: value,
		major: BigInt(match[1]),
		minor: BigInt(match[2]),
		patch: BigInt(match[3]),
		prerelease,
		build: match[5]?.split('.') ?? [],
	};
}

export function parseReleaseTag(tag: string): string {
	if (!tag.startsWith('v')) {
		throw new Error(`Invalid release tag ${tag}; expected v<exact SemVer>`);
	}
	try {
		return parseExactSemVer(tag.slice(1)).version;
	} catch {
		throw new Error(`Invalid release tag ${tag}; expected v<exact SemVer>`);
	}
}

export function assertTagMatchesVersion(tag: string, version: string): void {
	parseExactSemVer(version);
	if (parseReleaseTag(tag) !== version) {
		throw new Error(`Release tag ${tag} does not match version ${version}`);
	}
}

export function parseChangeFragment(source: string, path: string): ParsedChangeFragment {
	const pathMatch = FRAGMENT_PATH.exec(path);
	if (!pathMatch?.[1]) throw new Error(`${path} is not a safe release fragment path`);
	const normalized = normalizeLineEndings(source);
	if (!normalized.startsWith('---\n')) {
		throw new Error(`${path} must start with release fragment front matter`);
	}
	const emptyFrontMatter = normalized.startsWith('---\n---\n');
	const end = emptyFrontMatter ? 4 : normalized.indexOf('\n---\n', 4);
	if (end === -1) throw new Error(`${path} must close release fragment front matter`);
	const descriptionStart = emptyFrontMatter ? 8 : end + '\n---\n'.length;

	const packages = new Map<ReleasedPackageName, ReleaseBump>();
	const frontMatter = normalized.slice(4, end);
	for (const declaration of frontMatter ? frontMatter.split('\n') : []) {
		const match = declaration.match(/^"([^"]+)":\s*([^\s]+)$/u);
		if (!match?.[1] || !match[2]) {
			throw new Error(`${path} has malformed release declaration: ${declaration || '<empty>'}`);
		}
		const [packageName, bump] = [match[1], match[2]];
		if (!isReleasedPackage(packageName)) {
			throw new Error(`${path} names unknown released package ${packageName}`);
		}
		if (!isReleaseBump(bump)) {
			throw new Error(`${path} has invalid bump ${bump} for ${packageName}`);
		}
		if (packages.has(packageName)) {
			throw new Error(`${path} declares ${packageName} more than once`);
		}
		packages.set(packageName, bump);
	}
	if (packages.size === 0) throw new Error(`${path} must name at least one released package`);
	const description = normalized.slice(descriptionStart).trim();
	if (!description) throw new Error(`${path} must contain a non-empty change description`);
	return { id: pathMatch[1], path, packages, description };
}

export function parseChangeFragments(
	inputs: readonly ChangeFragmentInput[],
): ParsedChangeFragment[] {
	const identities = new Set<string>();
	return [...inputs]
		.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
		.map(({ path, source }) => {
			const fragment = parseChangeFragment(source, path);
			if (identities.has(fragment.id)) {
				throw new Error(`Duplicate release fragment identity: ${fragment.id}`);
			}
			identities.add(fragment.id);
			return fragment;
		});
}

interface ManifestState {
	path: string;
	source: string;
	version: string;
}

interface RepositoryVersionState {
	version: string;
	manifests: ManifestState[];
	lockfile: string;
}

function readManifest(repositoryRoot: string, path: string, expectedName: string): ManifestState {
	const source = readFileSync(join(repositoryRoot, path), 'utf8');
	let manifest: { name?: unknown; version?: unknown };
	try {
		manifest = JSON.parse(source) as { name?: unknown; version?: unknown };
	} catch {
		throw new Error(`${path} is not valid JSON`);
	}
	if (manifest.name !== expectedName) throw new Error(`${path} must name ${expectedName}`);
	if (typeof manifest.version !== 'string') throw new Error(`${path} must define a string version`);
	parseExactSemVer(manifest.version);
	return { path, source, version: manifest.version };
}

function findMatchingBrace(source: string, open: number): number {
	let depth = 0;
	let quoted = false;
	let escaped = false;
	for (let index = open; index < source.length; index += 1) {
		const character = source[index];
		if (quoted) {
			if (escaped) escaped = false;
			else if (character === '\\') escaped = true;
			else if (character === '"') quoted = false;
			continue;
		}
		if (character === '"') quoted = true;
		else if (character === '{') depth += 1;
		else if (character === '}' && --depth === 0) return index;
	}
	throw new Error('bun.lock contains an unterminated workspace object');
}

function objectForKey(
	source: string,
	key: string,
	searchStart = 0,
	searchEnd = source.length,
): { start: number; end: number } {
	const encoded = JSON.stringify(key);
	let keyIndex = source.indexOf(encoded, searchStart);
	while (keyIndex !== -1 && keyIndex < searchEnd) {
		let cursor = keyIndex + encoded.length;
		while (/\s/u.test(source[cursor] ?? '')) cursor += 1;
		if (source[cursor] === ':') {
			cursor += 1;
			while (/\s/u.test(source[cursor] ?? '')) cursor += 1;
			if (source[cursor] === '{') {
				const end = findMatchingBrace(source, cursor);
				if (end < searchEnd) return { start: cursor, end };
			}
		}
		keyIndex = source.indexOf(encoded, keyIndex + encoded.length);
	}
	throw new Error(`bun.lock is missing workspace object ${key}`);
}

export function lockWorkspaceVersion(source: string, workspace: string): string {
	const workspaces = objectForKey(source, 'workspaces');
	const block = objectForKey(source, workspace, workspaces.start + 1, workspaces.end);
	const object = source.slice(block.start, block.end + 1);
	const matches = [...object.matchAll(/^\s*"version"\s*:\s*"([^"]+)"\s*,?\s*$/gmu)];
	if (matches.length !== 1 || !matches[0]?.[1]) {
		throw new Error(`bun.lock workspace ${workspace} must define exactly one version`);
	}
	return matches[0][1];
}

export function replaceLockWorkspaceVersion(
	source: string,
	workspace: string,
	currentVersion: string,
	targetVersion: string,
): string {
	const workspaces = objectForKey(source, 'workspaces');
	const block = objectForKey(source, workspace, workspaces.start + 1, workspaces.end);
	const object = source.slice(block.start, block.end + 1);
	const pattern = /^(\s*"version"\s*:\s*")([^"]+)("\s*,?\s*)$/gmu;
	const matches = [...object.matchAll(pattern)];
	if (matches.length !== 1 || matches[0]?.[2] !== currentVersion) {
		throw new Error(`Cannot update bun.lock workspace ${workspace} from ${currentVersion}`);
	}
	const updated = object.replace(pattern, `$1${targetVersion}$3`);
	return `${source.slice(0, block.start)}${updated}${source.slice(block.end + 1)}`;
}

function readRepositoryVersionState(repositoryRootInput: string): RepositoryVersionState {
	const repositoryRoot = resolve(repositoryRootInput);
	const root = readManifest(repositoryRoot, 'package.json', 'yesid-dev-design');
	const manifests = [
		root,
		...RELEASED_PACKAGES.map((packageName) => {
			const workspace = RELEASED_WORKSPACES[packageName];
			return readManifest(repositoryRoot, `${workspace}/package.json`, packageName);
		}),
	];
	for (const manifest of manifests.slice(1)) {
		if (manifest.version !== root.version) {
			throw new Error(
				`Lockstep version drift: ${manifest.path} is ${manifest.version}; expected ${root.version}`,
			);
		}
	}
	const gallery = readManifest(repositoryRoot, 'apps/gallery/package.json', '@yesid/gallery');
	if (gallery.version !== '0.1.0') {
		throw new Error(
			`Private Gallery version drift: apps/gallery/package.json is ${gallery.version}; expected 0.1.0`,
		);
	}
	const lockfile = readFileSync(join(repositoryRoot, 'bun.lock'), 'utf8');
	for (const packageName of RELEASED_PACKAGES) {
		const workspace = RELEASED_WORKSPACES[packageName];
		const version = lockWorkspaceVersion(lockfile, workspace);
		if (version !== root.version) {
			throw new Error(
				`Lockstep version drift: bun.lock ${workspace} is ${version}; expected ${root.version}`,
			);
		}
	}
	const galleryLockVersion = lockWorkspaceVersion(lockfile, 'apps/gallery');
	if (galleryLockVersion !== '0.1.0') {
		throw new Error(
			`Private Gallery version drift: bun.lock apps/gallery is ${galleryLockVersion}; expected 0.1.0`,
		);
	}
	return { version: root.version, manifests, lockfile };
}

function replaceManifestVersion(manifest: ManifestState, targetVersion: string): string {
	const pattern = /^(\s*"version"\s*:\s*")([^"]+)("\s*,?\s*)$/gmu;
	const matches = [...manifest.source.matchAll(pattern)];
	if (matches.length !== 1 || matches[0]?.[2] !== manifest.version) {
		throw new Error(`${manifest.path} must contain exactly one top-level version field`);
	}
	return manifest.source.replace(pattern, `$1${targetVersion}$3`);
}

function readChangeFragmentInputs(repositoryRoot: string): ChangeFragmentInput[] {
	const directory = join(repositoryRoot, '.changes');
	if (!existsSync(directory)) return [];
	return readdirSync(directory, { withFileTypes: true })
		.filter((entry) => entry.name !== '.gitkeep')
		.map((entry) => {
			const path = `.changes/${entry.name}`;
			if (!entry.isFile()) throw new Error(`${path} must be a regular release fragment file`);
			return { path, source: readFileSync(join(directory, entry.name), 'utf8') };
		});
}

function readChangelog(repositoryRoot: string): string {
	const path = join(repositoryRoot, 'CHANGELOG.md');
	if (!existsSync(path)) return '# Changelog\n';
	const source = normalizeLineEndings(readFileSync(path, 'utf8'));
	if (!source.startsWith('# Changelog\n')) {
		throw new Error('CHANGELOG.md must start with # Changelog');
	}
	return source;
}

function consumedFragmentIds(changelog: string): Set<string> {
	const consumed = new Set<string>();
	for (const line of changelog.split('\n')) {
		if (!line.startsWith('<!-- release-fragment:')) continue;
		const match = line.match(/^<!-- release-fragment: ([a-z0-9]+(?:-[a-z0-9]+)*) -->$/u);
		if (!match?.[1]) throw new Error(`Malformed consumed release fragment marker: ${line}`);
		if (consumed.has(match[1])) {
			throw new Error(`Duplicate consumed release fragment identity: ${match[1]}`);
		}
		consumed.add(match[1]);
	}
	return consumed;
}

function changelogVersions(changelog: string): string[] {
	const versions = [...changelog.matchAll(/^## ([^\n]+)$/gmu)].map((match) =>
		parseExactSemVer(match[1] ?? '').version,
	);
	const unique = new Set<string>();
	for (const version of versions) {
		if (unique.has(version)) throw new Error(`Duplicate CHANGELOG.md release: ${version}`);
		unique.add(version);
	}
	return versions;
}

function latestChangelogVersion(changelog: string): string | undefined {
	return changelogVersions(changelog)[0];
}

function comparePrerelease(
	left: readonly (bigint | string)[],
	right: readonly (bigint | string)[],
): number {
	if (left.length === 0 || right.length === 0) {
		return left.length === right.length ? 0 : left.length === 0 ? 1 : -1;
	}
	for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
		const leftPart = left[index];
		const rightPart = right[index];
		if (leftPart === undefined || rightPart === undefined) {
			return leftPart === rightPart ? 0 : leftPart === undefined ? -1 : 1;
		}
		if (leftPart === rightPart) continue;
		if (typeof leftPart === 'bigint' && typeof rightPart === 'bigint') {
			return leftPart < rightPart ? -1 : 1;
		}
		if (typeof leftPart === 'bigint' || typeof rightPart === 'bigint') {
			return typeof leftPart === 'bigint' ? -1 : 1;
		}
		return leftPart < rightPart ? -1 : 1;
	}
	return 0;
}

export function compareVersions(left: ExactSemVer, right: ExactSemVer): number {
	for (const key of ['major', 'minor', 'patch'] as const) {
		if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
	}
	return comparePrerelease(left.prerelease, right.prerelease);
}

export function sameCore(left: ExactSemVer, right: ExactSemVer): boolean {
	return left.major === right.major && left.minor === right.minor && left.patch === right.patch;
}

function highestRequestedBump(fragments: readonly ParsedChangeFragment[]): ReleaseBump {
	const rank: Record<ReleaseBump, number> = { patch: 0, minor: 1, major: 2 };
	let highest: ReleaseBump = 'patch';
	for (const fragment of fragments) {
		for (const bump of fragment.packages.values()) {
			if (rank[bump] > rank[highest]) highest = bump;
		}
	}
	return highest;
}

function expectedCoreAfterBump(current: ExactSemVer, bump: ReleaseBump): [bigint, bigint, bigint] {
	if (bump === 'major') return [current.major + 1n, 0n, 0n];
	if (bump === 'minor') return [current.major, current.minor + 1n, 0n];
	return [current.major, current.minor, current.patch + 1n];
}

function assertFragmentReleaseTransition(
	current: ExactSemVer,
	target: ExactSemVer,
	fragments: readonly ParsedChangeFragment[],
	latestChangelog: string | undefined,
): void {
	const bootstrap =
		current.version === '0.7.0' &&
		target.version === '0.7.0-rc.1' &&
		latestChangelog === undefined;
	if (bootstrap) return;
	if (compareVersions(target, current) <= 0) {
		throw new Error(`Release version ${target.version} must advance from ${current.version}`);
	}
	if (current.prerelease.length > 0 && target.prerelease.length > 0 && sameCore(current, target)) {
		return;
	}
	const expected = expectedCoreAfterBump(current, highestRequestedBump(fragments));
	if (
		target.major !== expected[0] ||
		target.minor !== expected[1] ||
		target.patch !== expected[2]
	) {
		throw new Error(
			`Release ${target.version} does not satisfy the highest requested ${highestRequestedBump(fragments)} bump from ${current.version}`,
		);
	}
}

function assertStablePromotion(
	current: ExactSemVer,
	target: ExactSemVer,
	latestChangelog: string | undefined,
): void {
	const isPromotion =
		current.prerelease.length > 0 &&
		target.prerelease.length === 0 &&
		target.build.length === 0 &&
		sameCore(current, target) &&
		latestChangelog === current.version;
	if (!isPromotion) {
		throw new Error(
			`Release ${target.version} has no fragments and is not a same-core prerelease promotion`,
		);
	}
}

function renderFragment(fragment: ParsedChangeFragment): string {
	const packages = RELEASED_PACKAGES.filter((packageName) => fragment.packages.has(packageName)).map(
		(packageName) => `\`${packageName}\` (${fragment.packages.get(packageName)})`,
	);
	const description = fragment.description
		.split('\n')
		.map((line, index) => (index === 0 || line.length === 0 ? line : `  ${line}`))
		.join('\n');
	return `<!-- release-fragment: ${fragment.id} -->\n- ${packages.join(', ')}: ${description}`;
}

function prependChangelogSection(
	changelog: string,
	version: string,
	fragments: readonly ParsedChangeFragment[],
): string {
	const rest = changelog.slice('# Changelog\n'.length).trim();
	const section = `## ${version}\n\n${fragments.map(renderFragment).join('\n\n')}`;
	return `# Changelog\n\n${section}${rest ? `\n\n${rest}` : ''}\n`;
}

function promoteLatestChangelogSection(
	changelog: string,
	currentVersion: string,
	targetVersion: string,
): string {
	const heading = `## ${currentVersion}`;
	if (!changelog.includes(heading)) {
		throw new Error(`CHANGELOG.md is missing latest release ${currentVersion}`);
	}
	return changelog.replace(heading, `## ${targetVersion}`);
}

let temporaryFileSequence = 0;

function writeAtomic(path: string, source: string): void {
	mkdirSync(dirname(path), { recursive: true });
	const temporary = `${path}.release-${process.pid}-${temporaryFileSequence++}.tmp`;
	try {
		writeFileSync(temporary, source, 'utf8');
		renameSync(temporary, path);
	} finally {
		rmSync(temporary, { force: true });
	}
}

export function prepareRelease(repositoryRootInput: string, version: string): void {
	const repositoryRoot = resolve(repositoryRootInput);
	const target = parseExactSemVer(version);
	const state = readRepositoryVersionState(repositoryRoot);
	const current = parseExactSemVer(state.version);
	const changelog = readChangelog(repositoryRoot);
	const consumed = consumedFragmentIds(changelog);
	const fragments = parseChangeFragments(readChangeFragmentInputs(repositoryRoot));
	for (const fragment of fragments) {
		if (consumed.has(fragment.id)) {
			throw new Error(`Release fragment ${fragment.id} was already consumed`);
		}
	}

	const latest = latestChangelogVersion(changelog);
	let nextChangelog: string;
	if (fragments.length > 0) {
		assertFragmentReleaseTransition(current, target, fragments, latest);
		if (changelogVersions(changelog).includes(target.version)) {
			throw new Error(`CHANGELOG.md already contains release ${target.version}`);
		}
		nextChangelog = prependChangelogSection(changelog, target.version, fragments);
	} else {
		assertStablePromotion(current, target, latest);
		nextChangelog = promoteLatestChangelogSection(changelog, current.version, target.version);
	}

	let nextLockfile = state.lockfile;
	for (const packageName of RELEASED_PACKAGES) {
		nextLockfile = replaceLockWorkspaceVersion(
			nextLockfile,
			RELEASED_WORKSPACES[packageName],
			state.version,
			target.version,
		);
	}
	const writes = [
		...state.manifests.map((manifest) => ({
			path: join(repositoryRoot, manifest.path),
			source: replaceManifestVersion(manifest, target.version),
		})),
		{ path: join(repositoryRoot, 'bun.lock'), source: nextLockfile },
		{ path: join(repositoryRoot, 'CHANGELOG.md'), source: nextChangelog },
	];
	for (const output of writes) writeAtomic(output.path, output.source);
	for (const fragment of fragments) rmSync(join(repositoryRoot, fragment.path));
}

export function checkPreparedRelease(
	repositoryRootInput: string,
	expectation: PreparedReleaseExpectation,
): void {
	const repositoryRoot = resolve(repositoryRootInput);
	const expected = parseExactSemVer(expectation.version);
	const state = readRepositoryVersionState(repositoryRoot);
	if (state.version !== expected.version) {
		throw new Error(`Prepared release version is ${state.version}; expected ${expected.version}`);
	}
	if (expectation.tag !== undefined) assertTagMatchesVersion(expectation.tag, expected.version);
	const pending = parseChangeFragments(readChangeFragmentInputs(repositoryRoot));
	if (pending.length > 0) {
		throw new Error(
			`Prepared release still has pending fragments: ${pending.map((fragment) => fragment.path).join(', ')}`,
		);
	}
	const changelog = readChangelog(repositoryRoot);
	const consumed = consumedFragmentIds(changelog);
	if (consumed.size === 0) throw new Error('CHANGELOG.md has no consumed release fragments');
	const latest = latestChangelogVersion(changelog);
	if (latest !== expected.version) {
		throw new Error(`Latest CHANGELOG.md release is ${latest ?? '<missing>'}; expected ${expected.version}`);
	}
}
