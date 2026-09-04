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
const AUTHORITY_ACTION = join(ROOT, '.github/actions/browser-authority/action.yml');
const TRUSTED_AUTHORITY_COMMIT = 'ca63f2718f5731d42f1462257a7913d93570c347';
const AUTHORITY_IMAGE =
	'mcr.microsoft.com/playwright:v1.61.1-noble@sha256:5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48';
const TERMINAL_CONTROLS =
	/(?:[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]|\p{Bidi_Control})/u;
const PIN_DIAGNOSTIC_POISON = '\n::error title=forged::pin-control\u001b[2J\u009b31m\u061c\u200e\u200f\u202e';
const MALFORMED_MANIFEST = `{"broken":${PIN_DIAGNOSTIC_POISON}\n`;
const OTHER_WORKSPACE_MANIFESTS = [
	'packages/analytics/package.json',
	'packages/config/package.json',
	'packages/gates/package.json',
	'packages/i18n-core/package.json',
	'packages/motion/package.json',
	'packages/seo-kit/package.json',
	'packages/tokens/package.json',
	'packages/ui/package.json',
] as const;
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
	galleryBunfig?: string;
	galleryEnvFile?: string;
	galleryOverrides?: Record<string, string>;
	galleryPatchedDependencies?: Record<string, string>;
	galleryScripts?: Record<string, string>;
	lockDrift?: boolean;
	lockSource?: string;
	packageManager?: string;
	patchSource?: string;
	playwrightVersion?: string;
	preloadSource?: string;
	npmrc?: string;
	npmrcSymlink?: boolean;
	rootOverrides?: Record<string, string>;
	rootManifestSource?: string;
	rootScripts?: Record<string, string>;
	svelteKitVersion?: string;
	viteVersion?: string;
	workflowImage?: string;
	galleryManifestSource?: string;
	workspaceName?: string;
	workspaceVersion?: string;
}) {
	const root = mkdtempSync(join(tmpdir(), 'yesid-browser-authority-fixture-'));
	const trustedRootManifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
		dependencies?: Record<string, string>;
		overrides: Record<string, string>;
		packageManager: string;
		scripts: Record<string, string>;
	};
	const trustedGalleryManifest = JSON.parse(
		readFileSync(join(ROOT, 'apps/gallery/package.json'), 'utf8'),
	) as {
		devDependencies: Record<string, string>;
		name: string;
		scripts: Record<string, string>;
		version: string;
	};
	mkdirSync(join(root, 'tools'), { recursive: true });
	mkdirSync(join(root, 'apps/gallery'), { recursive: true });
	mkdirSync(join(root, '.github/workflows'), { recursive: true });
	mkdirSync(join(root, 'patches'), { recursive: true });
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
	for (const path of OTHER_WORKSPACE_MANIFESTS) {
		mkdirSync(join(root, path, '..'), { recursive: true });
		writeFileSync(join(root, path), readFileSync(join(ROOT, path)));
	}
	writeFileSync(join(root, '.bun-version'), `${changes.bunVersion ?? '1.3.11'}\n`);
	const dependencies = { ...trustedRootManifest.dependencies };
	if (changes.dependencySource !== undefined) {
		dependencies['fixture-registry-package'] = changes.dependencySource;
	}
	writeFileSync(
		join(root, 'package.json'),
		changes.rootManifestSource ?? JSON.stringify({
			...trustedRootManifest,
			packageManager: changes.packageManager ?? trustedRootManifest.packageManager,
			scripts: changes.rootScripts ?? trustedRootManifest.scripts,
			dependencies,
			overrides: changes.rootOverrides ?? trustedRootManifest.overrides,
		}),
	);
	writeFileSync(
		join(root, 'apps/gallery/package.json'),
		changes.galleryManifestSource ?? JSON.stringify({
			...trustedGalleryManifest,
			name: changes.workspaceName ?? trustedGalleryManifest.name,
			version: changes.workspaceVersion ?? trustedGalleryManifest.version,
			overrides: changes.galleryOverrides,
			patchedDependencies: changes.galleryPatchedDependencies,
			scripts: changes.galleryScripts ?? trustedGalleryManifest.scripts,
			devDependencies: {
				...trustedGalleryManifest.devDependencies,
				'@playwright/test':
					changes.playwrightVersion ?? trustedGalleryManifest.devDependencies['@playwright/test'],
				'@sveltejs/kit':
					changes.svelteKitVersion ?? trustedGalleryManifest.devDependencies['@sveltejs/kit'],
				vite: changes.viteVersion ?? trustedGalleryManifest.devDependencies.vite,
			},
		}),
	);
	writeFileSync(
		join(root, '.github/workflows/ci.yml'),
		`jobs:\n  browser-authority-work:\n    container:\n      image: ${changes.workflowImage ?? AUTHORITY_IMAGE}\n`,
	);
	let lockfile = readFileSync(join(ROOT, 'bun.lock'), 'utf8');
	if (changes.lockSource !== undefined) {
		lockfile = lockfile.replace(
			/\n\}\s*$/u,
			`,\n  "__authorityFixture": ${JSON.stringify(changes.lockSource)}\n}\n`,
		);
	}
	if (changes.lockDrift) {
		const changed = lockfile.replace('"vite@7.3.6"', '"vite@7.3.5"');
		if (changed === lockfile) throw new Error('authority fixture could not mutate the Vite lock tuple');
		lockfile = changed;
	}
	if (changes.workspaceVersion !== undefined) {
		const current = `"apps/gallery": {\n      "name": "${trustedGalleryManifest.name}",\n      "version": "${trustedGalleryManifest.version}"`;
		const changed = lockfile.replace(
			current,
			`"apps/gallery": {\n      "name": "${trustedGalleryManifest.name}",\n      "version": "${changes.workspaceVersion}"`,
		);
		if (changed === lockfile) {
			throw new Error('authority fixture could not update Gallery workspace metadata');
		}
		lockfile = changed;
	}
	writeFileSync(join(root, 'bun.lock'), lockfile);
	writeFileSync(
		join(root, 'patches/bits-ui@2.18.1.patch'),
		changes.patchSource ?? readFileSync(join(ROOT, 'patches/bits-ui@2.18.1.patch'), 'utf8'),
	);
	writeFileSync(join(root, '.npmrc'), changes.npmrc ?? 'engine-strict=true\n');
	if (changes.npmrcSymlink) {
		const target = 'engine-strict=true\n';
		rmSync(join(root, '.npmrc'));
		writeFileSync(join(root, target), 'registry=http://127.0.0.1:48123\n');
		symlinkSync(target, join(root, '.npmrc'));
	}
	if (changes.bunfig !== undefined) writeFileSync(join(root, 'bunfig.toml'), changes.bunfig);
	if (changes.galleryBunfig !== undefined) {
		writeFileSync(join(root, 'apps/gallery/bunfig.toml'), changes.galleryBunfig);
	}
	if (changes.galleryEnvFile !== undefined) {
		writeFileSync(join(root, 'apps/gallery/.env.production'), changes.galleryEnvFile);
	}
	if (changes.preloadSource !== undefined) {
		writeFileSync(join(root, 'validation-preload.ts'), changes.preloadSource);
	}
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

	it('runs fixed dependency CLIs and the browser inventory without candidate scripts or privileges', () => {
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
			expect(offline.args).toContain('/authority/repo/apps/gallery');
			const offlineCommand = offline.args.at(-1)!;
			const trustedBun =
				'/authority/toolchain/bun --cwd=/authority/repo/apps/gallery --config=/dev/null --no-env-file';
			const prepareIndex = offlineCommand.indexOf(
				`${trustedBun} ./node_modules/@sveltejs/kit/svelte-kit.js sync`,
			);
			const listIndex = offlineCommand.indexOf('browser_list=$(run_playwright --list)');
			const buildIndex = offlineCommand.indexOf(
				`${trustedBun} ./node_modules/vite/bin/vite.js build`,
			);
			const testIndex = offlineCommand.lastIndexOf('\n\t\trun_playwright\n');
			expect(prepareIndex).toBeGreaterThan(-1);
			expect(listIndex).toBeGreaterThan(prepareIndex);
			expect(buildIndex).toBeGreaterThan(listIndex);
			expect(testIndex).toBeGreaterThan(buildIndex);
			expect(offlineCommand).toContain('Total: 16 tests in 4 files');
			expect(offlineCommand).toContain(
				`${trustedBun} ./node_modules/vite/bin/vite.js build`,
			);
			expect(offlineCommand).toContain('./node_modules/@playwright/test/cli.js test');
			expect(offlineCommand).toContain('browser_list=$(run_playwright --list)');
			expect(offlineCommand).toContain('run_playwright');
			for (const fixedArgument of [
				'--forbid-only',
				'--workers=1',
				'--retries=0',
				'--update-snapshots=none',
				'--reporter=line',
				'--project=chromium-noble-desktop',
				'--project=chromium-noble-mobile',
				'tests/browser/accessibility.spec.ts',
				'tests/browser/gallery.authority.spec.ts',
				'tests/browser/gallery.visual.spec.ts',
				'tests/browser/runtime.spec.ts',
			]) {
				expect(offlineCommand).toContain(fixedArgument);
			}
			expect(offlineCommand).toContain('mapfile -t browser_totals');
			expect(offlineCommand).not.toContain('bun run');
		} finally {
			fake.remove();
		}
	});

	it('does not resolve forged candidate package scripts in the offline authority command', () => {
		const fixture = authorityFixture({
			rootScripts: {
				'test:browser': 'true',
				'test:browser:list': "printf 'Total: 16 tests in 4 files\\n'",
			},
			galleryScripts: {
				build: 'true',
				prepare: 'true',
				'test:browser': 'true',
				'test:browser:list': "printf 'Total: 16 tests in 4 files\\n'",
			},
		});
		const fake = fakeDocker();
		try {
			const result = spawnSync('bash', [join(ROOT, 'tools/browser-authority-noble.sh')], {
				cwd: fixture,
				env: { ...fake.env, BROWSER_AUTHORITY_TARGET_ROOT: fixture },
			});
			expect(result.status, result.stderr.toString()).toBe(0);
			const offlineCommand = dockerCalls(fake.capture)[3]!.args.at(-1)!;
			expect(offlineCommand).not.toContain('bun run');
			expect(offlineCommand).toContain('./node_modules/@sveltejs/kit/svelte-kit.js');
			expect(offlineCommand).toContain('./node_modules/vite/bin/vite.js');
			expect(offlineCommand).toContain('./node_modules/@playwright/test/cli.js');
		} finally {
			fake.remove();
			rmSync(fixture, { force: true, recursive: true });
		}
	});

	it('runs the offline phase as pwuser with a read-only image and protected tools', () => {
		const fake = fakeDocker();
		try {
			const result = spawnSync('bash', ['tools/browser-authority-noble.sh'], {
				cwd: ROOT,
				env: fake.env,
			});
			expect(result.status, result.stderr.toString()).toBe(0);
			const calls = dockerCalls(fake.capture);
			const bootstrapCommand = calls[2]!.args.at(-1)!;
			const offline = calls[3]!;
			const offlineCommand = offline.args.at(-1)!;
			const userIndex = offline.args.indexOf('--user');
			expect(userIndex).toBeGreaterThan(-1);
			expect(offline.args[userIndex + 1]).toBe('pwuser');
			expect(offline.args).toContain('--read-only');
			expect(offline.args).toContain('/tmp:rw,nosuid,nodev,exec,size=1g,mode=1777');
			expect(offline.args).toContain('HOME=/tmp/home');
			expect(offline.args).toContain('XDG_CACHE_HOME=/tmp/cache');
			expect(offline.args).toContain('XDG_CONFIG_HOME=/tmp/config');
			expect(offline.args).toContain('TMPDIR=/tmp');
			expect(bootstrapCommand).toContain(
				'chown -h -R -P root:root /authority/repo /authority/toolchain',
			);
			expect(bootstrapCommand).toContain(
				'chmod -R u=rwX,go=rX /authority/repo /authority/toolchain',
			);
			expect(bootstrapCommand).toContain('chown root:pwuser /authority/repo/apps/gallery');
			expect(bootstrapCommand).toContain('chmod 1770 /authority/repo/apps/gallery');
			expect(bootstrapCommand).toContain(
				'--cwd=/authority/repo --config=/dev/null --no-env-file',
			);
			for (const path of [
				'apps/gallery/.svelte-kit',
				'apps/gallery/build',
				'apps/gallery/test-results',
				'apps/gallery/playwright-report',
				'apps/gallery/node_modules/.vite',
				'apps/gallery/node_modules/.vite-temp',
			]) {
				expect(bootstrapCommand).toContain(path);
			}
			expect(offlineCommand).toContain('--config=/dev/null --no-env-file');
			expect(offlineCommand).toContain('test "$(id -un)" = pwuser');
			expect(offlineCommand).toContain('test "$(stat -c %a .)" = 1770');
			expect(offlineCommand).toContain('test ! -w /authority/toolchain/bun');
			expect(offlineCommand).toContain('test ! -w ./node_modules/@playwright/test/cli.js');
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

	it('uses the trusted harness against a separate target repository', () => {
		const target = authorityFixture({});
		const fake = fakeDocker();
		try {
			const commit = execFileSync('git', ['rev-parse', 'HEAD^{commit}'], {
				cwd: target,
				encoding: 'utf8',
			}).trim();
			const result = spawnSync('bash', ['tools/browser-authority-noble.sh', commit], {
				cwd: ROOT,
				env: { ...fake.env, BROWSER_AUTHORITY_TARGET_ROOT: target },
			});
			expect(result.status, result.stderr.toString()).toBe(0);
			const calls = dockerCalls(fake.capture);
			const expected = execFileSync('git', ['archive', '--format=tar', commit], {
				cwd: target,
				maxBuffer: 32 * 1024 * 1024,
			});
			expect(Buffer.compare(calls[2]!.stdin, expected)).toBe(0);
			expect(result.stderr.toString()).toContain(`source=${commit}`);
		} finally {
			fake.remove();
			rmSync(target, { force: true, recursive: true });
		}
	});

	it('pins archive modes against local tar.umask configuration', () => {
		const fixture = authorityFixture({});
		const fake = fakeDocker();
		try {
			execFileSync('git', ['config', 'tar.umask', '0777'], { cwd: fixture });
			const result = spawnSync('bash', ['tools/browser-authority-noble.sh'], {
				cwd: fixture,
				env: fake.env,
			});
			expect(result.status, result.stderr.toString()).toBe(0);
			const expected = execFileSync(
				'git',
				['-c', 'tar.umask=0002', 'archive', '--format=tar', 'HEAD'],
				{ cwd: fixture, maxBuffer: 32 * 1024 * 1024 },
			);
			expect(Buffer.compare(dockerCalls(fake.capture)[2]!.stdin, expected)).toBe(0);
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

	it.each([
		['root manifest', { rootManifestSource: MALFORMED_MANIFEST }],
		['Gallery manifest', { galleryManifestSource: MALFORMED_MANIFEST }],
	] as const)('terminal-encodes malformed candidate %s errors', (_label, changes) => {
		const fixture = authorityFixture(changes);
		const fake = fakeDocker();
		try {
			const result = spawnSync('bash', [join(ROOT, 'tools/browser-authority-noble.sh')], {
				cwd: fixture,
				env: { ...fake.env, BROWSER_AUTHORITY_TARGET_ROOT: fixture },
			});
			const stderr = result.stderr.toString();
			expect(result.status).toBe(2);
			expect(stderr).toContain('browser authority dependency policy');
			expect(stderr).not.toMatch(TERMINAL_CONTROLS);
			expect(stderr).not.toContain('::error');
			expect(stderr).not.toContain('pin-control');
			expect(existsSync(join(fake.capture, 'count'))).toBe(false);
		} finally {
			fake.remove();
			rmSync(fixture, { force: true, recursive: true });
		}
	});

	it.each([
		[
			'packageManager',
			{ packageManager: `bun@1.3.12${PIN_DIAGNOSTIC_POISON}` },
		],
		['.bun-version', { bunVersion: `1.3.12${PIN_DIAGNOSTIC_POISON}` }],
		[
			'Gallery Playwright version',
			{ playwrightVersion: `1.61.0${PIN_DIAGNOSTIC_POISON}` },
		],
	] as const)('does not echo rejected candidate %s controls', (_label, changes) => {
		const fixture = authorityFixture(changes);
		const fake = fakeDocker();
		try {
			const result = spawnSync('bash', [join(ROOT, 'tools/browser-authority-noble.sh')], {
				cwd: fixture,
				env: { ...fake.env, BROWSER_AUTHORITY_TARGET_ROOT: fixture },
			});
			const stderr = result.stderr.toString();
			expect(result.status).toBe(2);
			expect(stderr).toContain('browser authority dependency policy');
			expect(stderr).not.toMatch(TERMINAL_CONTROLS);
			expect(stderr).not.toContain('::error');
			expect(stderr).not.toContain('pin-control');
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

	it('rejects dependency graph drift in the lockfile before Docker starts', () => {
		const fixture = authorityFixture({ lockDrift: true });
		const fake = fakeDocker();
		try {
			const result = spawnSync('bash', [join(ROOT, 'tools/browser-authority-noble.sh')], {
				cwd: fixture,
				env: { ...fake.env, BROWSER_AUTHORITY_TARGET_ROOT: fixture },
			});
			expect(result.status).toBe(2);
			expect(result.stderr.toString()).toContain('bun.lock');
			expect(existsSync(join(fake.capture, 'count'))).toBe(false);
		} finally {
			fake.remove();
			rmSync(fixture, { force: true, recursive: true });
		}
	});

	it('rejects a modified dependency patch before Docker starts', () => {
		const fixture = authorityFixture({ patchSource: 'forged patch\n' });
		const fake = fakeDocker();
		try {
			const result = spawnSync('bash', [join(ROOT, 'tools/browser-authority-noble.sh')], {
				cwd: fixture,
				env: { ...fake.env, BROWSER_AUTHORITY_TARGET_ROOT: fixture },
			});
			expect(result.status).toBe(2);
			expect(result.stderr.toString()).toContain('patches/bits-ui@2.18.1.patch');
			expect(existsSync(join(fake.capture, 'count'))).toBe(false);
		} finally {
			fake.remove();
			rmSync(fixture, { force: true, recursive: true });
		}
	});

	it('rejects third-party workspace names before Docker starts', () => {
		const fixture = authorityFixture({ workspaceName: 'vite' });
		const fake = fakeDocker();
		try {
			const result = spawnSync('bash', [join(ROOT, 'tools/browser-authority-noble.sh')], {
				cwd: fixture,
				env: { ...fake.env, BROWSER_AUTHORITY_TARGET_ROOT: fixture },
			});
			expect(result.status).toBe(2);
			expect(result.stderr.toString()).toContain('workspace name');
			expect(existsSync(join(fake.capture, 'count'))).toBe(false);
		} finally {
			fake.remove();
			rmSync(fixture, { force: true, recursive: true });
		}
	});

	it.each([
		['root override drift', { rootOverrides: { vite: '0.0.0' } }],
		['SvelteKit selector drift', { svelteKitVersion: '^2.70.4' }],
		['Vite selector drift', { viteVersion: '^7.4.0' }],
	] as const)('rejects %s before Docker starts', (_label, changes) => {
		const fixture = authorityFixture(changes);
		const fake = fakeDocker();
		try {
			const result = spawnSync('bash', [join(ROOT, 'tools/browser-authority-noble.sh')], {
				cwd: fixture,
				env: { ...fake.env, BROWSER_AUTHORITY_TARGET_ROOT: fixture },
			});
			expect(result.status).toBe(2);
			expect(result.stderr.toString()).toContain('immutable browser authority');
			expect(existsSync(join(fake.capture, 'count'))).toBe(false);
		} finally {
			fake.remove();
			rmSync(fixture, { force: true, recursive: true });
		}
	});

	it.each([
		['workspace override', { galleryOverrides: { vite: '7.3.6' } }],
		[
			'workspace patch declaration',
			{ galleryPatchedDependencies: { 'vite@7.3.6': 'patches/vite.patch' } },
		],
	] as const)('rejects a %s before Docker starts', (_label, changes) => {
		const fixture = authorityFixture(changes);
		const fake = fakeDocker();
		try {
			const result = spawnSync('bash', [join(ROOT, 'tools/browser-authority-noble.sh')], {
				cwd: fixture,
				env: { ...fake.env, BROWSER_AUTHORITY_TARGET_ROOT: fixture },
			});
			expect(result.status).toBe(2);
			expect(result.stderr.toString()).toContain('workspace manifest');
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

	it('rejects candidate Bun configuration without executing its preload', () => {
		const canaryRoot = mkdtempSync(join(tmpdir(), 'yesid-browser-authority-canary-'));
		const canary = join(canaryRoot, 'preload-executed');
		const fixture = authorityFixture({
			bunfig: 'preload = ["./validation-preload.ts"]\n',
			preloadSource: `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(canary)}, 'executed');\n`,
		});
		const fake = fakeDocker();
		try {
			const result = spawnSync('bash', [join(ROOT, 'tools/browser-authority-noble.sh')], {
				cwd: fixture,
				env: { ...fake.env, BROWSER_AUTHORITY_TARGET_ROOT: fixture },
			});
			expect(result.status).toBe(2);
			expect(result.stderr.toString()).toContain('bunfig.toml');
			expect(existsSync(canary)).toBe(false);
			expect(existsSync(join(fake.capture, 'count'))).toBe(false);
		} finally {
			fake.remove();
			rmSync(fixture, { force: true, recursive: true });
			rmSync(canaryRoot, { force: true, recursive: true });
		}
	});

	it.each([
		['Gallery bunfig', { galleryBunfig: 'preload = ["./preload.ts"]\n' }],
		['Gallery environment', { galleryEnvFile: 'BUN_OPTIONS=--preload=./preload.ts\n' }],
	] as const)('rejects selected %s configuration before Docker starts', (_label, changes) => {
		const fixture = authorityFixture(changes);
		const fake = fakeDocker();
		try {
			const result = spawnSync('bash', [join(ROOT, 'tools/browser-authority-noble.sh')], {
				cwd: fixture,
				env: { ...fake.env, BROWSER_AUTHORITY_TARGET_ROOT: fixture },
			});
			expect(result.status).toBe(2);
			expect(result.stderr.toString()).toContain('not allowed');
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

	it('rejects committed node_modules entries before Docker starts', () => {
		const fixture = authorityFixture({});
		const fake = fakeDocker();
		try {
			const forgedCli = join(fixture, 'apps/gallery/node_modules/vite/bin/vite.js');
			mkdirSync(join(forgedCli, '..'), { recursive: true });
			writeFileSync(forgedCli, 'console.log("forged build");\n');
			execFileSync('git', ['add', '--force', '--', 'apps/gallery/node_modules/vite/bin/vite.js'], {
				cwd: fixture,
			});
			execFileSync('git', ['commit', '--quiet', '--amend', '--no-edit'], { cwd: fixture });

			const result = spawnSync('bash', [join(ROOT, 'tools/browser-authority-noble.sh')], {
				cwd: fixture,
				env: { ...fake.env, BROWSER_AUTHORITY_TARGET_ROOT: fixture },
			});
			expect(result.status).toBe(2);
			expect(result.stderr.toString()).toContain('node_modules');
			expect(existsSync(join(fake.capture, 'count'))).toBe(false);
		} finally {
			fake.remove();
			rmSync(fixture, { force: true, recursive: true });
		}
	});

	it('rejects npm aliases before Docker starts', () => {
		const fixture = authorityFixture({ dependencySource: 'npm:@scope/package@^1.2.3' });
		const fake = fakeDocker();
		try {
			const result = spawnSync('bash', [join(ROOT, 'tools/browser-authority-noble.sh')], {
				cwd: fixture,
				env: { ...fake.env, BROWSER_AUTHORITY_TARGET_ROOT: fixture },
			});
			expect(result.status).toBe(2);
			expect(result.stderr.toString()).toContain('disallowed dependency source');
			expect(existsSync(join(fake.capture, 'count'))).toBe(false);
		} finally {
			fake.remove();
			rmSync(fixture, { force: true, recursive: true });
		}
	});

	it('allows install configuration examples outside the bootstrap root', () => {
		const fixture = authorityFixture({});
		const fake = fakeDocker();
		const paths = [
			'docs/examples/bunfig.toml',
			'tests/fixtures/.env.production',
			'packages/tokens/fixtures/.npmrc',
		];
		try {
			for (const path of paths) {
				mkdirSync(join(fixture, path, '..'), { recursive: true });
				writeFileSync(join(fixture, path), 'registry=http://example.invalid\n');
			}
			execFileSync('git', ['add', '--', ...paths], { cwd: fixture });
			execFileSync('git', ['commit', '--quiet', '--amend', '--no-edit'], { cwd: fixture });
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

	it('allows synchronized workspace version metadata without changing dependency authority', () => {
		const fixture = authorityFixture({ workspaceVersion: '0.1.1' });
		const fake = fakeDocker();
		try {
			const result = spawnSync('bash', [join(ROOT, 'tools/browser-authority-noble.sh')], {
				cwd: fixture,
				env: { ...fake.env, BROWSER_AUTHORITY_TARGET_ROOT: fixture },
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
			`uses: mgkdante/yesid.dev-design/.github/actions/browser-authority@${TRUSTED_AUTHORITY_COMMIT}`,
		);
		expect(runnerJob).toContain('target-root: ${{ github.workspace }}');
		expect(runnerJob).toContain('target-ref: ${{ github.sha }}');
		expect(runnerJob).not.toContain('uses: ./.github/actions/setup');
		expect(runnerJob).not.toContain('uses: oven-sh/setup-bun@');
		expect(runnerJob).not.toContain('bun install');
		expect(runnerJob).not.toContain('bun run');
	});

	it('keeps the pinned harness commit available to ci-work tests', () => {
		const workflow = readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');
		const ciJob = workflow.match(/^  ci-work:\n[\s\S]*?^  browser-authority-work:\n/m)?.[0];
		expect(ciJob).toBeDefined();
		expect(ciJob).toMatch(
			/- uses: actions\/checkout@[0-9a-f]{40}[^\n]*\n\s+with:\n\s+fetch-depth: 0/u,
		);
	});

	it('pins the exact reviewed harness bytes used by hosted CI', () => {
		for (const path of [
			'.github/actions/browser-authority/action.yml',
			'tools/browser-authority-dependency-policy.ts',
			'tools/browser-authority-noble.sh',
		]) {
			const pinned = execFileSync('git', ['show', `${TRUSTED_AUTHORITY_COMMIT}:${path}`], {
				cwd: ROOT,
			});
			expect(Buffer.compare(pinned, readFileSync(join(ROOT, path)))).toBe(0);
		}
	});

	it('ships a trusted composite launcher with an honest candidate execution boundary', () => {
		expect(existsSync(AUTHORITY_ACTION)).toBe(true);
		if (!existsSync(AUTHORITY_ACTION)) return;
		const action = readFileSync(AUTHORITY_ACTION, 'utf8');
		expect(action).toContain(
			'description: Validate candidate metadata as Git data, then run its Gallery suite in a confined Noble container.',
		);
		expect(action).toContain(
			'uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6',
		);
		expect(action).toContain('bun-version: 1.3.11');
		expect(action).toContain('BROWSER_AUTHORITY_TARGET_ROOT: ${{ inputs.target-root }}');
		expect(action).toContain('BROWSER_AUTHORITY_TARGET_REF: ${{ inputs.target-ref }}');
		expect(action).toContain('bash "$GITHUB_ACTION_PATH/../../../tools/browser-authority-noble.sh"');
		expect(action).not.toContain('bun install');
		expect(action).not.toContain('bun run');
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
