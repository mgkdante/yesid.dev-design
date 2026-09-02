import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

type Manifest = Readonly<{
	schema: number;
	source: Readonly<{ repository: string; sha: string; gate: string }>;
	configurations: ReadonlyArray<
		Readonly<{
			mode: string;
			sources: ReadonlyArray<Readonly<{ path: string; digest: string }>>;
			target: string;
		}>
	>;
	callers: ReadonlyArray<Readonly<{ workflow: string; action: string }>>;
}>;

type DriftModule = Readonly<{
	verifySharedToolingDrift(input: Readonly<{
		workspace: string;
		manifestPath: string;
		actionRepository: string;
		actionRef: string;
	}>): Readonly<{
		schema: number;
		source: Readonly<{ repository: string; sha: string }>;
		configurations: number;
		callers: number;
	}>;
}>;

type MatchRules = Readonly<{ paths: string[]; prefixes: string[] }>;
type ClassifierRules = Readonly<{
	schema: 1;
	always: MatchRules;
	jobs: Record<string, MatchRules>;
	ignore: Readonly<Record<'docs-only' | 'irrelevant', MatchRules>>;
}>;
type ClassifierModule = Readonly<{
	classifyPaths(input: Readonly<{
		repository: string;
		event: string;
		baseSha: string;
		headSha: string;
		runId: string;
		runAttempt: number;
		complete: true;
		paths: string[];
		rules: ClassifierRules;
	}>): Readonly<{ reason: string; relevant: Record<string, boolean> }>;
}>;

const ROOT = realpathSync(new URL('../../../', import.meta.url).pathname);
const CI_PATH = join(ROOT, '.github', 'workflows', 'ci.yml');
const SETUP_PATH = join(ROOT, '.github', 'actions', 'setup', 'action.yml');
const MANIFEST_PATH = join(ROOT, '.github', 'shared-tooling.json');
const DRIFT_MODULE_URL = pathToFileURL(
	join(ROOT, '.github', 'actions', 'shared-tooling-drift', 'main.mjs'),
);
const CLASSIFIER_MODULE_URL = pathToFileURL(
	join(ROOT, '.github', 'actions', 'classify-paths', 'main.mjs'),
);
const REPOSITORY = 'mgkdante/yesid.dev-design';
const SHA = 'a4e9d0e3b42da8121b5e9f98de2e315ad48e8f25';
const WORKFLOW = '.github/workflows/ci.yml';
const ACTIONS = [
	'.github/actions/classify-paths',
	'.github/actions/required-context',
	'.github/actions/shared-tooling-drift',
] as const;
const REQUIRED_CONTEXTS = [
	'ci',
	'browser-authority',
	'token-outputs-windows',
	'token-byte-parity',
] as const;
const WORK_JOBS = REQUIRED_CONTEXTS.map((context) => `${context}-work`);

function text(path: string): string {
	return readFileSync(path, 'utf8');
}

function sha256(contents: string | Uint8Array): string {
	return `sha256:${createHash('sha256').update(contents).digest('hex')}`;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function topLevelBlock(source: string, key: string): string {
	const lines = source.split(/\r?\n/u);
	const start = lines.findIndex((line) => line === `${key}:`);
	if (start < 0) return '';
	let end = start + 1;
	while (end < lines.length && (!lines[end]?.trim() || /^\s/u.test(lines[end] ?? ''))) end += 1;
	return lines.slice(start + 1, end).join('\n');
}

function directMapping(block: string, indent = 2): Map<string, string> {
	const entries = new Map<string, string>();
	const pattern = new RegExp(`^ {${indent}}([A-Za-z0-9_-]+):\\s*([^#\\s]+)`, 'gmu');
	for (const match of block.matchAll(pattern)) entries.set(match[1]!, match[2]!);
	return entries;
}

function jobBlocks(source: string): Map<string, string> {
	const jobs = topLevelBlock(source, 'jobs');
	const lines = jobs.split('\n');
	const starts: Array<{ id: string; line: number }> = [];
	for (const [line, contents] of lines.entries()) {
		const match = contents.match(/^  ([A-Za-z0-9_-]+):\s*$/u);
		if (match) starts.push({ id: match[1]!, line });
	}
	return new Map(
		starts.map(({ id, line }, index) => [
			id,
			lines.slice(line, starts[index + 1]?.line ?? lines.length).join('\n'),
		]),
	);
}

function directNeeds(job: string): string[] {
	const inline = job.match(/^ {4}needs:\s*\[([^\]]*)\]\s*$/mu);
	if (inline) {
		return inline[1]!
			.split(',')
			.map((value) => value.trim())
			.filter(Boolean);
	}
	const lines = job.split('\n');
	const start = lines.findIndex((line) => /^ {4}needs:\s*$/u.test(line));
	if (start < 0) return [];
	const needs: string[] = [];
	for (const line of lines.slice(start + 1)) {
		if (/^ {4}\S/u.test(line)) break;
		const match = line.match(/^ {6}-\s*([A-Za-z0-9_-]+)\s*$/u);
		if (match) needs.push(match[1]!);
	}
	return needs;
}

function classifierRules(source: string): ClassifierRules {
	const lines = source.split(/\r?\n/u);
	const start = lines.findIndex((line) => /^ {10}rules-json:\s*>-\s*$/u.test(line));
	expect(start, 'rules-json block must exist').toBeGreaterThanOrEqual(0);
	const jsonLines: string[] = [];
	for (const line of lines.slice(start + 1)) {
		if (!line.startsWith('            ')) break;
		jsonLines.push(line.slice(12));
	}
	return JSON.parse(jsonLines.join('\n')) as ClassifierRules;
}

function manifest(): Manifest {
	expect(existsSync(MANIFEST_PATH), '.github/shared-tooling.json must exist').toBe(true);
	return JSON.parse(text(MANIFEST_PATH)) as Manifest;
}

describe('ST4 Design shared-tooling adoption', () => {
	it('caches only the work product that each CI job can populate', () => {
		const setup = text(SETUP_PATH);
		expect(setup).toMatch(/^inputs:\s*$/mu);
		expect(setup).toMatch(/^  cache-turbo:\s*$/mu);
		expect(setup).toMatch(/^  cache-vitest:\s*$/mu);
		expect(setup).toMatch(/^    default:\s*['"]false['"]\s*$/mu);
		expect(setup).toMatch(/^      if:\s*inputs\.cache-turbo == ['"]true['"]\s*$/mu);
		expect(setup).toMatch(/^    - name:\s*Cache Vitest\s*$/mu);
		expect(setup).toMatch(/^      if:\s*inputs\.cache-vitest == ['"]true['"]\s*$/mu);
		expect(setup).toMatch(/^        path:\s*apps\/gallery\/node_modules\/\.vite\/vitest\s*$/mu);
		expect(setup).not.toContain('apps/gallery/.vitest/cache');

		const jobs = jobBlocks(text(CI_PATH));
		expect(jobs.get('ci-work')).toMatch(
			/^ {8}with:\s*\n {10}cache-turbo:\s*['"]true['"]\s*\n {10}cache-vitest:\s*['"]true['"]\s*$/mu,
		);
		for (const id of ['browser-authority-work', 'token-outputs-windows-work']) {
			expect(jobs.get(id), id).not.toContain('cache-turbo:');
			expect(jobs.get(id), id).not.toContain('cache-vitest:');
		}
	});

	it('caps every CI job with an explicit positive timeout', () => {
		for (const [id, job] of jobBlocks(text(CI_PATH))) {
			expect(job, id).toMatch(/^ {4}timeout-minutes:\s*[1-9][0-9]*\s*$/mu);
		}
	});

	it('grants classifier read access without workflow-level path filters', () => {
		const ci = text(CI_PATH);
		expect(Object.fromEntries(directMapping(topLevelBlock(ci, 'permissions')))).toEqual({
			contents: 'read',
			'pull-requests': 'read',
		});
		expect(ci).not.toMatch(/^\s+(?:paths|paths-ignore):/mu);
	});

	it('pins exactly one classifier, reporter, and drift caller to the repaired SHA', () => {
		const ci = text(CI_PATH);
		for (const action of ACTIONS) {
			const path = `${REPOSITORY}/${action}`;
			const exact = new RegExp(
				`^\\s*-\\s*uses:\\s*["']?${escapeRegExp(`${path}@${SHA}`)}["']?(?:\\s+#.*)?$`,
				'gmu',
			);
			expect([...ci.matchAll(exact)], action).toHaveLength(1);
			expect(ci.match(new RegExp(`${escapeRegExp(path)}@`, 'gu')) ?? [], action).toHaveLength(1);
		}
	});

	it('preserves work identities behind one non-fail-fast always-reporting matrix', () => {
		const jobs = jobBlocks(text(CI_PATH));
		for (const job of WORK_JOBS) {
			expect(jobs.has(job), job).toBe(true);
			expect(directNeeds(jobs.get(job)!), `${job} must directly need classify`).toContain('classify');
			expect(jobs.get(job), `${job} must use its classifier selection`).toContain(
				`relevant['${job}']`,
			);
		}
		for (const context of REQUIRED_CONTEXTS) expect(jobs.has(context), context).toBe(false);

		const classifier = [...jobs].filter(([, job]) =>
			job.includes(`${REPOSITORY}/${ACTIONS[0]}@${SHA}`),
		);
		const reporters = [...jobs].filter(([, job]) =>
			job.includes(`${REPOSITORY}/${ACTIONS[1]}@${SHA}`),
		);
		expect(classifier).toHaveLength(1);
		expect(reporters).toHaveLength(1);

		const [classifierId] = classifier[0]!;
		const [, reporter] = reporters[0]!;
		expect(reporter).toMatch(/^ {4}if:\s*(?:\$\{\{\s*)?always\(\)(?:\s*\}\})?\s*$/mu);
		expect(reporter).toMatch(/^ {4}strategy:\s*$/mu);
		expect(reporter).toMatch(/^ {6}fail-fast:\s*false\s*$/mu);
		expect(reporter).toMatch(/^ {4}name:\s*\$\{\{\s*matrix\.context\s*\}\}\s*$/mu);
		expect(
			[...reporter.matchAll(/^\s+-\s*context:\s*([A-Za-z0-9_-]+)\s*$/gmu)].map(
				(match) => match[1]!,
			),
		).toEqual([...REQUIRED_CONTEXTS]);
		expect(directNeeds(reporter).sort()).toEqual([classifierId, ...WORK_JOBS].sort());
	});

	it('classifies the canary paths selectively and preserves parity dependencies', async () => {
		const rules = classifierRules(text(CI_PATH));
		const subject = (await import(
			`${CLASSIFIER_MODULE_URL.href}?adoption=${Date.now()}-${Math.random()}`
		)) as ClassifierModule;
		const classify = (paths: string[]) =>
			subject.classifyPaths({
				repository: REPOSITORY,
				event: 'pull_request',
				baseSha: '1'.repeat(40),
				headSha: '2'.repeat(40),
				runId: '123',
				runAttempt: 1,
				complete: true,
				paths,
				rules,
			});
		const fixtures = [
			{
				paths: ['README.md'],
				reason: 'docs-only',
				relevant: Object.fromEntries(WORK_JOBS.map((job) => [job, false])),
			},
			{
				paths: ['packages/ui/src/Button.svelte'],
				reason: 'matched',
				relevant: {
					'ci-work': true,
					'browser-authority-work': true,
					'token-outputs-windows-work': true,
					'token-byte-parity-work': false,
				},
			},
			{
				paths: ['tools/api-authority.ts', 'api-reports/ui.api.md'],
				reason: 'matched',
				relevant: {
					'ci-work': true,
					'browser-authority-work': false,
					'token-outputs-windows-work': true,
					'token-byte-parity-work': false,
				},
			},
			{
				paths: ['tools/release-core.ts'],
				reason: 'matched',
				relevant: {
					'ci-work': true,
					'browser-authority-work': false,
					'token-outputs-windows-work': true,
					'token-byte-parity-work': false,
				},
			},
			{
				paths: ['packages/tokens/src/build.ts'],
				reason: 'matched',
				relevant: Object.fromEntries(WORK_JOBS.map((job) => [job, true])),
			},
			{
				paths: ['.github/workflows/ci.yml'],
				reason: 'control',
				relevant: Object.fromEntries(WORK_JOBS.map((job) => [job, true])),
			},
			{
				paths: ['new-root-surface.txt'],
				reason: 'safe-full',
				relevant: Object.fromEntries(WORK_JOBS.map((job) => [job, true])),
			},
		] as const;

		for (const fixture of fixtures) {
			const result = classify([...fixture.paths]);
			expect(result).toMatchObject({ reason: fixture.reason, relevant: fixture.relevant });
			if (result.relevant['token-byte-parity-work']) {
				expect(result.relevant['ci-work']).toBe(true);
				expect(result.relevant['token-outputs-windows-work']).toBe(true);
			}
		}
	});

	it('binds schema-1 configuration sources and the exact caller set', () => {
		const contract = manifest();
		expect(contract.schema).toBe(1);
		expect(contract.source).toEqual({
			repository: REPOSITORY,
			sha: SHA,
			gate: ACTIONS[2],
		});
		expect(contract.configurations.length).toBeGreaterThan(0);
		for (const configuration of contract.configurations) {
			for (const source of configuration.sources) {
				expect(source.digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
				expect(source.digest, source.path).toBe(sha256(readFileSync(join(ROOT, source.path))));
			}
		}
		expect(
			contract.callers
				.map(({ workflow, action }) => `${workflow}\0${action}`)
				.sort(),
		).toEqual(ACTIONS.map((action) => `${WORKFLOW}\0${action}`).sort());
	});

	it('passes the checked-in manifest through the local drift verifier', async () => {
		manifest();
		const subject = (await import(
			`${DRIFT_MODULE_URL.href}?adoption=${Date.now()}-${Math.random()}`
		)) as DriftModule;
		const receipt = subject.verifySharedToolingDrift({
			workspace: ROOT,
			manifestPath: MANIFEST_PATH,
			actionRepository: REPOSITORY,
			actionRef: SHA,
		});
		expect(receipt).toMatchObject({
			schema: 1,
			source: { repository: REPOSITORY, sha: SHA },
			callers: 3,
		});
		expect(receipt.configurations).toBeGreaterThan(0);
	});

});
