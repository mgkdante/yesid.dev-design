import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

type MatchRules = { paths: string[]; prefixes: string[] };
type Rules = {
	schema: 1;
	always: MatchRules;
	jobs: Record<string, MatchRules>;
	ignore: Record<'docs-only' | 'irrelevant', MatchRules>;
};
type Classification = {
	schema: 1;
	source: {
		repository: string;
		event: string;
		baseSha: string;
		headSha: string;
		runId: string;
		runAttempt: number;
		rerun: boolean;
	};
	files: { complete: true; count: number; digest: string };
	rulesDigest: string;
	relevant: Record<string, boolean>;
	reason: string;
};
type ClassifierInput = {
	repository: string;
	event: string;
	baseSha: string;
	headSha: string;
	runId: string;
	runAttempt: number;
	complete: boolean;
	paths: string[];
	rules: Rules;
};
type RuntimeBinding = Omit<ClassifierInput, 'complete' | 'paths' | 'rules'>;
type PullRequestEvent = {
	number: number;
	base: { sha: string };
	head: { sha: string };
};
type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
type ClassifierModule = {
	classifyPaths(input: ClassifierInput): Classification;
	collectPullRequestPaths(input: {
		repository: string;
		event: PullRequestEvent;
		token: string;
		apiUrl?: string;
		fetchImpl?: FetchLike;
	}): Promise<string[]>;
	runAction(
		environment?: Record<string, string | undefined>,
		fetchImpl?: FetchLike,
	): Promise<Classification>;
};
type Need = { result: string; outputs: Record<string, string> };
type ReporterModule = {
	evaluateRequiredContext(input: {
		needs: Record<string, Need>;
		classifierJob?: string;
		runtime: RuntimeBinding;
		}): { schema: 1; relevant: number; skipped: number; rerun: boolean };
	runRequiredContext(environment?: Record<string, string | undefined>): {
		schema: 1;
		relevant: number;
		skipped: number;
		rerun: boolean;
	};
};

const BASE_SHA = '1'.repeat(40);
const HEAD_SHA = '2'.repeat(40);
const RUNTIME: RuntimeBinding = {
	repository: 'example/project',
	event: 'pull_request',
	baseSha: BASE_SHA,
	headSha: HEAD_SHA,
	runId: '123456789',
	runAttempt: 1,
};
const RULES: Rules = {
	schema: 1,
	always: { paths: [], prefixes: ['.github/workflows/'] },
	jobs: {
		'app-a': {
			paths: ['package.json'],
			prefixes: ['apps/alpha/', 'packages/shared/'],
		},
		'app-b': {
			paths: ['bun.lock'],
			prefixes: ['apps/beta/', 'packages/shared/'],
		},
	},
	ignore: {
		'docs-only': { paths: ['README.md'], prefixes: ['docs/'] },
		irrelevant: { paths: [], prefixes: ['.vscode/'] },
	},
};

const CLASSIFIER_URL = new URL(
	'../../../.github/actions/classify-paths/main.mjs',
	import.meta.url,
);
const REPORTER_URL = new URL(
	'../../../.github/actions/required-context/main.mjs',
	import.meta.url,
);
const CLASSIFIER_ACTION_URL = new URL(
	'../../../.github/actions/classify-paths/action.yml',
	import.meta.url,
);
const REPORTER_ACTION_URL = new URL(
	'../../../.github/actions/required-context/action.yml',
	import.meta.url,
);
const ATTRIBUTES_URL = new URL('../../../.gitattributes', import.meta.url);
const CI_WORKFLOW_URL = new URL('../../../.github/workflows/ci.yml', import.meta.url);
const scratch: string[] = [];

function tempDirectory(): string {
	const path = mkdtempSync(join(tmpdir(), 'yesid-ci-contract-'));
	scratch.push(path);
	return path;
}

afterEach(() => {
	for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});

async function modules(): Promise<{
	classifier: ClassifierModule;
	reporter: ReporterModule;
}> {
	const [classifier, reporter] = await Promise.all([
		import(CLASSIFIER_URL.href) as Promise<ClassifierModule>,
		import(REPORTER_URL.href) as Promise<ReporterModule>,
	]);
	return { classifier, reporter };
}

function classify(
	classifier: ClassifierModule,
	paths: string[],
	overrides: Partial<ClassifierInput> = {},
): Classification {
	return classifier.classifyPaths({
		...RUNTIME,
		complete: true,
		paths,
		rules: RULES,
		...overrides,
	});
}

function needs(
	classification: Classification,
	results: Record<string, string>,
	classifierResult = 'success',
): Record<string, Need> {
	return {
		classify: {
			result: classifierResult,
			outputs: { classification: JSON.stringify(classification) },
		},
		...Object.fromEntries(
			Object.entries(results).map(([name, result]) => [name, { result, outputs: {} }]),
		),
	};
}

function json(value: unknown, status = 200): Response {
	return new Response(JSON.stringify(value), {
		status,
		headers: { 'content-type': 'application/json' },
	});
}

describe('shared path classifier', () => {
	it('covers docs-only, package-only, multi-app, workflow-only, irrelevant, and empty diffs', async () => {
		const { classifier } = await modules();
		const fixtures = [
			{
				paths: ['docs/architecture.md'],
				reason: 'docs-only',
				relevant: { 'app-a': false, 'app-b': false },
			},
			{
				paths: ['packages/shared/src/index.ts'],
				reason: 'matched',
				relevant: { 'app-a': true, 'app-b': true },
			},
			{
				paths: ['apps/beta/src/b.ts', 'apps/alpha/src/a.ts'],
				reason: 'matched',
				relevant: { 'app-a': true, 'app-b': true },
			},
			{
				paths: ['.github/workflows/ci.yml'],
				reason: 'control',
				relevant: { 'app-a': true, 'app-b': true },
			},
			{
				paths: ['.vscode/settings.json'],
				reason: 'irrelevant',
				relevant: { 'app-a': false, 'app-b': false },
			},
			{
				paths: [],
				reason: 'empty',
				relevant: { 'app-a': false, 'app-b': false },
			},
		] as const;

		for (const fixture of fixtures) {
			const receipt = classify(classifier, [...fixture.paths]);
			expect(receipt).toMatchObject({
				schema: 1,
				source: { ...RUNTIME, rerun: false },
				files: { complete: true, count: fixture.paths.length },
				relevant: fixture.relevant,
				reason: fixture.reason,
			});
			expect(receipt.files.digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
			expect(receipt.rulesDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
		}
	});

	it('runs every job for unknown paths and every non-PR event', async () => {
		const { classifier } = await modules();
		expect(classify(classifier, ['new-domain/file.ts'])).toMatchObject({
			reason: 'safe-full',
			relevant: { 'app-a': true, 'app-b': true },
		});
		expect(
			classify(classifier, [], {
				event: 'workflow_dispatch',
				baseSha: HEAD_SHA,
			}),
		).toMatchObject({
			reason: 'force-full',
			relevant: { 'app-a': true, 'app-b': true },
		});
	});

	it('is order-independent and marks a current-attempt rerun without borrowing old evidence', async () => {
		const { classifier } = await modules();
		const first = classify(classifier, ['apps/beta/b.ts', 'apps/alpha/a.ts']);
		const reversed = classify(classifier, ['apps/alpha/a.ts', 'apps/beta/b.ts']);
		expect(reversed).toEqual(first);

		const rerun = classify(classifier, ['apps/alpha/a.ts'], { runAttempt: 2 });
		expect(rerun.source).toMatchObject({ runAttempt: 2, rerun: true });
		expect(rerun.files.digest).toBe(classify(classifier, ['apps/alpha/a.ts']).files.digest);
		expect(rerun.rulesDigest).toBe(first.rulesDigest);
	});

	it('rejects incomplete, duplicate, unsafe, and malformed evidence', async () => {
		const { classifier } = await modules();
		expect(() => classify(classifier, [], { complete: false })).toThrow(/complete/iu);
		expect(() => classify(classifier, ['apps/alpha/a.ts', 'apps/alpha/a.ts'])).toThrow(
			/duplicate/iu,
		);
		expect(() => classify(classifier, ['../outside'])).toThrow(/path/iu);
		expect(() =>
			classify(classifier, ['apps/alpha/a.ts'], {
				rules: { ...RULES, unexpected: true } as unknown as Rules,
			}),
		).toThrow(/rules|key/iu);
		expect(() => classify(classifier, [], { event: 'pull_request_target' })).toThrow(
			/pull_request_target|event/iu,
		);
		expect(() => classify(classifier, [], { repository: 'example/..' })).toThrow(
			/repository/iu,
		);
		expect(() =>
			classify(classifier, [], {
				rules: {
					...RULES,
					jobs: { ...RULES.jobs, '1-invalid': RULES.jobs['app-a']! },
				},
			}),
		).toThrow(/job id/iu);
		expect(() =>
			classify(classifier, [], {
				rules: {
					...RULES,
					jobs: { ...RULES.jobs, empty: { paths: [], prefixes: [] } },
				},
			}),
		).toThrow(/empty|match|path|prefix/iu);
		const prototypeRules = {
			...RULES,
			jobs: JSON.parse(
				'{"__proto__":{"paths":["package.json"],"prefixes":[]}}',
			) as Record<string, MatchRules>,
		};
		expect(() => classify(classifier, ['package.json'], { rules: prototypeRules })).toThrow(
			/job id|reserved|prototype/iu,
		);
	});

	it('paginates the live PR file list, binds frozen identity, and includes both rename paths', async () => {
		const { classifier } = await modules();
		const event: PullRequestEvent = { number: 17, base: { sha: BASE_SHA }, head: { sha: HEAD_SHA } };
		const calls: string[] = [];
		const firstPage = Array.from({ length: 100 }, (_, index) => ({
			filename: `apps/alpha/file-${String(index).padStart(3, '0')}.ts`,
		}));
		const fetchImpl: FetchLike = async (input) => {
			const url = String(input);
			calls.push(url);
			if (url.endsWith('/pulls/17')) {
				return json({ number: 17, base: { sha: BASE_SHA }, head: { sha: HEAD_SHA }, changed_files: 101 });
			}
			if (url.endsWith('page=1')) return json(firstPage);
			if (url.endsWith('page=2')) {
				return json([
					{
						filename: 'packages/shared/index.ts',
						previous_filename: 'packages/shared/old.ts',
					},
				]);
			}
			return json({ message: 'unexpected URL' }, 404);
		};

		const paths = await classifier.collectPullRequestPaths({
			repository: RUNTIME.repository,
			event,
			token: 'test-token',
			fetchImpl,
		});
		expect(paths).toHaveLength(102);
		expect(paths).toContain('apps/alpha/file-000.ts');
		expect(paths).toContain('apps/alpha/file-099.ts');
		expect(paths).toContain('packages/shared/index.ts');
		expect(paths).toContain('packages/shared/old.ts');
		expect(calls).toHaveLength(4);
		expect(calls[1]).toContain('per_page=100');
		expect(calls[1]).toContain('page=1');
		expect(calls[2]).toContain('page=2');
		expect(calls[3]).toMatch(/\/pulls\/17$/u);
	});

	it('rejects a pull request that moves while its mutable file pages are being read', async () => {
		const { classifier } = await modules();
		const event: PullRequestEvent = { number: 17, base: { sha: BASE_SHA }, head: { sha: HEAD_SHA } };
		let identityReads = 0;
		const fetchImpl: FetchLike = async (input) => {
			const url = String(input);
			if (url.endsWith('/pulls/17')) {
				identityReads += 1;
				return json({
					number: 17,
					base: { sha: BASE_SHA },
					head: { sha: identityReads === 1 ? HEAD_SHA : '3'.repeat(40) },
					changed_files: 1,
				});
			}
			return json([{ filename: 'docs/from-a-different-head.md' }]);
		};

		await expect(
			classifier.collectPullRequestPaths({
				repository: RUNTIME.repository,
				event,
				token: 'test-token',
				fetchImpl,
			}),
		).rejects.toThrow(/moved|stale|head/iu);
		expect(identityReads).toBe(2);
	});

	it('fails closed on moved heads, truncated pages, API errors, and the file cap', async () => {
		const { classifier } = await modules();
		const event: PullRequestEvent = { number: 17, base: { sha: BASE_SHA }, head: { sha: HEAD_SHA } };
		const run = (live: unknown, files: unknown = []) =>
			classifier.collectPullRequestPaths({
				repository: RUNTIME.repository,
				event,
				token: 'test-token',
				fetchImpl: async (input) =>
					String(input).endsWith('/pulls/17') ? json(live) : json(files),
			});

		await expect(
			run({ number: 17, base: { sha: BASE_SHA }, head: { sha: '3'.repeat(40) }, changed_files: 0 }),
		).rejects.toThrow(/head|stale/iu);
		await expect(
			run({ number: 17, base: { sha: BASE_SHA }, head: { sha: HEAD_SHA }, changed_files: 2 }, [
				{ filename: 'apps/alpha/only.ts' },
			]),
		).rejects.toThrow(/complete|count|files/iu);
		await expect(
			run({ number: 17, base: { sha: BASE_SHA }, head: { sha: HEAD_SHA }, changed_files: 3000 }),
		).rejects.toThrow(/3,?000|cap/iu);
		await expect(
			classifier.collectPullRequestPaths({
				repository: RUNTIME.repository,
				event,
				token: 'test-token',
				fetchImpl: async () => json({ message: 'rate limited' }, 403),
			}),
		).rejects.toThrow(/403|API/iu);
		await expect(
			classifier.collectPullRequestPaths({
				repository: RUNTIME.repository,
				event,
				token: 'test-token',
				apiUrl: 'http://api.github.test',
				fetchImpl: async () => json({}),
			}),
		).rejects.toThrow(/HTTPS|API URL/iu);
		await expect(
			run(
				{ number: 17, base: { sha: BASE_SHA }, head: { sha: HEAD_SHA }, changed_files: 2 },
				[{ filename: 'apps/alpha/a.ts' }, { filename: 'apps/alpha/a.ts' }],
			),
		).rejects.toThrow(/duplicate|file evidence/iu);
	});

	it('executes the shipped classifier wrapper, writes exact output, and forces full non-PR work', async () => {
		const { classifier } = await modules();
		const root = tempDirectory();
		const eventPath = join(root, 'event.json');
		const outputPath = join(root, 'classifier-output');
		writeFileSync(
			eventPath,
			JSON.stringify({
				repository: { full_name: RUNTIME.repository },
				pull_request: { number: 17, base: { sha: BASE_SHA }, head: { sha: HEAD_SHA } },
			}),
			'utf8',
		);
		const live = {
			number: 17,
			base: { sha: BASE_SHA },
			head: { sha: HEAD_SHA },
			changed_files: 1,
		};
		const receipt = await classifier.runAction(
			{
				GITHUB_REPOSITORY: RUNTIME.repository,
				GITHUB_EVENT_NAME: 'pull_request',
				GITHUB_EVENT_PATH: eventPath,
				GITHUB_RUN_ID: RUNTIME.runId,
				GITHUB_RUN_ATTEMPT: '1',
				GITHUB_OUTPUT: outputPath,
				'INPUT_GITHUB-TOKEN': 'test-token',
				'INPUT_RULES-JSON': JSON.stringify(RULES),
			},
			async (input) =>
				String(input).endsWith('/pulls/17')
					? json(live)
					: json([{ filename: 'apps/alpha/a.ts' }]),
		);
		expect(receipt).toMatchObject({ relevant: { 'app-a': true, 'app-b': false } });
		const output = readFileSync(outputPath, 'utf8');
		expect(output.match(/^classification=/gmu)).toHaveLength(1);
		expect(output.endsWith('\n')).toBe(true);
		expect(JSON.parse(output.slice('classification='.length))).toEqual(receipt);

		const pushEventPath = join(root, 'push-event.json');
		const pushOutputPath = join(root, 'push-output');
		writeFileSync(
			pushEventPath,
			JSON.stringify({
				repository: { full_name: RUNTIME.repository },
				before: BASE_SHA,
				after: HEAD_SHA,
			}),
			'utf8',
		);
		const pushReceipt = await classifier.runAction(
			{
				GITHUB_REPOSITORY: RUNTIME.repository,
				GITHUB_EVENT_NAME: 'push',
				GITHUB_EVENT_PATH: pushEventPath,
				GITHUB_RUN_ID: RUNTIME.runId,
				GITHUB_RUN_ATTEMPT: '1',
				GITHUB_SHA: HEAD_SHA,
				GITHUB_OUTPUT: pushOutputPath,
				'INPUT_GITHUB-TOKEN': 'unused',
				'INPUT_RULES-JSON': JSON.stringify(RULES),
			},
			async () => {
				throw new Error('non-PR classifier must not call the API');
			},
		);
		expect(pushReceipt).toMatchObject({
			source: { baseSha: BASE_SHA, headSha: HEAD_SHA },
			reason: 'force-full',
			relevant: { 'app-a': true, 'app-b': true },
		});
		const directOutputPath = join(root, 'direct-classifier-output');
		const direct = spawnSync(process.execPath, [fileURLToPath(CLASSIFIER_URL)], {
			env: {
				PATH: process.env.PATH ?? '',
				GITHUB_REPOSITORY: RUNTIME.repository,
				GITHUB_EVENT_NAME: 'push',
				GITHUB_EVENT_PATH: pushEventPath,
				GITHUB_RUN_ID: RUNTIME.runId,
				GITHUB_RUN_ATTEMPT: '1',
				GITHUB_SHA: HEAD_SHA,
				GITHUB_OUTPUT: directOutputPath,
				'INPUT_GITHUB-TOKEN': 'unused',
				'INPUT_RULES-JSON': JSON.stringify(RULES),
			},
			encoding: 'utf8',
		});
		expect(direct.status, direct.stderr).toBe(0);
		expect(direct.stderr).toBe('');
		expect(readFileSync(directOutputPath, 'utf8')).toMatch(/^classification=\{.*\}\n$/u);
	});
});

describe('always-reporting required context', () => {
	it('passes only selected success plus unselected skip, including valid no-work changes', async () => {
		const { classifier, reporter } = await modules();
		const selected = classify(classifier, ['apps/alpha/a.ts']);
		expect(
			reporter.evaluateRequiredContext({
				needs: needs(selected, { 'app-a': 'success', 'app-b': 'skipped' }),
				runtime: RUNTIME,
			}),
		).toEqual({ schema: 1, relevant: 1, skipped: 1, rerun: false });

		for (const paths of [['docs/readme.md'], ['.vscode/settings.json'], []]) {
			const ignored = classify(classifier, paths);
			expect(
				reporter.evaluateRequiredContext({
					needs: needs(ignored, { 'app-a': 'skipped', 'app-b': 'skipped' }),
					runtime: RUNTIME,
				}),
			).toEqual({ schema: 1, relevant: 0, skipped: 2, rerun: false });
		}
	});

	it.each(['failure', 'cancelled', 'skipped', 'timed_out', 'stale', 'action_required'])(
		'fails relevant work with %s',
		async (result) => {
			const { classifier, reporter } = await modules();
			const classification = classify(classifier, ['apps/alpha/a.ts']);
			expect(() =>
				reporter.evaluateRequiredContext({
					needs: needs(classification, { 'app-a': result, 'app-b': 'skipped' }),
					runtime: RUNTIME,
				}),
			).toThrow(new RegExp(`app-a.*${result}`, 'iu'));
		},
	);

	it.each(['success', 'cancelled', 'failure', 'timed_out', 'stale', 'action_required'])(
		'fails selectivity drift when irrelevant work reports %s',
		async (result) => {
			const { classifier, reporter } = await modules();
			const classification = classify(classifier, ['apps/alpha/a.ts']);
			expect(() =>
				reporter.evaluateRequiredContext({
					needs: needs(classification, { 'app-a': 'success', 'app-b': result }),
					runtime: RUNTIME,
				}),
			).toThrow(new RegExp(`app-b.*${result}`, 'iu'));
		},
	);

	it('fails missing or malformed classifier data and any non-success classifier state', async () => {
		const { reporter } = await modules();
		const baseNeeds = {
			classify: { result: 'success', outputs: {} },
			'app-a': { result: 'skipped', outputs: {} },
			'app-b': { result: 'skipped', outputs: {} },
		};
		expect(() => reporter.evaluateRequiredContext({ needs: baseNeeds, runtime: RUNTIME })).toThrow(
			/classification/iu,
		);
		expect(() =>
			reporter.evaluateRequiredContext({
				needs: {
					...baseNeeds,
					classify: { result: 'success', outputs: { classification: '{' } },
				},
				runtime: RUNTIME,
			}),
		).toThrow(/classification|JSON/iu);
		for (const result of ['failure', 'cancelled', 'skipped']) {
			expect(() =>
				reporter.evaluateRequiredContext({
					needs: {
						...baseNeeds,
						classify: { result, outputs: { classification: '{}' } },
					},
					runtime: RUNTIME,
				}),
			).toThrow(new RegExp(`classif.*${result}`, 'iu'));
		}
	});

	it('requires the exact direct-needs set and current repository/run attempt binding', async () => {
		const { classifier, reporter } = await modules();
		const classification = classify(classifier, ['apps/alpha/a.ts']);
		const complete = needs(classification, { 'app-a': 'success', 'app-b': 'skipped' });
		const { 'app-b': omitted, ...missing } = complete;
		expect(omitted).toBeDefined();
		expect(() => reporter.evaluateRequiredContext({ needs: missing, runtime: RUNTIME })).toThrow(
			/needs|app-b|missing/iu,
		);
		expect(() =>
			reporter.evaluateRequiredContext({
				needs: { ...complete, extra: { result: 'success', outputs: {} } },
				runtime: RUNTIME,
			}),
		).toThrow(/needs|extra/iu);
		expect(() =>
			reporter.evaluateRequiredContext({
				needs: complete,
				runtime: { ...RUNTIME, repository: 'example/other' },
			}),
		).toThrow(/repository|binding/iu);
		expect(() =>
			reporter.evaluateRequiredContext({
				needs: complete,
				runtime: { ...RUNTIME, runAttempt: 2 },
			}),
		).toThrow(/attempt|binding|stale/iu);
	});

	it('rejects forged reason, empty work sets, and malformed repository bindings', async () => {
		const { classifier, reporter } = await modules();
		const classification = classify(classifier, ['apps/alpha/a.ts']);
		const results = { 'app-a': 'success', 'app-b': 'skipped' };
		expect(() =>
			reporter.evaluateRequiredContext({
				needs: needs({ ...classification, reason: 'empty' }, results),
				runtime: RUNTIME,
			}),
		).toThrow(/reason|empty|classification/iu);

		const noWork = { ...classification, relevant: {}, reason: 'empty' };
		expect(() =>
			reporter.evaluateRequiredContext({
				needs: needs(noWork, {}),
				runtime: RUNTIME,
			}),
		).toThrow(/work|relevant|job/iu);

		const malformedRuntime = { ...RUNTIME, repository: 'not-a-repository' };
		const malformedClassification = {
			...classification,
			source: { ...classification.source, repository: malformedRuntime.repository },
		};
		expect(() =>
			reporter.evaluateRequiredContext({
				needs: needs(malformedClassification, results),
				runtime: malformedRuntime,
			}),
		).toThrow(/repository/iu);
	});

	it('accepts a fully recomputed current rerun and exposes the rerun marker', async () => {
		const { classifier, reporter } = await modules();
		const runtime = { ...RUNTIME, runAttempt: 2 };
		const classification = classify(classifier, ['apps/alpha/a.ts'], { runAttempt: 2 });
		expect(
			reporter.evaluateRequiredContext({
				needs: needs(classification, { 'app-a': 'success', 'app-b': 'skipped' }),
				runtime,
			}),
		).toEqual({ schema: 1, relevant: 1, skipped: 1, rerun: true });
	});

	it('executes the shipped reporter wrapper and emits the compact required-context report', async () => {
		const { classifier, reporter } = await modules();
		const root = tempDirectory();
		const eventPath = join(root, 'event.json');
		const outputPath = join(root, 'reporter-output');
		writeFileSync(
			eventPath,
			JSON.stringify({
				repository: { full_name: RUNTIME.repository },
				pull_request: { base: { sha: BASE_SHA }, head: { sha: HEAD_SHA } },
			}),
			'utf8',
		);
		const classification = classify(classifier, ['apps/alpha/a.ts']);
		const environment = {
			GITHUB_REPOSITORY: RUNTIME.repository,
			GITHUB_EVENT_NAME: 'pull_request',
			GITHUB_EVENT_PATH: eventPath,
			GITHUB_RUN_ID: RUNTIME.runId,
			GITHUB_RUN_ATTEMPT: '1',
			GITHUB_OUTPUT: outputPath,
			'INPUT_NEEDS-JSON': JSON.stringify(
				needs(classification, { 'app-a': 'success', 'app-b': 'skipped' }),
			),
			'INPUT_CLASSIFIER-JOB': 'classify',
		};
		const report = reporter.runRequiredContext(environment);
		expect(report).toEqual({ schema: 1, relevant: 1, skipped: 1, rerun: false });
		expect(readFileSync(outputPath, 'utf8')).toBe(`report=${JSON.stringify(report)}\n`);

		const directOutputPath = join(root, 'direct-reporter-output');
		const direct = spawnSync(process.execPath, [fileURLToPath(REPORTER_URL)], {
			env: { ...environment, PATH: process.env.PATH ?? '', GITHUB_OUTPUT: directOutputPath },
			encoding: 'utf8',
		});
		expect(direct.status, direct.stderr).toBe(0);
		expect(direct.stderr).toBe('');
		expect(readFileSync(directOutputPath, 'utf8')).toBe(`report=${JSON.stringify(report)}\n`);

		const rejected = spawnSync(process.execPath, [fileURLToPath(CLASSIFIER_URL)], {
			env: { PATH: process.env.PATH ?? '' },
			encoding: 'utf8',
		});
		expect(rejected.status).toBe(1);
		expect(rejected.stderr).toContain('::error title=Path classifier::');
	});

	it('ships dependency-free Node 24 actions and documents the job-level always/direct-needs contract', () => {
		const classifierAction = readFileSync(CLASSIFIER_ACTION_URL, 'utf8');
		const reporterAction = readFileSync(REPORTER_ACTION_URL, 'utf8');
		for (const action of [classifierAction, reporterAction]) {
			expect(action).toMatch(/using:\s*node24/u);
			expect(action).toMatch(/main:\s*main\.mjs/u);
			expect(action).not.toMatch(/uses:|checkout|bun install|npm install|pnpm install/iu);
		}
		expect(reporterAction).toContain('always()');
		expect(reporterAction).toMatch(/direct.*needs/iu);
		expect(readFileSync(ATTRIBUTES_URL, 'utf8')).toMatch(/^\*\.mjs text eol=lf$/mu);
	});

	it('routes analytics changes through the main and Windows API parity gates', () => {
		const workflow = readFileSync(CI_WORKFLOW_URL, 'utf8');

		expect(workflow).toContain('"prefixes": [".changes/", "api-reports/", "apps/", "packages/", "tools/"]');
		expect(workflow).toContain('"prefixes": ["api-reports/", "packages/analytics/"');
	});
});
