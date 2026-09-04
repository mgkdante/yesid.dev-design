import { execFileSync, spawnSync } from 'node:child_process';
import {
	chmodSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { blockingAxeViolations } from './browser/authority.js';

const ROOT = resolve(import.meta.dirname, '../../..');
const AUTHORITY_IMAGE =
	'mcr.microsoft.com/playwright:v1.61.1-noble@sha256:5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48';
const TEST_VOLUME = 'yesid-browser-authority-test-volume';
const PROXY_VARIABLES = [
	'HTTP_PROXY',
	'HTTPS_PROXY',
	'FTP_PROXY',
	'ALL_PROXY',
	'NO_PROXY',
	'http_proxy',
	'https_proxy',
	'ftp_proxy',
	'all_proxy',
	'no_proxy',
] as const;

function fakeDocker({ failCall = 0, exitCode = 23 } = {}) {
	const root = mkdtempSync(join(tmpdir(), 'yesid-browser-authority-'));
	const bin = join(root, 'bin');
	const capture = join(root, 'capture');
	const dockerConfig = join(root, 'docker-config');
	mkdirSync(bin);
	mkdirSync(capture);
	mkdirSync(dockerConfig);
	writeFileSync(
		join(dockerConfig, 'config.json'),
		JSON.stringify({
			proxies: {
				default: {
					httpProxy: 'http://proxy-user:proxy-password@proxy.example.invalid:8080',
				},
			},
		}),
	);
	const docker = join(bin, 'docker');
	writeFileSync(
		docker,
		`#!/bin/sh
set -eu
count=0
if [ -f "$TEST_CAPTURE_DIR/count" ]; then read -r count <"$TEST_CAPTURE_DIR/count"; fi
count=$((count + 1))
printf '%s\n' "$count" >"$TEST_CAPTURE_DIR/count"
printf '%s\\0' "$@" >"$TEST_CAPTURE_DIR/$count.args"
cat >"$TEST_CAPTURE_DIR/$count.stdin"
if [ "$FAKE_DOCKER_FAIL_CALL" -eq "$count" ]; then exit "$FAKE_DOCKER_EXIT"; fi
if [ "\${1-}" = volume ] && [ "\${2-}" = create ]; then printf '%s\n' "$FAKE_DOCKER_VOLUME"; fi
`,
	);
	chmodSync(docker, 0o755);
	const proxyEnv = Object.fromEntries(
		PROXY_VARIABLES.map((name) => [name, `credential-must-not-enter-${name}`]),
	);

	return {
		capture,
		env: {
			...process.env,
			...proxyEnv,
			DOCKER_CONFIG: dockerConfig,
			FAKE_DOCKER_EXIT: String(exitCode),
			FAKE_DOCKER_FAIL_CALL: String(failCall),
			FAKE_DOCKER_VOLUME: TEST_VOLUME,
			PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
			TEST_CAPTURE_DIR: capture,
		},
		remove: () => rmSync(root, { force: true, recursive: true }),
	};
}

function dockerCalls(capture: string) {
	const countPath = join(capture, 'count');
	const count = Number(readFileSync(countPath, 'utf8'));
	return Array.from({ length: count }, (_, index) => {
		const call = index + 1;
		return {
			args: readFileSync(join(capture, `${call}.args`), 'utf8').split('\0').filter(Boolean),
			stdin: readFileSync(join(capture, `${call}.stdin`)),
		};
	});
}

function expectProxyCredentialsNeutralized(args: string[]) {
	for (const name of PROXY_VARIABLES) {
		expect(args).toContain(`${name}=`);
		expect(args).not.toContain(`credential-must-not-enter-${name}`);
	}
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
		`jobs:\n  browser-authority-work:\n    container:\n      image: ${changes.workflowImage ?? AUTHORITY_IMAGE}\n`,
	);
	execFileSync('git', ['init', '--quiet'], { cwd: root });
	execFileSync('git', ['config', 'user.email', 'authority@example.invalid'], { cwd: root });
	execFileSync('git', ['config', 'user.name', 'Authority Test'], { cwd: root });
	execFileSync('git', ['add', '.'], { cwd: root });
	execFileSync('git', ['commit', '--quiet', '--message', 'fixture'], { cwd: root });
	symlinkSync(join(ROOT, 'node_modules'), join(root, 'node_modules'), 'junction');
	return root;
}

describe('browser accessibility authority', () => {
	it('creates one volume, streams the committed tree to bootstrap, runs offline, then cleans up', () => {
		const fake = fakeDocker();
		try {
			const result = spawnSync('bash', ['tools/browser-authority-noble.sh'], {
				cwd: ROOT,
				env: fake.env,
			});
			expect(result.status, result.stderr.toString()).toBe(0);
			const calls = dockerCalls(fake.capture);
			expect(calls).toHaveLength(4);
			expect(calls[0]!.args.slice(0, 2)).toEqual(['volume', 'create']);
			expect(calls[3]!.args).toEqual(['volume', 'rm', '--force', TEST_VOLUME]);
			const committedArchive = execFileSync('git', ['archive', '--format=tar', 'HEAD'], {
				cwd: ROOT,
				maxBuffer: 32 * 1024 * 1024,
			});
			expect(Buffer.compare(calls[1]!.stdin, committedArchive)).toBe(0);
			expect(calls[2]!.stdin).toHaveLength(0);
		} finally {
			fake.remove();
		}
	});

	it('neutralizes Docker client proxy credentials in both containers', () => {
		const fake = fakeDocker();
		try {
			const result = spawnSync('bash', ['tools/browser-authority-noble.sh'], {
				cwd: ROOT,
				env: fake.env,
			});
			expect(result.status, result.stderr.toString()).toBe(0);
			const runs = dockerCalls(fake.capture).filter(({ args }) => args[0] === 'run');
			expectProxyCredentialsNeutralized(runs[0]!.args);
			expect(runs).toHaveLength(2);
			expectProxyCredentialsNeutralized(runs[1]!.args);
		} finally {
			fake.remove();
		}
	});

	it('bootstraps dependencies without executing candidate or dependency scripts', () => {
		const fake = fakeDocker();
		try {
			const result = spawnSync('bash', ['tools/browser-authority-noble.sh'], {
				cwd: ROOT,
				env: fake.env,
			});
			expect(result.status, result.stderr.toString()).toBe(0);
			const calls = dockerCalls(fake.capture);
			expect(calls).toHaveLength(4);
			const bootstrapCommand = calls[1]!.args.at(-1)!;
			expect(bootstrapCommand).toContain(
				'8611ba935af886f05a6f38740a15160326c15e5d5d07adef966130b4493607ed  /tmp/bun-linux-x64.zip',
			);
			expect(bootstrapCommand).toContain('install --frozen-lockfile --ignore-scripts');
			expect(bootstrapCommand).not.toContain('bun run');
			expect(bootstrapCommand).not.toContain('test:browser');
		} finally {
			fake.remove();
		}
	});

	it('runs candidate preparation and the fixed browser inventory without network or capabilities', () => {
		const fake = fakeDocker();
		try {
			const result = spawnSync('bash', ['tools/browser-authority-noble.sh'], {
				cwd: ROOT,
				env: fake.env,
			});
			expect(result.status, result.stderr.toString()).toBe(0);
			const calls = dockerCalls(fake.capture);
			expect(calls).toHaveLength(4);
			const offline = calls[2]!;
			expect(offline.args).toContain('--network=none');
			expect(offline.args).toContain('--pull=never');
			expect(offline.args).toContain('--cap-drop=ALL');
			expect(offline.args).toContain('--security-opt=no-new-privileges');
			expect(offline.args).toContain('--shm-size=1g');
			const offlineCommand = offline.args.at(-1)!;
			expect(offlineCommand.indexOf('bun run --cwd apps/gallery prepare')).toBeLessThan(
				offlineCommand.indexOf('bun run test:browser:list'),
			);
			expect(offlineCommand).toContain('Total: 16 tests in 4 files');
			expect(offlineCommand).toContain('bun run test:browser');
		} finally {
			fake.remove();
		}
	});

	it('uses the same named volume, image, and platform without host mounts or IPC', () => {
		const fake = fakeDocker();
		try {
			const result = spawnSync('bash', ['tools/browser-authority-noble.sh'], {
				cwd: ROOT,
				env: fake.env,
			});
			expect(result.status, result.stderr.toString()).toBe(0);
			const runs = dockerCalls(fake.capture).filter(({ args }) => args[0] === 'run');
			expect(runs).toHaveLength(2);
			for (const call of runs) {
				expect(call.args).toContain('linux/amd64');
				expect(call.args).toContain(AUTHORITY_IMAGE);
				expect(call.args).toContain(
					`type=volume,source=${TEST_VOLUME},target=/authority,volume-nocopy`,
				);
				expect(call.args).not.toContain('--volume');
				expect(call.args).not.toContain('-v');
				expect(call.args).not.toContain('--ipc=host');
				expect(call.args.join(' ')).not.toContain('type=bind');
				expect(call.args.join(' ')).not.toContain(ROOT);
			}
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
			const calls = dockerCalls(fake.capture);
			expect(calls).toHaveLength(4);
			const receivedArchive = calls[1]!.stdin;
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

	it('ignores local Git replacement refs when archiving the requested commit', () => {
		const fixture = authorityFixture({});
		const fake = fakeDocker();
		try {
			const original = execFileSync('git', ['rev-parse', 'HEAD^{commit}'], {
				cwd: fixture,
				encoding: 'utf8',
			}).trim();
			writeFileSync(join(fixture, 'replacement-only.txt'), 'replacement tree\n');
			execFileSync('git', ['add', '--', 'replacement-only.txt'], { cwd: fixture });
			execFileSync('git', ['commit', '--quiet', '--message', 'replacement'], { cwd: fixture });
			const replacement = execFileSync('git', ['rev-parse', 'HEAD^{commit}'], {
				cwd: fixture,
				encoding: 'utf8',
			}).trim();
			execFileSync('git', ['replace', original, replacement], { cwd: fixture });

			const result = spawnSync('bash', ['tools/browser-authority-noble.sh', original], {
				cwd: fixture,
				env: fake.env,
			});
			expect(result.status, result.stderr.toString()).toBe(0);
			const calls = dockerCalls(fake.capture);
			expect(calls).toHaveLength(4);
			const receivedArchive = calls[1]!.stdin;
			const originalArchive = execFileSync(
				'git',
				['--no-replace-objects', 'archive', '--format=tar', original],
				{ cwd: fixture, maxBuffer: 32 * 1024 * 1024 },
			);
			expect(Buffer.compare(receivedArchive, originalArchive)).toBe(0);
		} finally {
			fake.remove();
			rmSync(fixture, { force: true, recursive: true });
		}
	});

	it('refuses repository-local archive attributes', () => {
		const fixture = authorityFixture({});
		const fake = fakeDocker();
		try {
			writeFileSync(
				join(fixture, '.git/info/attributes'),
				'apps/gallery/package.json export-ignore\n',
			);

			const result = spawnSync('bash', ['tools/browser-authority-noble.sh'], {
				cwd: fixture,
				env: fake.env,
			});
			expect(result.status).toBe(2);
			expect(result.stderr.toString()).toContain('local Git override info/attributes');
		} finally {
			fake.remove();
			rmSync(fixture, { force: true, recursive: true });
		}
	});

	it('validates the exact browser-authority workflow image instead of a decoy line', () => {
		const fixture = authorityFixture({});
		const fake = fakeDocker();
		try {
			writeFileSync(
				join(fixture, '.github/workflows/ci.yml'),
				`jobs:\n  browser-authority-work:\n    container:\n      image: mcr.microsoft.com/playwright:v1.61.1-noble@sha256:${'a'.repeat(64)}\n  decoy:\n    container:\n      image: ${AUTHORITY_IMAGE}\n`,
			);
			execFileSync('git', ['add', '--', '.github/workflows/ci.yml'], { cwd: fixture });
			execFileSync('git', ['commit', '--quiet', '--amend', '--no-edit'], { cwd: fixture });

			const result = spawnSync('bash', ['tools/browser-authority-noble.sh'], {
				cwd: fixture,
				env: fake.env,
			});
			expect(result.status).toBe(2);
			expect(result.stderr.toString()).toContain('authority pin mismatch');
		} finally {
			fake.remove();
			rmSync(fixture, { force: true, recursive: true });
		}
	});

	it('exposes the authority runner from the root and propagates Docker failure', () => {
		const fake = fakeDocker({ failCall: 3, exitCode: 23 });
		try {
			const result = spawnSync('bun', ['run', 'test:browser:noble'], {
				cwd: ROOT,
				env: fake.env,
			});
			expect(result.status).toBe(23);
			const calls = dockerCalls(fake.capture);
			expect(calls).toHaveLength(4);
			expect(calls[2]!.args).toContain(AUTHORITY_IMAGE);
			expect(calls[3]!.args).toEqual(['volume', 'rm', '--force', TEST_VOLUME]);
		} finally {
			fake.remove();
		}
	});

	it('cleans the volume and skips candidate execution when bootstrap fails', () => {
		const fake = fakeDocker({ failCall: 2, exitCode: 24 });
		try {
			const result = spawnSync('bash', ['tools/browser-authority-noble.sh'], {
				cwd: ROOT,
				env: fake.env,
			});
			expect(result.status).toBe(24);
			const calls = dockerCalls(fake.capture);
			expect(calls).toHaveLength(3);
			expect(calls[1]!.args[0]).toBe('run');
			expect(calls[2]!.args).toEqual(['volume', 'rm', '--force', TEST_VOLUME]);
		} finally {
			fake.remove();
		}
	});

	it('fails when cleanup cannot remove an otherwise successful authority volume', () => {
		const fake = fakeDocker({ failCall: 4, exitCode: 25 });
		try {
			const result = spawnSync('bash', ['tools/browser-authority-noble.sh'], {
				cwd: ROOT,
				env: fake.env,
			});
			expect(result.status).toBe(25);
			expect(dockerCalls(fake.capture)[3]!.args).toEqual([
				'volume',
				'rm',
				'--force',
				TEST_VOLUME,
			]);
			expect(result.stderr.toString()).toContain('failed to remove browser authority volume');
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
		expect(browserJob).toContain('options: --init --shm-size=1g');
		expect(browserJob).not.toContain('--ipc=host');
		expect(browserJob).toContain('apt-get install --yes --no-install-recommends unzip');
		expect(browserJob!.indexOf('apt-get install')).toBeLessThan(
			browserJob!.indexOf('uses: ./.github/actions/setup'),
		);
	});

	it('runs the local Noble command on a Docker-capable hosted runner', () => {
		const workflow = readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');
		const runnerJob = workflow.match(
			/^  noble-runner-work:\n[\s\S]*?^  token-outputs-windows-work:\n/m,
		)?.[0];

		expect(runnerJob).toBeDefined();
		expect(runnerJob).toContain('runs-on: ubuntu-24.04');
		expect(runnerJob).not.toMatch(/^    container:/mu);
		expect(runnerJob).toContain('uses: ./.github/actions/setup');
		expect(runnerJob).toContain('run: bun run test:browser:noble');
		expect(runnerJob!.indexOf('uses: ./.github/actions/setup')).toBeLessThan(
			runnerJob!.indexOf('run: bun run test:browser:noble'),
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
