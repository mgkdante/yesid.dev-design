import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type PackageManifest = {
	name?: unknown;
	private?: unknown;
	version?: unknown;
};

type ReleasedPackageName =
	| '@yesid/tokens'
	| '@yesid/motion'
	| '@yesid/gates'
	| '@yesid/ui';

const RELEASED_MANIFESTS: ReadonlySet<ReleasedPackageName> = new Set([
	'@yesid/tokens',
	'@yesid/motion',
	'@yesid/gates',
	'@yesid/ui',
]);

const ROOT_MANIFEST_URL = new URL('../../../package.json', import.meta.url);
const GALLERY_MANIFEST_URL = new URL('../package.json', import.meta.url);
const RELEASED_MANIFEST_URLS: Record<ReleasedPackageName, URL> = {
	'@yesid/tokens': new URL('../../../packages/tokens/package.json', import.meta.url),
	'@yesid/motion': new URL('../../../packages/motion/package.json', import.meta.url),
	'@yesid/gates': new URL('../../../packages/gates/package.json', import.meta.url),
	'@yesid/ui': new URL('../../../packages/ui/package.json', import.meta.url),
};

const CORE_IDENTIFIER = '(?:0|[1-9]\\d*)';
const PRERELEASE_IDENTIFIER =
	'(?:0|[1-9]\\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)';
const BUILD_IDENTIFIER = '[0-9A-Za-z-]+';
const STRICT_SEMVER = new RegExp(
	`^${CORE_IDENTIFIER}\\.${CORE_IDENTIFIER}\\.${CORE_IDENTIFIER}` +
		`(?:-${PRERELEASE_IDENTIFIER}(?:\\.${PRERELEASE_IDENTIFIER})*)?` +
		`(?:\\+${BUILD_IDENTIFIER}(?:\\.${BUILD_IDENTIFIER})*)?$`,
);

function readManifest(url: URL): PackageManifest {
	return JSON.parse(readFileSync(fileURLToPath(url), 'utf-8')) as PackageManifest;
}

function isStrictSemVer(value: unknown): value is string {
	return typeof value === 'string' && STRICT_SEMVER.test(value);
}

function isReleasedManifestName(value: unknown): value is ReleasedPackageName {
	return (
		typeof value === 'string' && [...RELEASED_MANIFESTS].some((name) => name === value)
	);
}

describe('strict SemVer 2.0.0 validator', () => {
	it.each([
		'0.0.0',
		'1.2.3',
		'10.20.30',
		'1.0.0-alpha',
		'1.0.0-alpha.1',
		'1.0.0-0.3.7',
		'1.0.0-x.7.z.92',
		'1.0.0-x-y-z.--',
		'1.0.0+001',
		'1.0.0+20130313144700',
		'1.0.0-beta+exp.sha.5114f85',
		'1.0.0-rc.1+build.1',
	])('accepts %s', (version) => {
		expect(isStrictSemVer(version)).toBe(true);
	});

	it.each([
		'01.0.0',
		'1.01.0',
		'1.0.01',
		'1.0.0-01',
		'1.0.0-alpha.01',
		'v1.0.0',
		' 1.0.0',
		'1.0.0 ',
		'1.0.0-',
		'1.0.0-alpha..1',
		'1.0.0+',
		'1.0.0+build..1',
		'',
		'1',
		'1.2',
		'1.2.3.4',
		'1.0.0-alpha_beta',
		'1.0.0+build?',
	])('rejects %s', (version) => {
		expect(isStrictSemVer(version)).toBe(false);
	});
});

describe('prospective package release contract', () => {
	const rootManifest = readManifest(ROOT_MANIFEST_URL);

	it('defines a strict SemVer canonical version in the root manifest', () => {
		expect(
			isStrictSemVer(rootManifest.version),
			`root package.json must define a strict SemVer canonical version; received ${String(rootManifest.version)}`,
		).toBe(true);
	});

	it.each([...RELEASED_MANIFESTS])('%s matches the root canonical version', (packageName) => {
		const manifest = readManifest(RELEASED_MANIFEST_URLS[packageName]);

		expect(
			manifest.version,
			`${packageName} must match root canonical version ${String(rootManifest.version)}`,
		).toBe(rootManifest.version);
	});

	it('keeps the gallery private and outside the released manifest set', () => {
		const galleryManifest = readManifest(GALLERY_MANIFEST_URL);

		expect(galleryManifest.private).toBe(true);
		expect(isReleasedManifestName(galleryManifest.name)).toBe(false);
	});
});
