import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type ConditionalExport = Record<string, string>;
type PackageExport = string | ConditionalExport;

type PackageManifest = {
	name?: unknown;
	private?: unknown;
	version?: unknown;
	sideEffects?: unknown;
	svelte?: unknown;
	exports?: Record<string, PackageExport>;
	scripts?: Record<string, string>;
};

const ROOT_MANIFEST_URL = new URL('../../../package.json', import.meta.url);
const REPOSITORY_PATH = fileURLToPath(new URL('../../../', import.meta.url));
const GALLERY_MANIFEST_URL = new URL('../../../apps/gallery/package.json', import.meta.url);
const PACKAGES_URL = new URL('../../../packages/', import.meta.url);
const PACKAGE_MANIFESTS = readdirSync(PACKAGES_URL, { withFileTypes: true })
	.filter((entry) => entry.isDirectory() && existsSync(new URL(`${entry.name}/package.json`, PACKAGES_URL)))
	.map((entry) => {
		const url = new URL(`${entry.name}/package.json`, PACKAGES_URL);
		const { name } = readManifest(url);
		if (typeof name !== 'string') throw new Error(`${entry.name}/package.json has no name`);
		return [name, url] as const;
	});

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

function readExports(manifest: PackageManifest): Record<string, PackageExport> {
	return manifest.exports ?? {};
}

function exportTargets(value: PackageExport | undefined): string[] {
	if (typeof value === 'string') return [value];
	if (value && typeof value === 'object') return Object.values(value);
	return [];
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

	it.each(PACKAGE_MANIFESTS)('%s matches the root canonical version', (_name, url) => {
		expect(readManifest(url).version).toBe(rootManifest.version);
	});

	it('keeps the gallery private and outside the released manifest set', () => {
		const galleryManifest = readManifest(GALLERY_MANIFEST_URL);

		expect(galleryManifest.private).toBe(true);
		expect(PACKAGE_MANIFESTS.map(([name]) => name)).not.toContain(galleryManifest.name);
	});
});

describe('browser authority script contract', () => {
	it(
		'discovers every browser spec through the root command',
		() => {
			const result = spawnSync('bun', ['run', 'test:browser:list'], {
				cwd: REPOSITORY_PATH,
				encoding: 'utf8',
				timeout: 10_000,
			});
			const output = `${result.stdout}\n${result.stderr}`;
			const specs = readdirSync(join(REPOSITORY_PATH, 'apps/gallery/tests/browser')).filter((file) =>
				file.endsWith('.spec.ts'),
			);
			const listed = new Set(
				[...output.matchAll(/\[([\w-]+)\] › ([\w.-]+\.spec\.ts):/g)].map(([, project, spec]) => `${project} ${spec}`),
			);

			expect(result.status, output).toBe(0);
			// Every spec runs on both the desktop and the mobile project.
			for (const project of ['chromium-noble-desktop', 'chromium-noble-mobile']) {
				for (const spec of specs) expect(listed, output).toContain(`${project} ${spec}`);
			}
			expect(output).not.toContain('vite v');
			expect(output).not.toContain('Wrote site to "build"');
		},
		10_000,
	);
});

describe('conditioned package export contract', () => {
	const manifests = Object.fromEntries(PACKAGE_MANIFESTS.map(([name, url]) => [name, readManifest(url)]));

	it.each(['@yesid/tokens', '@yesid/motion', '@yesid/gates', '@yesid/ui'] as const)('%s retains explicitly imported CSS', (packageName) => {
		expect(manifests[packageName].sideEffects).toEqual(['**/*.css']);
	});

	it.each(['@yesid/analytics', '@yesid/seo-kit', '@yesid/i18n-core'] as const)('%s remains side-effect free', (packageName) => {
		expect(manifests[packageName].sideEffects).toBe(false);
	});

	it.each(PACKAGE_MANIFESTS)(
		'%s export targets are package-local existing relative paths',
		(packageName, manifestUrl) => {
			const packageUrl = new URL('.', manifestUrl);
			const packagePath = fileURLToPath(packageUrl);

			for (const [key, value] of Object.entries(readExports(manifests[packageName]))) {
				for (const target of exportTargets(value)) {
					expect.soft(target, `${key} target`).toMatch(/^\.\//);
					const targetPath = fileURLToPath(new URL(target, packageUrl));
					const packageRelativePath = relative(packagePath, targetPath);
					expect.soft(
						packageRelativePath.startsWith('..') || isAbsolute(packageRelativePath),
						`${key} must stay inside ${packageName}`,
					).toBe(false);
					expect.soft(existsSync(targetPath), `${key} target ${target} must exist`).toBe(true);
				}
			}
		},
	);
});
