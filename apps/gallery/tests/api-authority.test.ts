import { describe, expect, it } from 'vitest';
import {
	authorizeApiChanges,
	createApiReports,
	parseChangeFragment,
	validatePublicSymbols,
	type PublicSymbol,
} from '../../../tools/api-authority.js';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

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

		expect(first['@yesid/tokens']).toContain('`./tokens.json` — direct asset, sha256 `');
		expect(first['@yesid/tokens']).toContain('function parseTokens');
		expect(first['@yesid/motion']).toContain('function subscribe');
		expect(first['@yesid/motion']).not.toContain('_resetForTests');
		expect(first['@yesid/gates']).toContain('function runContrastPairs');
		expect(first['@yesid/ui']).toContain('type ButtonProps');
		expect(first['@yesid/ui']).toContain('function configureUi');
	}, 30_000);
});
