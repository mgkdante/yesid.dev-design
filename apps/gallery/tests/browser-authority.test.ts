import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import {
	chmodSync,
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';

import { blockingAxeViolations } from './browser/authority.js';

const ROOT = resolve(import.meta.dirname, '../../..');
const DEPENDENCY_POLICY = join(ROOT, 'tools/browser-authority-dependency-policy.ts');
const AUTHORITY_IMAGE =
	'mcr.microsoft.com/playwright:v1.61.1-noble@sha256:5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48';
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

function fakeDocker({
	failCall = 0,
	exitCode = 23,
	preexistingWrongLabel = false,
	sleepCall = 0,
	sleepContainerRemove = false,
	sleepEveryVolumeInspect = false,
	sleepVolumeRemove = false,
	sleepSeconds = 3,
} = {}) {
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
volume_state="$TEST_CAPTURE_DIR/volumes"
mkdir -p "$volume_state"
count=0
if [ -f "$TEST_CAPTURE_DIR/count" ]; then read -r count <"$TEST_CAPTURE_DIR/count"; fi
count=$((count + 1))
printf '%s\n' "$count" >"$TEST_CAPTURE_DIR/count"
printf '%s\\0' "$@" >"$TEST_CAPTURE_DIR/$count.args"
cat >"$TEST_CAPTURE_DIR/$count.stdin"
if [ "\${1-}" = volume ] && [ "\${2-}" = create ]; then
	shift 2
	label=
	name=
	while [ "$#" -gt 0 ]; do
		if [ "$1" = --label ]; then label=$2; shift 2; else name=$1; shift; fi
	done
	if [ "$FAKE_DOCKER_PREEXISTING_WRONG_LABEL" = 1 ]; then
		printf '%s\n' foreign-owner >"$volume_state/$name"
	elif [ ! -e "$volume_state/$name" ]; then
		printf '%s\n' "\${label#*=}" >"$volume_state/$name"
	fi
	: >"$TEST_CAPTURE_DIR/create-recorded"
	if [ "$FAKE_DOCKER_SLEEP_CALL" -eq "$count" ]; then exec sleep "$FAKE_DOCKER_SLEEP_SECONDS"; fi
	if [ "$FAKE_DOCKER_FAIL_CALL" -eq "$count" ]; then exit "$FAKE_DOCKER_EXIT"; fi
	printf '%s\n' "$name"
	exit 0
fi
if [ "\${1-}" = volume ] && [ "\${2-}" = inspect ]; then
	name=
	for arg in "$@"; do name=$arg; done
	if [ "$FAKE_DOCKER_SLEEP_VOLUME_INSPECT" = 1 ] || [ "$FAKE_DOCKER_SLEEP_CALL" -eq "$count" ]; then exec sleep "$FAKE_DOCKER_SLEEP_SECONDS"; fi
	if [ "$FAKE_DOCKER_FAIL_CALL" -eq "$count" ]; then exit "$FAKE_DOCKER_EXIT"; fi
	[ -e "$volume_state/$name" ] || exit 44
	cat "$volume_state/$name"
	exit 0
fi
if [ "\${1-}" = volume ] && [ "\${2-}" = rm ]; then
	name=
	for arg in "$@"; do name=$arg; done
	if [ "$FAKE_DOCKER_SLEEP_VOLUME_RM" = 1 ] || [ "$FAKE_DOCKER_SLEEP_CALL" -eq "$count" ]; then exec sleep "$FAKE_DOCKER_SLEEP_SECONDS"; fi
	if [ "$FAKE_DOCKER_FAIL_CALL" -eq "$count" ]; then exit "$FAKE_DOCKER_EXIT"; fi
	[ -e "$volume_state/$name" ] || exit 44
	rm "$volume_state/$name"
	printf '%s\n' "$name"
	exit 0
fi
if [ "\${1-}" = rm ] && [ "$FAKE_DOCKER_SLEEP_CONTAINER_RM" = 1 ]; then
	exec sleep "$FAKE_DOCKER_SLEEP_SECONDS"
fi
if [ "$FAKE_DOCKER_SLEEP_CALL" -eq "$count" ]; then exec sleep "$FAKE_DOCKER_SLEEP_SECONDS"; fi
if [ "$FAKE_DOCKER_FAIL_CALL" -eq "$count" ]; then exit "$FAKE_DOCKER_EXIT"; fi
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
			FAKE_DOCKER_PREEXISTING_WRONG_LABEL: preexistingWrongLabel ? '1' : '0',
			FAKE_DOCKER_SLEEP_CALL: String(sleepCall),
			FAKE_DOCKER_SLEEP_CONTAINER_RM: sleepContainerRemove ? '1' : '0',
			FAKE_DOCKER_SLEEP_VOLUME_INSPECT: sleepEveryVolumeInspect ? '1' : '0',
			FAKE_DOCKER_SLEEP_VOLUME_RM: sleepVolumeRemove ? '1' : '0',
				FAKE_DOCKER_SLEEP_SECONDS: String(sleepSeconds),
			BROWSER_AUTHORITY_CLEANUP_INSPECT_TIMEOUT_SECONDS: '1',
			BROWSER_AUTHORITY_CONTAINER_REMOVE_TIMEOUT_SECONDS: '1',
			BROWSER_AUTHORITY_VOLUME_REMOVE_TIMEOUT_SECONDS: '1',
			PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
			TEST_CAPTURE_DIR: capture,
		},
		remove: () => rmSync(root, { force: true, recursive: true }),
	};
}

async function waitForDockerCall(capture: string, expected: number): Promise<void> {
	for (let attempt = 0; attempt < 200; attempt += 1) {
		const countPath = join(capture, 'count');
		if (existsSync(countPath) && Number(readFileSync(countPath, 'utf8')) >= expected) return;
		await delay(10);
	}
	throw new Error(`fake Docker did not reach call ${expected}`);
}

async function waitForDockerCreate(capture: string): Promise<void> {
	for (let attempt = 0; attempt < 200; attempt += 1) {
		if (existsSync(join(capture, 'create-recorded'))) return;
		await delay(10);
	}
	throw new Error('fake Docker did not record the created volume');
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

function createdVolume(calls: ReturnType<typeof dockerCalls>): string {
	const create = calls.find(({ args }) => args[0] === 'volume' && args[1] === 'create');
	expect(create?.args.at(-1)).toMatch(/^yesid-browser-authority-[0-9a-f]{12}-[0-9a-f]{64}$/u);
	return create!.args.at(-1)!;
}

function createdOwnership(calls: ReturnType<typeof dockerCalls>): string {
	const create = calls.find(({ args }) => args[0] === 'volume' && args[1] === 'create')!;
	const label = create.args[create.args.indexOf('--label') + 1]!;
	expect(label).toMatch(/^dev\.yesid\.browser-authority\.owner=[0-9a-f]{64}$/u);
	return label.split('=')[1]!;
}

function expectProxyCredentialsNeutralized(args: string[]) {
	for (const name of PROXY_VARIABLES) {
		expect(args).toContain(`${name}=`);
		expect(args).not.toContain(`credential-must-not-enter-${name}`);
	}
}

function authorityFixture(changes: {
	attributes?: string;
	bunVersion?: string;
	bunfig?: string;
	dependencySource?: string;
	envFile?: string;
	lockSource?: string;
	packageManager?: string;
	playwrightVersion?: string;
	npmrc?: string;
	npmrcSymlink?: boolean;
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
	if (existsSync(DEPENDENCY_POLICY)) {
		writeFileSync(
			join(root, 'tools/browser-authority-dependency-policy.ts'),
			readFileSync(DEPENDENCY_POLICY),
		);
	}
	writeFileSync(join(root, '.bun-version'), `${changes.bunVersion ?? '1.3.11'}\n`);
	const dependencySource = changes.dependencySource ?? '^1.0.0';
	writeFileSync(
		join(root, 'package.json'),
		JSON.stringify({
			name: 'authority-fixture',
			private: true,
			packageManager: changes.packageManager ?? 'bun@1.3.11',
			workspaces: ['apps/*', 'packages/*'],
			dependencies: {
				'fixture-registry-package': dependencySource,
				'@yesid/fixture': 'workspace:*',
			},
		}),
	);
	writeFileSync(
		join(root, 'apps/gallery/package.json'),
		JSON.stringify({ devDependencies: { '@playwright/test': changes.playwrightVersion ?? '1.61.1' } }),
	);
	writeFileSync(
		join(root, '.github/workflows/ci.yml'),
		`jobs:\n  browser-authority-work:\n    container:\n      image: ${changes.workflowImage ?? AUTHORITY_IMAGE}\n`,
	);
	writeFileSync(
		join(root, 'bun.lock'),
		JSON.stringify(
			{
				lockfileVersion: 1,
				configVersion: 1,
				workspaces: {
					'': {
						name: 'authority-fixture',
						dependencies: {
							'fixture-registry-package': dependencySource,
							'@yesid/fixture': 'workspace:*',
						},
					},
				},
				packages: {
					'fixture-registry-package': [
						`fixture-registry-package@${changes.lockSource ?? dependencySource}`,
						{},
						'sha512-fixture',
					],
				},
			},
			null,
			2,
		),
	);
	writeFileSync(join(root, '.npmrc'), changes.npmrc ?? 'engine-strict=true\n');
	if (changes.npmrcSymlink) {
		const target = 'engine-strict=true\n';
		rmSync(join(root, '.npmrc'));
		writeFileSync(join(root, target), 'registry=http://127.0.0.1:48123\n');
		symlinkSync(target, join(root, '.npmrc'));
	}
	if (changes.bunfig !== undefined) writeFileSync(join(root, 'bunfig.toml'), changes.bunfig);
	if (changes.envFile !== undefined) writeFileSync(join(root, '.env'), changes.envFile);
	if (changes.attributes !== undefined) {
		writeFileSync(join(root, '.gitattributes'), changes.attributes);
	}
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
			const volume = createdVolume(calls);
			const owner = createdOwnership(calls);
			expect(calls).toHaveLength(6);
			expect(calls[0]!.args.slice(0, 2)).toEqual(['volume', 'create']);
			expect(calls[0]!.args).toContain(`dev.yesid.browser-authority.owner=${owner}`);
			expect(calls[1]!.args.slice(0, 2)).toEqual(['volume', 'inspect']);
			expect(calls[1]!.args).toContain(volume);
			expect(calls[2]!.args[0]).toBe('run');
			expect(calls[3]!.args[0]).toBe('run');
			expect(calls[4]!.args.slice(0, 2)).toEqual(['volume', 'inspect']);
			expect(calls[4]!.args).toContain(volume);
			expect(calls[5]!.args).toEqual(['volume', 'rm', '--force', volume]);
			const committedArchive = execFileSync('git', ['archive', '--format=tar', 'HEAD'], {
				cwd: ROOT,
				maxBuffer: 32 * 1024 * 1024,
			});
			expect(Buffer.compare(calls[2]!.stdin, committedArchive)).toBe(0);
			expect(calls[3]!.stdin).toHaveLength(0);
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
			const calls = dockerCalls(fake.capture);
			const runs = calls.filter(({ args }) => args[0] === 'run');
			expect(runs).toHaveLength(2);
			expectProxyCredentialsNeutralized(runs[0]!.args);
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
			expect(calls).toHaveLength(6);
			const bootstrapCommand = calls[2]!.args.at(-1)!;
			expect(bootstrapCommand).toContain(
				'8611ba935af886f05a6f38740a15160326c15e5d5d07adef966130b4493607ed  /tmp/bun-linux-x64.zip',
			);
			expect(bootstrapCommand).toContain('install --frozen-lockfile --ignore-scripts');
			expect(bootstrapCommand).toContain('--registry=https://registry.npmjs.org');
			expect(bootstrapCommand).toContain('--cache-dir=/tmp/bun-cache');
			expect(bootstrapCommand).not.toContain('bun run');
			expect(bootstrapCommand).not.toContain('test:browser');
			expect(calls[2]!.args).toContain('HOME=/tmp/bootstrap-home');
			expect(calls[2]!.args).toContain('XDG_CONFIG_HOME=/tmp/bootstrap-config');
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
			expect(calls).toHaveLength(6);
			const offline = calls[3]!;
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
			const calls = dockerCalls(fake.capture);
			const volume = createdVolume(calls);
			const runs = calls.filter(({ args }) => args[0] === 'run');
			expect(runs).toHaveLength(2);
			for (const call of runs) {
				expect(call.args).toContain('linux/amd64');
				expect(call.args).toContain(AUTHORITY_IMAGE);
				expect(call.args).toContain(
					`type=volume,source=${volume},target=/authority,volume-nocopy`,
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
			expect(calls).toHaveLength(6);
			const receivedArchive = calls[2]!.stdin;
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
			expect(calls).toHaveLength(6);
			const receivedArchive = calls[2]!.stdin;
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

	it.each([
		'http://127.0.0.1:48123/package.tgz',
		'https://packages.example.invalid/package.tgz',
		'git+https://example.invalid/owner/repository.git',
		'git@example.invalid:owner/repository.git',
		'github:owner/repository#main',
		'file:../outside',
		'link:../outside',
	])('rejects selected dependency source %s before Docker starts', (dependencySource) => {
		const fixture = authorityFixture({ dependencySource });
		const fake = fakeDocker();
		try {
			const result = spawnSync('bash', ['tools/browser-authority-noble.sh'], {
				cwd: fixture,
				env: fake.env,
			});
			expect(result.status).toBe(2);
			expect(result.stderr.toString()).toContain('dependency policy');
			expect(existsSync(join(fake.capture, 'count'))).toBe(false);
		} finally {
			fake.remove();
			rmSync(fixture, { force: true, recursive: true });
		}
	});

	it('rejects a lockfile-only network source before Docker starts', () => {
		const fixture = authorityFixture({ lockSource: 'http://127.0.0.1:48123/package.tgz' });
		const fake = fakeDocker();
		try {
			const result = spawnSync('bash', ['tools/browser-authority-noble.sh'], {
				cwd: fixture,
				env: fake.env,
			});
			expect(result.status).toBe(2);
			expect(result.stderr.toString()).toContain('dependency policy');
			expect(existsSync(join(fake.capture, 'count'))).toBe(false);
		} finally {
			fake.remove();
			rmSync(fixture, { force: true, recursive: true });
		}
	});

	it.each(['export-subst', 'export-ignore'])(
		'rejects committed %s archive rewriting before Docker starts',
		(attribute) => {
			const fixture = authorityFixture({ attributes: `package.json ${attribute}\n` });
			const fake = fakeDocker();
			try {
				const result = spawnSync('bash', ['tools/browser-authority-noble.sh'], {
					cwd: fixture,
					env: fake.env,
				});
				expect(result.status).toBe(2);
				expect(result.stderr.toString()).toContain('dependency policy');
				expect(existsSync(join(fake.capture, 'count'))).toBe(false);
			} finally {
				fake.remove();
				rmSync(fixture, { force: true, recursive: true });
			}
		},
	);

	it.each([
		['npm registry override', { npmrc: 'registry=http://127.0.0.1:48123\n' }],
		['Bun registry override', { bunfig: '[install]\nregistry = "http://127.0.0.1:48123"\n' }],
		['loaded environment override', { envFile: 'NPM_CONFIG_REGISTRY=http://127.0.0.1:48123\n' }],
	] as const)('rejects a selected %s before Docker starts', (_label, changes) => {
		const fixture = authorityFixture(changes);
		const fake = fakeDocker();
		try {
			const result = spawnSync('bash', ['tools/browser-authority-noble.sh'], {
				cwd: fixture,
				env: fake.env,
			});
			expect(result.status).toBe(2);
			expect(result.stderr.toString()).toContain('dependency policy');
			expect(existsSync(join(fake.capture, 'count'))).toBe(false);
		} finally {
			fake.remove();
			rmSync(fixture, { force: true, recursive: true });
		}
	});

	it('rejects a symlinked npm configuration before Docker starts', () => {
		const fixture = authorityFixture({ npmrcSymlink: true });
		const fake = fakeDocker();
		try {
			const result = spawnSync('bash', ['tools/browser-authority-noble.sh'], {
				cwd: fixture,
				env: fake.env,
			});
			expect(result.status).toBe(2);
			expect(result.stderr.toString()).toContain('dependency policy');
			expect(existsSync(join(fake.capture, 'count'))).toBe(false);
		} finally {
			fake.remove();
			rmSync(fixture, { force: true, recursive: true });
		}
	});

	it('accepts registry selectors, npm aliases, and workspace selectors', () => {
		const fixture = authorityFixture({ dependencySource: 'npm:@scope/package@^1.2.3' });
		const fake = fakeDocker();
		try {
			const result = spawnSync('bash', ['tools/browser-authority-noble.sh'], {
				cwd: fixture,
				env: fake.env,
			});
			expect(result.status, result.stderr.toString()).toBe(0);
			expect(dockerCalls(fake.capture)).toHaveLength(6);
		} finally {
			fake.remove();
			rmSync(fixture, { force: true, recursive: true });
		}
	});

	it('exposes the authority runner from the root and propagates Docker failure', () => {
		const fake = fakeDocker({ failCall: 4, exitCode: 23 });
		try {
			const result = spawnSync('bun', ['run', 'test:browser:noble'], {
				cwd: ROOT,
				env: fake.env,
			});
			expect(result.status, result.stderr.toString()).toBe(23);
			const calls = dockerCalls(fake.capture);
			const volume = createdVolume(calls);
			expect(calls).toHaveLength(6);
			expect(calls[3]!.args).toContain(AUTHORITY_IMAGE);
			expect(calls[4]!.args.slice(0, 2)).toEqual(['volume', 'inspect']);
			expect(calls[5]!.args).toEqual(['volume', 'rm', '--force', volume]);
		} finally {
			fake.remove();
		}
	});

	it('cleans the volume and skips candidate execution when bootstrap fails', () => {
		const fake = fakeDocker({ failCall: 3, exitCode: 24 });
		try {
			const result = spawnSync('bash', ['tools/browser-authority-noble.sh'], {
				cwd: ROOT,
				env: fake.env,
			});
			expect(result.status).toBe(24);
			const calls = dockerCalls(fake.capture);
			const volume = createdVolume(calls);
			expect(calls).toHaveLength(5);
			expect(calls[2]!.args[0]).toBe('run');
			expect(calls[3]!.args.slice(0, 2)).toEqual(['volume', 'inspect']);
			expect(calls[4]!.args).toEqual(['volume', 'rm', '--force', volume]);
		} finally {
			fake.remove();
		}
	});

	it('fails when cleanup cannot remove an otherwise successful authority volume', () => {
		const fake = fakeDocker({ failCall: 6, exitCode: 25 });
		try {
			const result = spawnSync('bash', ['tools/browser-authority-noble.sh'], {
				cwd: ROOT,
				env: fake.env,
			});
			expect(result.status).toBe(25);
			const calls = dockerCalls(fake.capture);
			const volume = createdVolume(calls);
			expect(calls[4]!.args.slice(0, 2)).toEqual(['volume', 'inspect']);
			expect(calls[5]!.args).toEqual([
				'volume',
				'rm',
				'--force',
				volume,
			]);
			expect(result.stderr.toString()).toContain('failed to remove browser authority volume');
		} finally {
			fake.remove();
		}
	});

	it('reports a bounded volume-removal timeout distinctly', () => {
		const fake = fakeDocker({ sleepVolumeRemove: true });
		try {
			const result = spawnSync('bash', ['tools/browser-authority-noble.sh'], {
				cwd: ROOT,
				env: fake.env,
			});
			expect(result.status).toBe(124);
			expect(result.stderr.toString()).toContain(
				'timed out after 1s removing browser authority volume',
			);
			const calls = dockerCalls(fake.capture);
			const volume = createdVolume(calls);
			expect(calls.at(-1)!.args).toEqual(['volume', 'rm', '--force', volume]);
		} finally {
			fake.remove();
		}
	});

	it('refuses a same-name volume carrying another owner label', () => {
		const fake = fakeDocker({ preexistingWrongLabel: true });
		try {
			const result = spawnSync('bash', ['tools/browser-authority-noble.sh'], {
				cwd: ROOT,
				env: fake.env,
			});
			expect(result.status).toBe(2);
			expect(result.stderr.toString()).toContain('volume ownership mismatch');
			const calls = dockerCalls(fake.capture);
			const volume = createdVolume(calls);
			expect(calls).toHaveLength(2);
			expect(calls[1]!.args.slice(0, 2)).toEqual(['volume', 'inspect']);
			expect(calls[1]!.args).toContain(volume);
			expect(calls.some(({ args }) => args[0] === 'run')).toBe(false);
			expect(calls.some(({ args }) => args[0] === 'volume' && args[1] === 'rm')).toBe(false);
		} finally {
			fake.remove();
		}
	});

	it('terminates an active Docker call before cleaning the volume', async () => {
		const fake = fakeDocker({ sleepCall: 3, sleepContainerRemove: true });
		const child = spawn('bash', ['tools/browser-authority-noble.sh'], {
			cwd: ROOT,
			env: fake.env,
			stdio: ['ignore', 'ignore', 'pipe'],
		});
		let stderr = '';
		child.stderr!.setEncoding('utf8');
		child.stderr!.on('data', (chunk: string) => {
			stderr += chunk;
		});
		const exited = once(child, 'exit').then(([code, signal]) => ({
			code: code as number | null,
			signal: signal as NodeJS.Signals | null,
		}));

		try {
			await waitForDockerCall(fake.capture, 3);
			child.kill('SIGTERM');
			const promptExit = await Promise.race([
				exited.then((result) => ({ result })),
				delay(1_750).then(() => null),
			]);
			if (!promptExit) {
				child.kill('SIGKILL');
				await exited;
			}

			expect(promptExit, stderr).not.toBeNull();
			if (!promptExit) return;
			expect(promptExit.result).toEqual({ code: 143, signal: null });
			expect(stderr).toContain('could not remove active browser authority container');
			expect(stderr).toContain('within 1s');
			const calls = dockerCalls(fake.capture);
			const volume = createdVolume(calls);
			expect(calls.at(-2)!.args.slice(0, 2)).toEqual(['volume', 'inspect']);
			expect(calls.at(-2)!.args).toContain(volume);
			expect(calls.at(-1)!.args).toEqual(['volume', 'rm', '--force', volume]);
			expect(calls.some(({ args }) => args[0] === 'rm' && args[1] === '--force')).toBe(true);
		} finally {
			if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
			fake.remove();
		}
	});

	it('knows the volume name before a hanging create call can lose its response', async () => {
		const fake = fakeDocker({ sleepCall: 1 });
		const child = spawn('bash', ['tools/browser-authority-noble.sh'], {
			cwd: ROOT,
			env: fake.env,
			stdio: ['ignore', 'ignore', 'pipe'],
		});
		let stderr = '';
		child.stderr!.setEncoding('utf8');
		child.stderr!.on('data', (chunk: string) => {
			stderr += chunk;
		});
		const exited = once(child, 'exit').then(([code, signal]) => ({
			code: code as number | null,
			signal: signal as NodeJS.Signals | null,
		}));

		try {
			await waitForDockerCreate(fake.capture);
			child.kill('SIGTERM');
			const promptExit = await Promise.race([
				exited.then((result) => ({ result })),
				delay(750).then(() => null),
			]);
			if (!promptExit) {
				child.kill('SIGKILL');
				await exited;
			}

			expect(promptExit, stderr).not.toBeNull();
			if (!promptExit) return;
			expect(promptExit.result).toEqual({ code: 143, signal: null });
			const calls = dockerCalls(fake.capture);
			const volume = createdVolume(calls);
			expect(calls).toHaveLength(3);
			expect(calls[1]!.args.slice(0, 2)).toEqual(['volume', 'inspect']);
			expect(calls[1]!.args).toContain(volume);
			expect(calls[2]!.args).toEqual(['volume', 'rm', '--force', volume]);
		} finally {
			if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
			fake.remove();
		}
	});

	it('bounds cleanup ownership checks after terminating a hung inspection', async () => {
		const fake = fakeDocker({ sleepEveryVolumeInspect: true });
		const child = spawn('bash', ['tools/browser-authority-noble.sh'], {
			cwd: ROOT,
			env: fake.env,
			stdio: ['ignore', 'ignore', 'pipe'],
		});
		let stderr = '';
		child.stderr!.setEncoding('utf8');
		child.stderr!.on('data', (chunk: string) => {
			stderr += chunk;
		});
		const exited = once(child, 'exit').then(([code, signal]) => ({
			code: code as number | null,
			signal: signal as NodeJS.Signals | null,
		}));

		try {
			await waitForDockerCall(fake.capture, 2);
			child.kill('SIGTERM');
			const promptExit = await Promise.race([
				exited.then((result) => ({ result })),
				delay(1_750).then(() => null),
			]);
			if (!promptExit) {
				child.kill('SIGKILL');
				await exited;
			}

			expect(promptExit, stderr).not.toBeNull();
			if (!promptExit) return;
			expect(promptExit.result).toEqual({ code: 143, signal: null });
			expect(stderr).toContain(
				'timed out after 1s verifying browser authority volume',
			);
			expect(stderr).toContain('ownership; leaving it intact');
			expect(stderr).not.toContain('Killed');
			expect(
				dockerCalls(fake.capture).some(
					({ args }) => args[0] === 'volume' && args[1] === 'rm',
				),
			).toBe(false);
		} finally {
			if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
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
		expect(runnerJob).toContain(
			'uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6',
		);
		expect(runnerJob).toContain('bun-version: 1.3.11');
		expect(runnerJob).not.toContain('uses: ./.github/actions/setup');
		expect(runnerJob).not.toContain('bun install');
		expect(runnerJob).toContain('run: bun run test:browser:noble');
		expect(runnerJob!.indexOf('uses: oven-sh/setup-bun@')).toBeLessThan(
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
