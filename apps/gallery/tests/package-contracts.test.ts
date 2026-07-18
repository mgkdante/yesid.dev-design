import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative } from 'node:path';
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

const EXISTING_UI_EXPORTS = {
	'.': './src/index.ts',
	'./brand': './src/brand/index.ts',
	'./cn': './src/cn/index.ts',
	'./badge': './src/primitives/badge/index.ts',
	'./button': './src/primitives/button/index.ts',
	'./card': './src/primitives/card/index.ts',
	'./collapsible': './src/primitives/collapsible/index.ts',
	'./combobox': './src/primitives/combobox/index.ts',
	'./resizable': './src/primitives/resizable/index.ts',
	'./scroll-area': './src/primitives/scroll-area/index.ts',
	'./separator': './src/primitives/separator/index.ts',
	'./sheet': './src/primitives/sheet/index.ts',
	'./skeleton': './src/primitives/skeleton/index.ts',
	'./tabs': './src/primitives/tabs/index.ts',
	'./toggle': './src/primitives/toggle/index.ts',
	'./toggle-group': './src/primitives/toggle-group/index.ts',
} as const;

const EXISTING_MOTION_EXPORTS = {
	'.': './src/index.ts',
	'./actions': './src/actions/index.ts',
	'./policy': './src/policy.ts',
	'./tokens': './src/tokens.ts',
	'./stores/reducedMotion': './src/stores/reducedMotion.ts',
	'./utils/device': './src/utils/device.ts',
	'./utils/gsap': './src/utils/gsap.ts',
	'./utils/lenis': './src/utils/lenis.ts',
	'./utils/sectionMagnet': './src/utils/sectionMagnet.ts',
	'./utils/ticker': './src/utils/ticker.ts',
} as const;

const GATES_EXPORTS = {
	'.': './src/index.ts',
} as const;

const TOKEN_DIRECT_EXPORTS = {
	'./tokens.json': './tokens.json',
	'./tokens.css': './tokens.css',
} as const;

const TOKEN_TYPESCRIPT_EXPORTS = {
	'./parse': './src/parse.ts',
	'./serialize': './src/serialize.ts',
	'./types': './src/types.ts',
	'./generators/tokens-css': './src/generators/tokens-css.ts',
	'./generators/theme-block': './src/generators/theme-block.ts',
	'./generators/motion-ts': './src/generators/motion-ts.ts',
	'./generators/design-md': './src/generators/design-md.ts',
	'./src/parse.ts': './src/parse.ts',
	'./src/generators/tokens-css.ts': './src/generators/tokens-css.ts',
	'./src/generators/theme-block.ts': './src/generators/theme-block.ts',
	'./src/generators/motion-ts.ts': './src/generators/motion-ts.ts',
} as const;

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

function readExports(manifest: PackageManifest): Record<string, PackageExport> {
	return manifest.exports ?? {};
}

function exportTargets(value: PackageExport | undefined): string[] {
	if (typeof value === 'string') return [value];
	if (value && typeof value === 'object') return Object.values(value);
	return [];
}

function expectPreservedTargets(
	manifest: PackageManifest,
	expected: Readonly<Record<string, string>>,
): void {
	const exports = readExports(manifest);
	for (const [key, target] of Object.entries(expected)) {
		expect.soft(new Set(exportTargets(exports[key])), key).toEqual(new Set([target]));
	}
}

function expectConditionalExports(
	manifest: PackageManifest,
	expected: Readonly<Record<string, string>>,
	conditions: readonly string[],
): void {
	const exports = readExports(manifest);
	for (const [key, target] of Object.entries(expected)) {
		const value = exports[key];
		expect.soft(value, `${key} must be a conditional export`).toBeTypeOf('object');
		if (!value || typeof value !== 'object') continue;

		expect.soft(Object.keys(value), `${key} condition order`).toEqual(conditions);
		for (const condition of conditions) {
			expect.soft(value[condition], `${key} ${condition} target`).toBe(target);
		}
	}
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

describe('conditioned package export contract', () => {
	const manifests = Object.fromEntries(
		[...RELEASED_MANIFESTS].map((packageName) => [
			packageName,
			readManifest(RELEASED_MANIFEST_URLS[packageName]),
		]),
	) as Record<ReleasedPackageName, PackageManifest>;

	it.each([...RELEASED_MANIFESTS])('%s retains explicitly imported CSS', (packageName) => {
		expect(manifests[packageName].sideEffects).toEqual(['**/*.css']);
	});

	it('preserves every existing UI and motion export target', () => {
		expectPreservedTargets(manifests['@yesid/ui'], EXISTING_UI_EXPORTS);
		expectPreservedTargets(manifests['@yesid/motion'], EXISTING_MOTION_EXPORTS);
	});

	it('exposes only the approved package keys', () => {
		expect(new Set(Object.keys(readExports(manifests['@yesid/ui'])))).toEqual(new Set([
			...Object.keys(EXISTING_UI_EXPORTS),
		]));
		expect(new Set(Object.keys(readExports(manifests['@yesid/motion'])))).toEqual(new Set([
			...Object.keys(EXISTING_MOTION_EXPORTS),
			'./tap-feedback.css',
		]));
		expect(new Set(Object.keys(readExports(manifests['@yesid/gates'])))).toEqual(new Set([
			...Object.keys(GATES_EXPORTS),
		]));
		expect(new Set(Object.keys(readExports(manifests['@yesid/tokens'])))).toEqual(new Set([
			...Object.keys(TOKEN_DIRECT_EXPORTS),
			...Object.keys(TOKEN_TYPESCRIPT_EXPORTS),
		]));
	});

	it('keeps repository-coupled token internals private', () => {
		const exports = readExports(manifests['@yesid/tokens']);
		for (const forbiddenKey of [
			'.',
			'./build',
			'./build.ts',
			'./scripts/*',
			'./research/*',
		]) {
			expect(exports[forbiddenKey], forbiddenKey).toBeUndefined();
		}
	});

	it('uses Svelte-aware UI conditions and keeps the legacy top-level Svelte entry', () => {
		const { './cn': cn, ...svelteExports } = EXISTING_UI_EXPORTS;
		expect.soft(manifests['@yesid/ui'].svelte).toBe('./src/index.ts');
		expectConditionalExports(
			manifests['@yesid/ui'],
			svelteExports,
			['types', 'svelte', 'default'],
		);
		expectConditionalExports(manifests['@yesid/ui'], { './cn': cn }, ['types', 'default']);
	});

	it('uses ordered TypeScript conditions for motion and gates', () => {
		expectConditionalExports(
			manifests['@yesid/motion'],
			EXISTING_MOTION_EXPORTS,
			['types', 'default'],
		);
		expectConditionalExports(
			manifests['@yesid/gates'],
			GATES_EXPORTS,
			['types', 'default'],
		);
	});

	it('uses ordered TypeScript conditions for clean and Transit-compatible token entries', () => {
		expectConditionalExports(
			manifests['@yesid/tokens'],
			TOKEN_TYPESCRIPT_EXPORTS,
			['types', 'default'],
		);
	});

	it.each(Object.entries(TOKEN_DIRECT_EXPORTS))(
		'@yesid/tokens exposes package-owned asset at %s',
		(key, expectedTarget) => {
			expect(readExports(manifests['@yesid/tokens'])[key]).toBe(expectedTarget);
		},
	);

	it.each([
		['@yesid/motion', './tap-feedback.css', './tap-feedback.css'],
		['@yesid/tokens', './tokens.css', './tokens.css'],
	] as const)('%s exposes package-owned CSS at %s', (packageName, key, expectedTarget) => {
		const manifestUrl = RELEASED_MANIFEST_URLS[packageName];
		const target = readExports(manifests[packageName])[key];
		expect(target).toBe(expectedTarget);
		expect(existsSync(fileURLToPath(new URL(expectedTarget, new URL('.', manifestUrl))))).toBe(
			true,
		);
	});

	it.each([...RELEASED_MANIFESTS])(
		'%s export targets are package-local existing relative paths',
		(packageName) => {
			const manifestUrl = RELEASED_MANIFEST_URLS[packageName];
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
