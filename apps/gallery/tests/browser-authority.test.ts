import { execFileSync, spawnSync } from 'node:child_process';
import {
	chmodSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { blockingAxeViolations } from './browser/authority.js';

const ROOT = resolve(import.meta.dirname, '../../..');
const AUTHORITY_IMAGE =
	'mcr.microsoft.com/playwright:v1.61.1-noble@sha256:5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48';

function fakeDocker(exitCode = 0) {
	const root = mkdtempSync(join(tmpdir(), 'yesid-browser-authority-'));
	const bin = join(root, 'bin');
	const capture = join(root, 'capture');
	mkdirSync(bin);
	mkdirSync(capture);
	const docker = join(bin, 'docker');
	writeFileSync(
		docker,
		`#!/bin/sh\nset -eu\nprintf '%s\\0' "$@" >"$TEST_CAPTURE_DIR/args"\ncat >"$TEST_CAPTURE_DIR/stdin"\nexit "$FAKE_DOCKER_EXIT"\n`,
	);
	chmodSync(docker, 0o755);

	return {
		capture,
		env: {
			...process.env,
			FAKE_DOCKER_EXIT: String(exitCode),
			PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
			TEST_CAPTURE_DIR: capture,
		},
		remove: () => rmSync(root, { force: true, recursive: true }),
	};
}

function dockerArgs(capture: string) {
	return readFileSync(join(capture, 'args'), 'utf8').split('\0').filter(Boolean);
}

function authorityFixture(changes: {
	bunVersion?: string;
	packageManager?: string;
	playwrightVersion?: string;
	workflowImage?: string;
}) {
	const root = mkdtempSync(join(tmpdir(), 'yesid-browser-authority-fixture-'));
	mkdirSync(join(root, 'tools'), { recursive: true });
	mkdirSync(join(root, 'apps/gallery'), { recursive: true });
	mkdirSync(join(root, '.github/workflows'), { recursive: true });
	writeFileSync(
		join(root, 'tools/browser-authority-noble.sh'),
		readFileSync(join(ROOT, 'tools/browser-authority-noble.sh')),
	);
	writeFileSync(join(root, '.bun-version'), `${changes.bunVersion ?? '1.3.11'}\n`);
	writeFileSync(
		join(root, 'package.json'),
		JSON.stringify({ packageManager: changes.packageManager ?? 'bun@1.3.11' }),
	);
	writeFileSync(
		join(root, 'apps/gallery/package.json'),
		JSON.stringify({ devDependencies: { '@playwright/test': changes.playwrightVersion ?? '1.61.1' } }),
	);
	writeFileSync(
		join(root, '.github/workflows/ci.yml'),
		`  browser-authority-work:\n    container:\n      image: ${changes.workflowImage ?? AUTHORITY_IMAGE}\n`,
	);
	execFileSync('git', ['init', '--quiet'], { cwd: root });
	execFileSync('git', ['config', 'user.email', 'authority@example.invalid'], { cwd: root });
	execFileSync('git', ['config', 'user.name', 'Authority Test'], { cwd: root });
	execFileSync('git', ['add', '.'], { cwd: root });
	execFileSync('git', ['commit', '--quiet', '--message', 'fixture'], { cwd: root });
	return root;
}

describe('browser accessibility authority', () => {
	it('runs the committed tree in the digest-pinned Noble authority container', () => {
		const fake = fakeDocker();
		try {
			const result = spawnSync('bash', ['tools/browser-authority-noble.sh'], {
				cwd: ROOT,
				env: fake.env,
			});
			expect(result.status, result.stderr.toString()).toBe(0);
			const receivedArchive = readFileSync(join(fake.capture, 'stdin'));
			const committedArchive = execFileSync('git', ['archive', '--format=tar', 'HEAD'], {
				cwd: ROOT,
				maxBuffer: 32 * 1024 * 1024,
			});
			expect(Buffer.compare(receivedArchive, committedArchive)).toBe(0);

			const args = dockerArgs(fake.capture);
			expect(args.slice(0, 10)).toEqual([
				'run',
				'--platform',
				'linux/amd64',
				'--rm',
				'--init',
				'--ipc=host',
				'--interactive',
				'--env',
				'CI=1',
				'--workdir',
			]);
			expect(args[10]).toBe('/work');
			expect(args[11]).toBe(AUTHORITY_IMAGE);
			expect(args).not.toContain('--volume');
			expect(args).not.toContain('-v');
			expect(args.join(' ')).not.toContain(ROOT);
			expect(args.at(-1)).toContain(
				'8611ba935af886f05a6f38740a15160326c15e5d5d07adef966130b4493607ed  /tmp/bun-linux-x64.zip',
			);
			expect(args.at(-1)).toContain('bun install --frozen-lockfile');
			expect(args.at(-1)).toContain('bun run test:browser');
		} finally {
			fake.remove();
		}
	});

	it('resolves one requested ref and archives that immutable commit', () => {
		const fixture = authorityFixture({});
		const fake = fakeDocker();
		try {
			writeFileSync(join(fixture, 'later.txt'), 'second commit\n');
			execFileSync('git', ['add', '--', 'later.txt'], { cwd: fixture });
			execFileSync('git', ['commit', '--quiet', '--message', 'later'], { cwd: fixture });
			const commit = execFileSync('git', ['rev-parse', 'HEAD~1^{commit}'], {
				cwd: fixture,
				encoding: 'utf8',
			}).trim();
			const result = spawnSync('bash', ['tools/browser-authority-noble.sh', 'HEAD~1'], {
				cwd: fixture,
				env: fake.env,
			});
			expect(result.status, result.stderr.toString()).toBe(0);
			const receivedArchive = readFileSync(join(fake.capture, 'stdin'));
			const committedArchive = execFileSync('git', ['archive', '--format=tar', commit], {
				cwd: fixture,
				maxBuffer: 32 * 1024 * 1024,
			});
			expect(Buffer.compare(receivedArchive, committedArchive)).toBe(0);
			expect(result.stderr.toString()).toContain(`source=${commit}`);
		} finally {
			fake.remove();
			rmSync(fixture, { force: true, recursive: true });
		}
	});

	it('exposes the authority runner from the root and propagates Docker failure', () => {
		const fake = fakeDocker(23);
		try {
			const result = spawnSync('bun', ['run', 'test:browser:noble'], {
				cwd: ROOT,
				env: fake.env,
			});
			expect(result.status).toBe(23);
			expect(dockerArgs(fake.capture)[11]).toBe(AUTHORITY_IMAGE);
		} finally {
			fake.remove();
		}
	});

	it.each([
		['the root Bun package pin', { packageManager: 'bun@1.3.12' }],
		['the committed Bun version', { bunVersion: '1.3.12' }],
		['the Gallery Playwright package pin', { playwrightVersion: '1.61.0' }],
		[
			'the CI authority image',
			{
				workflowImage:
					'mcr.microsoft.com/playwright:v1.61.1-noble@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
			},
		],
	] as const)('refuses to run when %s drifts', (_label, changes) => {
		const fixture = authorityFixture(changes);
		const fake = fakeDocker();
		try {
			const result = spawnSync('bash', ['tools/browser-authority-noble.sh'], {
				cwd: fixture,
				env: fake.env,
			});
			expect(result.status).not.toBe(0);
			expect(result.stderr.toString()).toContain('authority pin mismatch');
		} finally {
			fake.remove();
			rmSync(fixture, { force: true, recursive: true });
		}
	});

	it('installs the container setup prerequisite before the shared action', () => {
		const workflow = readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');
		const browserJob = workflow.match(
			/^  browser-authority-work:\n[\s\S]*?^  token-outputs-windows-work:\n/m,
		)?.[0];

		expect(browserJob).toBeDefined();
		expect(browserJob).toContain('apt-get install --yes --no-install-recommends unzip');
		expect(browserJob!.indexOf('apt-get install')).toBeLessThan(
			browserJob!.indexOf('uses: ./.github/actions/setup'),
		);
	});

	it('emits full-page candidates without enabling snapshot updates', () => {
		const config = readFileSync(new URL('../playwright.config.ts', import.meta.url), 'utf8');
		const visualSpec = readFileSync(
			new URL('./browser/gallery.visual.spec.ts', import.meta.url),
			'utf8',
		);

		expect(config).toContain("updateSnapshots: 'none'");
		expect(visualSpec).toContain('testInfo.snapshotPath(screenshotName)');
		expect(visualSpec).toContain('testInfo.outputPath(`gallery-${theme}-candidate.png`)');
		expect(visualSpec).toContain('await page.screenshot({');
		expect(visualSpec).toContain("animations: 'disabled'");
		expect(visualSpec).toContain("caret: 'hide'");
		expect(visualSpec).toContain('fullPage: true');
		expect(visualSpec).toContain("scale: 'css'");
	});

	it('blocks serious and critical violations without hiding lower-impact evidence', () => {
		const violations = [
			{ id: 'minor-rule', impact: 'minor' },
			{ id: 'moderate-rule', impact: 'moderate' },
			{ id: 'serious-rule', impact: 'serious' },
			{ id: 'critical-rule', impact: 'critical' },
			{ id: 'unscored-rule', impact: null },
		];

		expect(blockingAxeViolations(violations).map(({ id }) => id)).toEqual([
			'serious-rule',
			'critical-rule',
		]);
		expect(violations).toHaveLength(5);
	});
});
