import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

export const REPOSITORY_ID = 'github.com/mgkdante/yesid.dev-design' as const;
export const MANIFEST_SCHEMA = 2 as const;
export const PACKAGE_NAMES = ['tokens', 'motion', 'gates', 'ui'] as const;
export type PackageName = (typeof PACKAGE_NAMES)[number];

export const PACKAGE_EXCLUDE =
	/(^|\/)(__tests__\/|test-fixtures\/|scripts\/|research\/|vitest\.(?:config|setup)\.ts$|vitest\.d\.ts$|\.gitignore$)|\.test\.ts$/;
export const WORKTREE_EXCLUDE = /(^|\/)(node_modules|\.turbo)(\/|$)/;

const SHA1 = /^[0-9a-f]{40}$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;

export interface TagIdentity {
	name: string;
	object: string;
	peeledCommit: string;
}

export interface ReleaseAssetIdentity {
	name: string;
	size: number;
	digest: string;
}

export interface AdoptProvenance {
	mode: 'release' | 'archive' | 'worktree';
	tag: TagIdentity;
	asset: ReleaseAssetIdentity | null;
}

export interface AdoptManifest {
	schema: typeof MANIFEST_SCHEMA;
	repository: typeof REPOSITORY_ID;
	provenance: AdoptProvenance;
	packages: PackageName[];
	exclusionPolicyDigest: string;
	toolDigest: string;
	treeHash: string;
}

function normalizedRelative(root: string, path: string): string {
	return relative(root, path).split(sep).join('/');
}

export function walkFiles(root: string, out: string[] = []): string[] {
	for (const entry of readdirSync(root).sort()) {
		const path = join(root, entry);
		const stat = lstatSync(path);
		if (stat.isSymbolicLink()) throw new Error(`refusing symbolic link ${path}`);
		if (stat.isDirectory()) walkFiles(path, out);
		else if (stat.isFile()) out.push(path);
	}
	return out;
}

function digestFiles(root: string, files: readonly string[]): string {
	const hash = createHash('sha256');
	for (const path of files) {
		hash.update(normalizedRelative(root, path));
		hash.update('\0');
		hash.update(readFileSync(path));
		hash.update('\0');
	}
	return `sha256:${hash.digest('hex')}`;
}

export function treeHash(root: string): string {
	return digestFiles(
		root,
		walkFiles(root).filter((path) => normalizedRelative(root, path) !== 'manifest.json'),
	);
}

export function toolDigest(root: string): string {
	const files = walkFiles(join(root, 'tools')).filter((path) => {
		const rel = normalizedRelative(root, path);
		return rel === 'tools/adopt.ts' || rel.startsWith('tools/adopt/');
	});
	if (files.length === 0) throw new Error(`adopt tool bundle not found under ${root}`);
	return digestFiles(root, files);
}

export function exclusionPolicyDigest(): string {
	const canonical = JSON.stringify({
		package: { source: PACKAGE_EXCLUDE.source, flags: PACKAGE_EXCLUDE.flags },
		worktree: { source: WORKTREE_EXCLUDE.source, flags: WORKTREE_EXCLUDE.flags },
	});
	return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

export function assertTag(tag: string): void {
	if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(tag)) {
		throw new Error(`invalid tag "${tag}"; expected vX.Y.Z`);
	}
}

export function assertCommit(commit: string): void {
	if (!SHA1.test(commit)) {
		throw new Error(`invalid commit "${commit}"; expected a 40-character Git commit`);
	}
}

export function parsePackages(raw: string): PackageName[] {
	const requested = raw.split(',').map((name) => name.trim());
	if (requested.length === 0 || requested.some((name) => name.length === 0)) {
		throw new Error('--packages must contain at least one package');
	}
	if (new Set(requested).size !== requested.length) {
		throw new Error('--packages contains a duplicate package');
	}
	for (const name of requested) {
		if (!PACKAGE_NAMES.includes(name as PackageName)) {
			throw new Error(`unknown package "${name}"; choose from ${PACKAGE_NAMES.join(',')}`);
		}
	}
	return PACKAGE_NAMES.filter((name) => requested.includes(name));
}

function assertDigest(value: unknown, field: string): asserts value is string {
	if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(`invalid ${field}`);
}

export function parseManifest(value: unknown, path: string): AdoptManifest {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`invalid manifest at ${path}`);
	}
	const manifest = value as Partial<AdoptManifest>;
	const keys = Object.keys(manifest);
	const expectedKeys = [
		'schema',
		'repository',
		'provenance',
		'packages',
		'exclusionPolicyDigest',
		'toolDigest',
		'treeHash',
	];
	if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
		throw new Error(`manifest keys are not canonical at ${path}`);
	}
	if (manifest.schema !== MANIFEST_SCHEMA || manifest.repository !== REPOSITORY_ID) {
		throw new Error(`invalid manifest identity at ${path}`);
	}
	const provenance = manifest.provenance;
	if (!provenance || !['release', 'archive', 'worktree'].includes(provenance.mode)) {
		throw new Error(`invalid provenance at ${path}`);
	}
	assertTag(provenance.tag?.name ?? '');
	assertCommit(provenance.tag?.object ?? '');
	assertCommit(provenance.tag?.peeledCommit ?? '');
	if (provenance.mode === 'release') {
		if (!provenance.asset || typeof provenance.asset.name !== 'string') {
			throw new Error(`release manifest has no asset at ${path}`);
		}
		if (!Number.isSafeInteger(provenance.asset.size) || provenance.asset.size < 0) {
			throw new Error(`invalid release asset size at ${path}`);
		}
		assertDigest(provenance.asset.digest, `release asset digest in ${path}`);
	} else if (provenance.asset !== null) {
		throw new Error(`development provenance must not claim a Release asset at ${path}`);
	}
	if (!Array.isArray(manifest.packages)) throw new Error(`invalid package closure at ${path}`);
	const packages = parsePackages(manifest.packages.join(','));
	if (packages.join(',') !== manifest.packages.join(',')) {
		throw new Error(`manifest packages are not in canonical order at ${path}`);
	}
	assertDigest(manifest.exclusionPolicyDigest, `exclusionPolicyDigest in ${path}`);
	assertDigest(manifest.toolDigest, `toolDigest in ${path}`);
	assertDigest(manifest.treeHash, `treeHash in ${path}`);
	return manifest as AdoptManifest;
}

export function pathInside(parent: string, child: string): boolean {
	const rel = relative(parent, child);
	return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}
