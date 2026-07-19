import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
	authorizeApiChanges,
	checkApiReports,
	collectDirectAssetTargets,
	createApiReport,
	createApiReports,
	parseChangeFragment,
	planDeclarationNamespaces,
	validatePublicSymbols,
	writeApiReports,
	type PublicSymbol,
} from '../../../tools/api-authority.js';

const REPOSITORY_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const scratch: string[] = [];

afterEach(() => {
	for (const directory of scratch.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const BASE_REPORTS = {
	'@yesid/tokens': 'tokens-v1',
	'@yesid/motion': 'motion-v1',
	'@yesid/gates': 'gates-v1',
	'@yesid/ui': 'ui-v1',
} as const;

function fragment(packages: Readonly<Record<string, 'patch' | 'minor' | 'major'>>) {
	const declarations = Object.entries(packages).map(
		([name, bump]) => `${JSON.stringify(name)}: ${bump}`,
	);
	return `---\n${declarations.join('\n')}\n---\n\nExplain the public contract change.\n`;
}

function createPackageScratch(directory: 'tokens' | 'ui'): string {
	const root = mkdtempSync(join(tmpdir(), `yesid-${directory}-mutation-`));
	scratch.push(root);
	mkdirSync(join(root, 'packages'), { recursive: true });
	cpSync(join(REPOSITORY_ROOT, 'packages', directory), join(root, 'packages', directory), {
		recursive: true,
	});
	symlinkSync(join(REPOSITORY_ROOT, 'node_modules'), join(root, 'node_modules'), 'junction');
	return root;
}

function replaceInFile(path: string, before: string, after: string): void {
	const source = readFileSync(path, 'utf8');
	if (!source.includes(before)) throw new Error(`${path} does not contain mutation target`);
	writeFileSync(path, source.replace(before, after));
}

describe('API report approval', () => {
	it('requires a newly added release fragment for every changed package report', () => {
		expect(() =>
			authorizeApiChanges({
				baseReports: BASE_REPORTS,
				currentReports: { ...BASE_REPORTS, '@yesid/ui': 'ui-v2' },
				baseFragments: {},
				currentFragments: {},
			}),
		).toThrow('API report changes require a new release fragment for: @yesid/ui');

		expect(
			authorizeApiChanges({
				baseReports: BASE_REPORTS,
				currentReports: {
					...BASE_REPORTS,
					'@yesid/motion': 'motion-v2',
					'@yesid/ui': 'ui-v2',
				},
				baseFragments: {},
				currentFragments: {
					'.changes/public-motion-and-ui.md': fragment({
						'@yesid/motion': 'patch',
						'@yesid/ui': 'minor',
					}),
				},
			}),
		).toEqual({
			changedPackages: ['@yesid/motion', '@yesid/ui'],
			newFragments: ['.changes/public-motion-and-ui.md'],
		});
	});

	it('does not let an existing fragment authorize a later API change', () => {
		const existing = fragment({ '@yesid/ui': 'minor' });
		expect(() =>
			authorizeApiChanges({
				baseReports: BASE_REPORTS,
				currentReports: { ...BASE_REPORTS, '@yesid/ui': 'ui-v2' },
				baseFragments: { '.changes/old-ui.md': existing },
				currentFragments: { '.changes/old-ui.md': existing },
			}),
		).toThrow('API report changes require a new release fragment for: @yesid/ui');
	});

	it('does not let a fragment for another package authorize the changed report', () => {
		expect(() =>
			authorizeApiChanges({
				baseReports: BASE_REPORTS,
				currentReports: { ...BASE_REPORTS, '@yesid/ui': 'ui-v2' },
				baseFragments: {},
				currentFragments: {
					'.changes/wrong-package.md': fragment({ '@yesid/motion': 'patch' }),
				},
			}),
		).toThrow('API report changes require a new release fragment for: @yesid/ui');
	});

	it('treats first report creation as the one-time approved baseline', () => {
		expect(
			authorizeApiChanges({
				baseReports: {},
				currentReports: BASE_REPORTS,
				baseFragments: {},
				currentFragments: {},
			}),
		).toEqual({ changedPackages: [], newFragments: [] });
	});
});

describe('release fragment parser', () => {
	it('rejects malformed, unknown, and empty fragments', () => {
		expect(() => parseChangeFragment('missing front matter', '.changes/bad.md')).toThrow(
			'.changes/bad.md must start with release fragment front matter',
		);
		expect(() =>
			parseChangeFragment(
				'---\n"@yesid/unknown": patch\n---\n\nDescription.\n',
				'.changes/unknown.md',
			),
		).toThrow('.changes/unknown.md names unknown released package @yesid/unknown');
		expect(() =>
			parseChangeFragment('---\n"@yesid/ui": fix\n---\n\nDescription.\n', '.changes/bump.md'),
		).toThrow('.changes/bump.md has invalid bump fix for @yesid/ui');
		expect(() =>
			parseChangeFragment('---\n"@yesid/ui": patch\n---\n\n  \n', '.changes/empty.md'),
		).toThrow('.changes/empty.md must contain a non-empty change description');
	});
});

describe('public symbol safety', () => {
	const base: PublicSymbol = {
		packageName: '@yesid/motion',
		subpath: './utils/ticker',
		name: 'subscribe',
		releaseTag: undefined,
	};

	it.each([
		[{ ...base, name: '_resetForTests' }, '_resetForTests uses a test/internal public name'],
		[{ ...base, name: 'resetForTests' }, 'resetForTests uses a test/internal public name'],
		[{ ...base, name: 'testHelper' }, 'testHelper uses a test/internal public name'],
		[{ ...base, name: 'internalHelper' }, 'internalHelper uses a test/internal public name'],
		[{ ...base, name: 'buildTestOnly' }, 'buildTestOnly uses a test/internal public name'],
		[{ ...base, name: 'subscribe', releaseTag: 'internal' }, 'subscribe is marked @internal'],
	] as const)('rejects unsafe symbol %#', (symbol, expected) => {
		expect(() => validatePublicSymbols([symbol])).toThrow(expected);
	});

	it('accepts ordinary public values and types', () => {
		expect(() => validatePublicSymbols([base, { ...base, name: 'TickerCallback' }])).not.toThrow();
	});

	it('keeps test reset seams out of the public motion ticker module', async () => {
		const ticker = await import('@yesid/motion/utils/ticker');
		expect(Object.keys(ticker)).toEqual(['subscribe', 'unsubscribe']);
	});
});

describe('deterministic package API reports', () => {
	it('fails closed when distinct targets collapse to one declaration namespace', () => {
		expect(() => planDeclarationNamespaces(['./src/a-b.ts', './src/a/b.ts'])).toThrow(
			'Declaration namespace collision AB: ./src/a-b.ts, ./src/a/b.ts',
		);
	});

	it('retains every distinct direct asset target and its ordered conditions', () => {
		expect(
			collectDirectAssetTargets({
				'./theme.css': {
					browser: './theme-browser.css',
					default: './theme.css',
					fallback: './theme.css',
				},
				'./tokens.json': './tokens.json',
			}),
		).toEqual([
			{
				subpath: './theme.css',
				target: './theme-browser.css',
				conditions: ['browser'],
			},
			{
				subpath: './theme.css',
				target: './theme.css',
				conditions: ['default', 'fallback'],
			},
			{ subpath: './tokens.json', target: './tokens.json', conditions: ['default'] },
		]);
	});

	it('renders every conditioned surface, declaration, and direct public asset', async () => {
		const first = await createApiReports(REPOSITORY_ROOT);

		expect(Object.keys(first)).toEqual([
			'@yesid/tokens',
			'@yesid/motion',
			'@yesid/gates',
			'@yesid/ui',
		]);
		for (const report of Object.values(first)) {
			expect(report).toMatch(/^<!-- GENERATED: bun run api:report/u);
			expect(report).not.toContain(REPOSITORY_ROOT);
			expect(report).not.toContain('\r\n');
		}

		expect(first['@yesid/tokens']).toContain(
			'`./tokens.json` — direct asset `./tokens.json` (`default`), sha256 `',
		);
		expect(first['@yesid/tokens']).toContain('function parseTokens');
		expect(first['@yesid/motion']).toContain('function subscribe');
		expect(first['@yesid/motion']).not.toContain('_resetForTests');
		expect(first['@yesid/gates']).toContain('function runContrastPairs');
		expect(first['@yesid/ui']).toContain('type ButtonProps');
		expect(first['@yesid/ui']).toContain('function configureUi');
		expect(first['@yesid/ui']).toContain('import { Component } from \'svelte\';');
		expect(first['@yesid/ui']).toContain('const Button: Component<ButtonProps, {}, "ref">;');
		expect(first['@yesid/ui']).not.toContain('SvelteComponentTyped');
		expect(first['@yesid/ui']).not.toContain('__propDef');
		expect(readFileSync(join(REPOSITORY_ROOT, 'api-reports/ui.api.md'), 'utf8')).toBe(
			first['@yesid/ui'],
		);
	}, 30_000);

	it('detects TypeScript signatures, export shape, and direct asset byte mutations', async () => {
		const baseline = await createApiReport(REPOSITORY_ROOT, '@yesid/tokens');

		const signatureRoot = createPackageScratch('tokens');
		replaceInFile(
			join(signatureRoot, 'packages/tokens/src/serialize.ts'),
			'export function serializeCss(token: Token): string {',
			'export function serializeCss(token: Token, compact?: boolean): string {',
		);
		const signatureReport = await createApiReport(signatureRoot, '@yesid/tokens');
		expect(signatureReport).not.toBe(baseline);
		expect(signatureReport).toContain('compact?: boolean');

		const conditionRoot = createPackageScratch('tokens');
		const conditionManifestPath = join(conditionRoot, 'packages/tokens/package.json');
		const conditionManifest = JSON.parse(readFileSync(conditionManifestPath, 'utf8')) as {
			exports: Record<string, string | Record<string, string>>;
		};
		conditionManifest.exports['./serialize'] = {
			default: './src/types.ts',
			types: './src/serialize.ts',
		};
		writeFileSync(conditionManifestPath, `${JSON.stringify(conditionManifest, null, 2)}\n`);
		const conditionReport = await createApiReport(conditionRoot, '@yesid/tokens');
		expect(conditionReport).not.toBe(baseline);
		expect(conditionReport).toContain(
			'### `./serialize`\n\n- `default` → `./src/types.ts`\n- `types` → `./src/serialize.ts`',
		);

		const removalRoot = createPackageScratch('tokens');
		const removalManifestPath = join(removalRoot, 'packages/tokens/package.json');
		const removalManifest = JSON.parse(readFileSync(removalManifestPath, 'utf8')) as {
			exports: Record<string, unknown>;
		};
		delete removalManifest.exports['./serialize'];
		writeFileSync(removalManifestPath, `${JSON.stringify(removalManifest, null, 2)}\n`);
		const removalReport = await createApiReport(removalRoot, '@yesid/tokens');
		expect(removalReport).not.toBe(baseline);
		expect(removalReport).not.toContain('### `./serialize`');

		const assetRoot = createPackageScratch('tokens');
		const assetPath = join(assetRoot, 'packages/tokens/tokens.css');
		writeFileSync(assetPath, `${readFileSync(assetPath, 'utf8')}\n/* authority mutation */\n`);
		const assetReport = await createApiReport(assetRoot, '@yesid/tokens');
		expect(assetReport).not.toBe(baseline);
		expect(assetReport.match(/- `\.\/tokens\.css`[^\n]+/u)?.[0]).not.toBe(
			baseline.match(/- `\.\/tokens\.css`[^\n]+/u)?.[0],
		);
	}, 60_000);

	it('detects Svelte prop and binding metadata mutations', async () => {
		const baseline = await createApiReport(REPOSITORY_ROOT, '@yesid/ui');
		const root = createPackageScratch('ui');
		const buttonPath = join(root, 'packages/ui/src/primitives/button/button.svelte');
		replaceInFile(
			buttonPath,
			'\t\tsize?: ButtonSize;\n\t};',
			'\t\tsize?: ButtonSize;\n\t\tauthorityProbe?: boolean;\n\t};',
		);
		replaceInFile(buttonPath, 'ref = $bindable(null),', 'ref = null,');

		const mutated = await createApiReport(root, '@yesid/ui');
		expect(mutated).not.toBe(baseline);
		expect(mutated).toContain('authorityProbe?: boolean');
		expect(baseline).toContain('const Button: Component<ButtonProps, {}, "ref">;');
		expect(mutated).not.toContain('const Button: Component<ButtonProps, {}, "ref">;');
	}, 60_000);

	it('writes exact report paths and fails closed on stale committed bytes', () => {
		const root = mkdtempSync(join(tmpdir(), 'yesid-api-report-test-'));
		scratch.push(root);
		writeApiReports(root, BASE_REPORTS);

		expect(readFileSync(join(root, 'api-reports', 'tokens.api.md'), 'utf8')).toBe('tokens-v1');
		expect(readFileSync(join(root, 'api-reports', 'motion.api.md'), 'utf8')).toBe('motion-v1');
		expect(readFileSync(join(root, 'api-reports', 'gates.api.md'), 'utf8')).toBe('gates-v1');
		expect(readFileSync(join(root, 'api-reports', 'ui.api.md'), 'utf8')).toBe('ui-v1');
		expect(() => checkApiReports(root, BASE_REPORTS)).not.toThrow();

		writeFileSync(join(root, 'api-reports', 'ui.api.md'), 'stale-ui');
		expect(() => checkApiReports(root, BASE_REPORTS)).toThrow(
			'API reports are stale: api-reports/ui.api.md. Run bun run api:report.',
		);
	});

	it('wires report, freshness, and approval commands into repository authority', () => {
		const manifest = JSON.parse(readFileSync(join(REPOSITORY_ROOT, 'package.json'), 'utf8')) as {
			scripts: Record<string, string>;
		};
		expect(manifest.scripts['api:report']).toBe('bun tools/api-authority.ts report');
		expect(manifest.scripts['api:check']).toBe('bun tools/api-authority.ts check');
		expect(manifest.scripts['api:approve']).toBe('bun tools/api-authority.ts approve');
		expect(manifest.scripts.check).toContain('bun run api:check');

		const workflow = readFileSync(join(REPOSITORY_ROOT, '.github/workflows/ci.yml'), 'utf8');
		expect(workflow).toContain('name: API report approval');
		expect(workflow).toContain('bun run api:approve -- --base "$API_BASE_SHA"');
		const windowsJob = workflow.match(
			/^  token-outputs-windows:\n([\s\S]+?)^  token-byte-parity:/mu,
		)?.[1];
		expect(windowsJob).toContain('bun run api:check');

		const contributing = readFileSync(join(REPOSITORY_ROOT, 'CONTRIBUTING.md'), 'utf8');
		expect(contributing).toContain('## Public API changes');
		expect(contributing).toContain('bun run api:report');
		expect(contributing).toContain('.changes/<slug>.md');
		expect(contributing).toContain('## Escaped consumer defects');
		expect(contributing).toContain('neutral upstream regression');
		expect(contributing).toContain('Consumer-named permanent fixtures are rejected');
	});
});
