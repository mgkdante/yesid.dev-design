import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	SCORECARD_POLICY,
	inventoryWorkflows,
	measureSourceTree,
	reduceRuns,
} from '../../../tools/phase2-scorecard.js';

const scratch: string[] = [];

function git(root: string, ...args: string[]): string {
	const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
	if (result.status !== 0) throw new Error(result.stderr || result.stdout);
	return result.stdout.trim();
}

function write(root: string, path: string, contents: string): void {
	const target = join(root, path);
	mkdirSync(join(target, '..'), { recursive: true });
	writeFileSync(target, contents);
}

function fixtureRepository(): { root: string; base: string; head: string } {
	const root = mkdtempSync(join(tmpdir(), 'phase2-scorecard-'));
	scratch.push(root);
	git(root, 'init', '--initial-branch=main');
	git(root, 'config', 'user.name', 'Scorecard Test');
	git(root, 'config', 'user.email', 'scorecard@example.invalid');
	write(root, 'src/app.ts', 'const answer = 42;\n\nexport { answer };\n');
	write(root, 'tests/app.test.ts', "test('answer', () => {\n\texpect(answer).toBe(42);\n});\n");
	write(root, 'fixtures/state.json', '{\n\t"ok": true\n}\n');
	write(root, 'README.md', '# Fixture\n\nMeasured documentation.\n');
	write(root, 'archive/old.ts', 'export const old = true;\n');
	write(root, 'vendor/ignored.ts', 'export const vendored = true;\n');
	write(root, 'generated/autogen.ts', '// @generated\nexport const generated = true;\n');
	write(root, 'generated/handwritten.ts', 'export const handwritten = true;\n');
	write(root, 'bun.lock', 'ignored lock\n');
	git(root, 'add', '.');
	git(root, 'commit', '-m', 'baseline');
	const base = git(root, 'rev-parse', 'HEAD');

	write(root, 'src/app.ts', 'const answer = 42;\nconst doubled = answer * 2;\nexport { answer, doubled };\n');
	write(
		root,
		'.github/workflows/ci.yml',
		`name: ci
on: pull_request
jobs:
  test:
    timeout-minutes: 10
    runs-on: ubuntu-latest
    steps:
      - uses: mgkdante/yesid.dev-design/.github/actions/classify-paths@${'a'.repeat(40)}
      - run: bun test
        env:
          DEPLOY_TOKEN: \${{ secrets.PROD_DEPLOY_TOKEN }}
          CACHE_TOKEN: \${{ secrets['CACHE_TOKEN'] }}
  report:
    name: ci
    needs: [test]
    runs-on: ubuntu-latest
    steps:
      - uses: mgkdante/yesid.dev-design/.github/actions/required-context@${'b'.repeat(40)}
  zero-timeout:
    timeout-minutes: 0
    runs-on: ubuntu-latest
    steps:
      - run: echo invalid
`,
	);
	git(root, 'add', '.');
	git(root, 'commit', '-m', 'head');
	return { root, base, head: git(root, 'rev-parse', 'HEAD') };
}

afterEach(() => {
	for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('Phase 2 scorecard measurement authority', () => {
	it('replays one deterministic source/archive policy at arbitrary revisions', () => {
		const { root, base, head } = fixtureRepository();
		const before = measureSourceTree({ repository: root, revision: base });
		const after = measureSourceTree({ repository: root, revision: head });
		const clone = mkdtempSync(join(tmpdir(), 'phase2-scorecard-clone-'));
		scratch.push(clone);
		git(root, 'clone', '--no-hardlinks', root, clone);

		expect(before).toMatchObject({
			schema: 1,
			source: { revision: base },
			policy: {
				digest: SCORECARD_POLICY.digest,
				binaryExtensions: expect.arrayContaining(['.png']),
				codeExtensions: expect.arrayContaining(['.ts']),
				patterns: {
					generatedHeader: expect.objectContaining({ flags: 'imu' }),
					testFilename: expect.objectContaining({ flags: 'u' }),
				},
			},
			lines: { code: 3, tests: 3, configuration: 5, total: 11 },
			archived: { files: 1, lines: 1 },
		});
		expect(before.excluded).toMatchObject({ generated: 1, lockfiles: 1, vendored: 1 });
		expect(after.source.revision).toBe(head);
		expect(after.lines.code).toBe(4);
		expect(after.resultDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
		expect(measureSourceTree({ repository: root, revision: base })).toEqual(before);
		expect(measureSourceTree({ repository: clone, revision: base }).resultDigest).toBe(
			before.resultDigest,
		);
	});

	it('inventories every workflow job, timeout, shared caller, and secret reference', () => {
		const { root, head } = fixtureRepository();
		const receipt = inventoryWorkflows({ repository: root, revision: head });
		const clone = mkdtempSync(join(tmpdir(), 'phase2-scorecard-clone-'));
		scratch.push(clone);
		git(root, 'clone', '--no-hardlinks', root, clone);

		expect(receipt).toMatchObject({
			schema: 1,
			source: { revision: head },
			workflows: 1,
			jobs: { total: 3, capped: 1, uncapped: 2 },
		});
		expect(receipt.uncappedJobs).toEqual([
			'.github/workflows/ci.yml:report',
			'.github/workflows/ci.yml:zero-timeout',
		]);
		expect(receipt.sharedCallers).toEqual([
			{
				action: 'classify-paths',
				path: '.github/workflows/ci.yml',
				ref: 'a'.repeat(40),
			},
			{
				action: 'required-context',
				path: '.github/workflows/ci.yml',
				ref: 'b'.repeat(40),
			},
		]);
		expect(receipt.secretReferences).toEqual([
			{ name: 'CACHE_TOKEN', path: '.github/workflows/ci.yml' },
			{ name: 'PROD_DEPLOY_TOKEN', path: '.github/workflows/ci.yml' },
		]);
		expect(inventoryWorkflows({ repository: clone, revision: head }).resultDigest).toBe(
			receipt.resultDigest,
		);
	});

	it('reduces normalized run exports with nearest-rank percentiles and no hidden failures', () => {
		const receipt = reduceRuns([
			{
				id: 1,
				attempt: 1,
				conclusion: 'success',
				createdAt: '2026-07-20T00:00:00Z',
				updatedAt: '2026-07-20T00:00:10Z',
				jobs: [
					{
						name: 'skipped',
						conclusion: 'skipped',
						startedAt: '2026-07-20T00:00:00Z',
						completedAt: '2026-07-20T00:00:00Z',
					},
					{
						name: 'a',
						conclusion: 'success',
						startedAt: '2026-07-20T00:00:02Z',
						completedAt: '2026-07-20T00:00:07Z',
					},
					{
						name: 'b',
						conclusion: 'success',
						startedAt: '2026-07-20T00:00:04Z',
						completedAt: '2026-07-20T00:00:07Z',
					},
				],
			},
			{
				id: 2,
				attempt: 2,
				conclusion: 'success',
				createdAt: '2026-07-20T00:01:00Z',
				updatedAt: '2026-07-20T00:01:20Z',
				jobs: [
					{
						name: 'a',
						conclusion: 'success',
						startedAt: '2026-07-20T00:01:04Z',
						completedAt: '2026-07-20T00:01:14Z',
					},
				],
			},
			{
				id: 3,
				attempt: 1,
				conclusion: 'failure',
				createdAt: '2026-07-20T00:02:00Z',
				updatedAt: '2026-07-20T00:02:30Z',
				jobs: [
					{
						name: 'a',
						conclusion: 'failure',
						startedAt: '2026-07-20T00:02:01Z',
						completedAt: '2026-07-20T00:02:06Z',
					},
				],
			},
		]);

		expect(receipt).toMatchObject({
			runs: 3,
			reruns: 1,
			conclusions: { failure: 1, success: 2 },
			wallSeconds: { p50: 20, p95: 30 },
			queueSeconds: { p50: 2, p95: 4 },
			runnerSeconds: 23,
		});
		expect(receipt.digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
	});
});
