import {
	cpSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

type DriftReceipt = Readonly<{
	schema: 1;
	source: Readonly<{ repository: string; sha: string }>;
	manifestDigest: string;
	configurationsDigest: string;
	callersDigest: string;
	configurations: number;
	callers: number;
}>;

type DriftModule = Readonly<{
	verifySharedToolingDrift(input: Readonly<{
		workspace: string;
		manifestPath: string;
		actionRepository: string;
		actionRef: string;
	}>): DriftReceipt;
	runAction(environment?: NodeJS.ProcessEnv): DriftReceipt;
}>;

type Manifest = {
	schema: 1;
	source: {
		repository: string;
		sha: string;
		gate: string;
	};
	configurations: Array<{
		mode: 'bytes' | 'json-merge';
		sources: Array<{ path: string; digest: string }>;
		target: string;
	}>;
	callers: Array<{
		workflow: string;
		action: string;
	}>;
};

const REPOSITORY_ROOT = realpathSync(new URL('../../../', import.meta.url).pathname);
const ACTION_DIRECTORY = join(REPOSITORY_ROOT, '.github', 'actions', 'shared-tooling-drift');
const ACTION_URL = pathToFileURL(join(ACTION_DIRECTORY, 'main.mjs'));
const ACTION_METADATA = join(ACTION_DIRECTORY, 'action.yml');
const DOCUMENTATION = join(REPOSITORY_ROOT, 'docs', 'SHARED-TOOLING-CI.md');
const SHA = '1'.repeat(40);
const REPOSITORY = 'example/shared-tooling';
const GATE = '.github/actions/shared-tooling-drift';
const BYTES = new Uint8Array([0, 1, 2, 255]);
const TURBO_BASE = JSON.stringify({ $schema: 'turbo', tasks: { build: { outputs: ['dist/**'] } } });
const TURBO_OVERLAY = JSON.stringify({
	tasks: { build: { env: ['PUBLIC_API'] }, lint: { outputs: [] } },
});
const roots: string[] = [];

function sha256(contents: string | Uint8Array): string {
	return `sha256:${createHash('sha256').update(contents).digest('hex')}`;
}

function temporaryRoot(): string {
	const root = mkdtempSync(join(tmpdir(), 'shared-tooling-drift-'));
	roots.push(root);
	return root;
}

function write(path: string, contents: string | Uint8Array): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, contents);
}

function manifest(): Manifest {
	return {
		schema: 1,
		source: { repository: REPOSITORY, sha: SHA, gate: GATE },
		configurations: [
			{
				mode: 'bytes',
				sources: [{ path: 'config/base.bin', digest: sha256(BYTES) }],
				target: 'generated/base.bin',
			},
			{
				mode: 'json-merge',
				sources: [
					{ path: 'config/turbo.base.json', digest: sha256(TURBO_BASE) },
					{ path: 'config/turbo.overlay.json', digest: sha256(TURBO_OVERLAY) },
				],
				target: 'turbo.json',
			},
		],
		callers: [
			{ workflow: '.github/workflows/ci.yml', action: GATE },
			{ workflow: '.github/workflows/ci.yml', action: '.github/actions/classify-paths' },
			{ workflow: '.github/workflows/ci.yml', action: '.github/actions/required-context' },
		],
	};
}

function workflow(sha = SHA): string {
	return `name: ci
on: pull_request
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: ${REPOSITORY}/${GATE}@${sha}
      - uses: "${REPOSITORY}/.github/actions/classify-paths@${sha}" # exact pin
      - uses: '${REPOSITORY}/.github/actions/required-context@${sha}'
      - name: Literal references inside scripts are not callers
        run: |
          echo "${REPOSITORY}/.github/actions/not-a-caller@main"
# ${REPOSITORY}/.github/actions/comment-only@main
`;
}

function fixture(): Readonly<{ root: string; manifestPath: string; value: Manifest }> {
	const root = temporaryRoot();
	const value = manifest();
	write(join(root, 'config', 'base.bin'), BYTES);
	write(join(root, 'generated', 'base.bin'), BYTES);
	write(join(root, 'config', 'turbo.base.json'), TURBO_BASE);
	write(join(root, 'config', 'turbo.overlay.json'), TURBO_OVERLAY);
	write(
		join(root, 'turbo.json'),
		JSON.stringify({
			$schema: 'turbo',
			tasks: {
				build: { env: ['PUBLIC_API'], outputs: ['dist/**'] },
				lint: { outputs: [] },
			},
		}),
	);
	write(join(root, '.github', 'workflows', 'ci.yml'), workflow());
	const manifestPath = join(root, '.github', 'shared-tooling.json');
	write(manifestPath, `${JSON.stringify(value, null, '\t')}\n`);
	return { root, manifestPath, value };
}

async function modules(): Promise<DriftModule> {
	return (await import(`${ACTION_URL.href}?test=${Date.now()}-${Math.random()}`)) as DriftModule;
}

function verify(subject: DriftModule, state = fixture()): DriftReceipt {
	return subject.verifySharedToolingDrift({
		workspace: state.root,
		manifestPath: state.manifestPath,
		actionRepository: REPOSITORY,
		actionRef: SHA,
	});
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('shared configuration drift', () => {
	it('accepts digest-bound byte copies and deterministic JSON overlays', async () => {
		const subject = await modules();
		const receipt = verify(subject);

		expect(receipt).toMatchObject({
			schema: 1,
			source: { repository: REPOSITORY, sha: SHA },
			configurations: 2,
			callers: 3,
		});
		for (const digest of [
			receipt.manifestDigest,
			receipt.configurationsDigest,
			receipt.callersDigest,
		]) {
			expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
		}
	});

	it('makes receipt identity independent of unordered manifest entry order', async () => {
		const subject = await modules();
		const first = fixture();
		const expected = verify(subject, first);
		const reordered = fixture();
		reordered.value.configurations.reverse();
		reordered.value.callers.reverse();
		write(reordered.manifestPath, JSON.stringify(reordered.value));

		expect(verify(subject, reordered)).toEqual(expected);
	});

	it('fails closed on byte, base, overlay, or generated JSON drift', async () => {
		const subject = await modules();
		const mutations: Array<(state: ReturnType<typeof fixture>) => void> = [
			(state) => write(join(state.root, 'generated', 'base.bin'), new Uint8Array([0, 1, 3, 255])),
			(state) =>
				write(join(state.root, 'config', 'turbo.base.json'), JSON.stringify({ tasks: { test: {} } })),
			(state) =>
				write(join(state.root, 'config', 'turbo.overlay.json'), JSON.stringify({ tasks: { lint: {} } })),
			(state) => write(join(state.root, 'turbo.json'), JSON.stringify({ tasks: {} })),
		];

		for (const mutate of mutations) {
			const state = fixture();
			mutate(state);
			expect(() => verify(subject, state)).toThrow(/configuration|drift/iu);
		}
	});

	it('rejects coordinated source and target drift until the source digest is deliberately updated', async () => {
		const subject = await modules();
		const state = fixture();
		const changed = new Uint8Array([9, 8, 7]);
		write(join(state.root, 'config', 'base.bin'), changed);
		write(join(state.root, 'generated', 'base.bin'), changed);
		expect(() => verify(subject, state)).toThrow(/source.*digest|digest.*source/iu);
	});

	it('rejects duplicate JSON keys, unknown manifest fields, duplicate targets, and unsafe paths', async () => {
		const subject = await modules();
		const duplicateKey = fixture();
		write(
			duplicateKey.manifestPath,
			`{"schema":1,"schema":1,"source":{},"configurations":[],"callers":[]}`,
		);
		expect(() => verify(subject, duplicateKey)).toThrow(/duplicate.*schema/iu);

		const unknown = fixture();
		write(unknown.manifestPath, JSON.stringify({ ...unknown.value, surprise: true }));
		expect(() => verify(subject, unknown)).toThrow(/keys|surprise|unknown/iu);

		const duplicated = fixture();
		duplicated.value.configurations.push({ ...duplicated.value.configurations[0]! });
		write(duplicated.manifestPath, JSON.stringify(duplicated.value));
		expect(() => verify(subject, duplicated)).toThrow(/duplicate.*target/iu);

		for (const path of ['../outside', '/absolute', 'config\\windows', './config/base.bin']) {
			const unsafe = fixture();
			unsafe.value.configurations[0]!.sources = [{ path, digest: sha256(BYTES) }];
			write(unsafe.manifestPath, JSON.stringify(unsafe.value));
			expect(() => verify(subject, unsafe)).toThrow(/path|relative|canonical/iu);
		}

		const reserved = fixture();
		write(join(reserved.root, 'config', 'turbo.overlay.json'), '{"__proto__":{}}');
		reserved.value.configurations[1]!.sources[1]!.digest = sha256('{"__proto__":{}}');
		write(reserved.manifestPath, JSON.stringify(reserved.value));
		expect(() => verify(subject, reserved)).toThrow(/reserved.*__proto__/iu);
	});

	it('refuses symlinked configuration inputs and outputs', async () => {
		const subject = await modules();
		const state = fixture();
		rmSync(join(state.root, 'generated', 'base.bin'));
		symlinkSync(join(state.root, 'config', 'base.bin'), join(state.root, 'generated', 'base.bin'));
		expect(() => verify(subject, state)).toThrow(/symbolic|symlink/iu);
	});
});

describe('immutable workflow callers', () => {
	it('binds the running action repository and ref to the exact manifest source', async () => {
		const subject = await modules();
		const state = fixture();
		expect(() =>
			subject.verifySharedToolingDrift({
				workspace: state.root,
				manifestPath: state.manifestPath,
				actionRepository: 'example/fork',
				actionRef: SHA,
			}),
		).toThrow(/repository/iu);
		expect(() =>
			subject.verifySharedToolingDrift({
				workspace: state.root,
				manifestPath: state.manifestPath,
				actionRepository: REPOSITORY,
				actionRef: 'main',
			}),
		).toThrow(/ref|SHA|immutable/iu);
	});

	it.each(['main', 'v1', 'refs/heads/main', '1'.repeat(39), 'A'.repeat(40)])(
		'rejects mutable, abbreviated, or noncanonical caller ref %s',
		async (ref) => {
			const subject = await modules();
			const state = fixture();
			write(join(state.root, '.github', 'workflows', 'ci.yml'), workflow(ref));
			expect(() => verify(subject, state)).toThrow(/immutable|SHA|ref/iu);
		},
	);

	it('rejects missing, duplicate, and untracked shared-action callers', async () => {
		const subject = await modules();
		const missing = fixture();
		write(
			join(missing.root, '.github', 'workflows', 'ci.yml'),
			workflow().replace(/^.*classify-paths.*\n/mu, ''),
		);
		expect(() => verify(subject, missing)).toThrow(/missing.*classify-paths/iu);

		const duplicate = fixture();
		write(
			join(duplicate.root, '.github', 'workflows', 'ci.yml'),
			`${workflow()}      - uses: ${REPOSITORY}/${GATE}@${SHA}\n`,
		);
		expect(() => verify(subject, duplicate)).toThrow(/duplicate|exactly once/iu);

		const untracked = fixture();
		write(
			join(untracked.root, '.github', 'workflows', 'ci.yml'),
			`${workflow()}      - uses: ${REPOSITORY}/.github/actions/undeclared@${SHA}\n`,
		);
		expect(() => verify(subject, untracked)).toThrow(/undeclared|untracked/iu);
	});

	it('rejects relevant repository references hidden outside literal uses scalars', async () => {
		const subject = await modules();
		const state = fixture();
		write(
			join(state.root, '.github', 'workflows', 'ci.yml'),
			`${workflow()}env:\n  HIDDEN_ACTION: ${REPOSITORY}/.github/actions/hidden@${SHA}\n`,
		);
		expect(() => verify(subject, state)).toThrow(/outside.*uses|hidden|literal/iu);
	});

	it('scans undeclared workflow files and rejects any extra shared-repository caller', async () => {
		const subject = await modules();
		const state = fixture();
		write(
			join(state.root, '.github', 'workflows', 'undeclared.yml'),
			`name: undeclared\non: push\njobs:\n  extra:\n    uses: ${REPOSITORY}/.github/workflows/extra.yml@${SHA}\n`,
		);
		expect(() => verify(subject, state)).toThrow(/undeclared\.yml.*untracked|untracked.*extra/iu);
	});

	it('rejects shared-action callers split across quoted YAML lines', async () => {
		const subject = await modules();
		const state = fixture();
		write(
			join(state.root, '.github', 'workflows', 'undeclared.yml'),
			`name: undeclared
on: push
jobs:
  hidden:
    runs-on: ubuntu-latest
    steps:
      - uses: "example/shared-\\
          tooling/.github/actions/undeclared@${SHA}"
`,
		);
		expect(() => verify(subject, state)).toThrow(/multiline|quoted|unsupported/iu);
	});

	it.each([
		`jobs: {verify: {steps: [{uses: ${REPOSITORY}/${GATE}@main}]}}`,
		`jobs:\n  verify:\n    steps:\n      - "uses": ${REPOSITORY}/${GATE}@main`,
		`x-action: &shared ${REPOSITORY}/${GATE}@main\njobs:\n  verify:\n    steps:\n      - uses: *shared`,
		`jobs:\n  verify:\n    steps:\n      - uses: >-\n          ${REPOSITORY}/${GATE}@main`,
	])('fails closed on nonliteral or unsupported YAML caller forms', async (addition) => {
		const subject = await modules();
		const state = fixture();
		write(join(state.root, '.github', 'workflows', 'unsupported.yml'), `${addition}\n`);
		expect(() => verify(subject, state)).toThrow(/outside.*uses|literal|immutable|untracked/iu);
	});

	it.each([
		'.github/actions/classify-paths',
		'.github/actions/required-context',
		GATE,
	])('requires shared action %s to be declared as an exact caller', async (requiredAction) => {
		const subject = await modules();
		const state = fixture();
		state.value.callers = state.value.callers.filter(({ action }) => action !== requiredAction);
		write(state.manifestPath, JSON.stringify(state.value));
		expect(() => verify(subject, state)).toThrow(/required.*action|gate.*caller/iu);
	});
});

describe('published action contract', () => {
	it('runs as an isolated action, writes one exact receipt output, and has no repository-root dependency', async () => {
		const state = fixture();
		const isolatedRoot = temporaryRoot();
		const isolatedAction = join(isolatedRoot, 'action');
		cpSync(ACTION_DIRECTORY, isolatedAction, { recursive: true });
		const output = join(isolatedRoot, 'github-output');
		const result = spawnSync(process.execPath, [join(isolatedAction, 'main.mjs')], {
			encoding: 'utf8',
			env: {
				...process.env,
				GITHUB_WORKSPACE: state.root,
				GITHUB_OUTPUT: output,
				INPUT_MANIFEST: state.manifestPath,
				YESID_ACTION_REPOSITORY: REPOSITORY,
				YESID_ACTION_REF: SHA,
			},
		});
		expect(result.status, result.stderr).toBe(0);
		const line = readFileSync(output, 'utf8');
		expect(line.match(/^receipt=/gmu)).toHaveLength(1);
		expect(JSON.parse(line.slice('receipt='.length))).toMatchObject({
			schema: 1,
			source: { repository: REPOSITORY, sha: SHA },
		});
	});

	it('ships a no-install composite wrapper that forwards GitHub action identity', () => {
		const metadata = readFileSync(ACTION_METADATA, 'utf8');
		expect(metadata).toMatch(/using:\s*composite/u);
		expect(metadata).toContain('${{ github.action_repository }}');
		expect(metadata).toContain('${{ github.action_ref }}');
		expect(metadata).toContain('YESID_ACTION_PATH: ${{ github.action_path }}');
		expect(metadata).toContain('node "$YESID_ACTION_PATH/main.mjs"');
		expect(metadata).not.toContain('node "${{ github.action_path }}');
		expect(metadata).not.toMatch(/uses:|checkout|bun install|npm install|pnpm install/iu);
	});

	it('documents only full-SHA remote action callers and the fresh-clone verification command', () => {
		const documentation = readFileSync(DOCUMENTATION, 'utf8');
		for (const action of [
			'.github/actions/classify-paths',
			'.github/actions/required-context',
			'.github/actions/shared-tooling-drift',
		]) {
			expect(documentation).toContain(`mgkdante/yesid.dev-design/${action}@<FULL_40_CHARACTER_COMMIT_SHA>`);
		}
		expect(documentation).toContain('bun install --frozen-lockfile');
		expect(documentation).toContain('tests/shared-tooling-drift.test.ts');
		expect(documentation).not.toMatch(/@(main|master|v\d+(?:\.\d+)*)\b/u);
	});

	it('keeps the neutral action free of consumer identities and app policy', () => {
		const action = [
			readFileSync(ACTION_METADATA, 'utf8'),
			...readdirSync(ACTION_DIRECTORY)
				.filter((path) => path.endsWith('.mjs'))
				.map((path) => readFileSync(join(ACTION_DIRECTORY, path), 'utf8')),
		].join('\n');
		expect(action).not.toMatch(/transit|yesid-dev|apps\/web|apps\/cms|cloudflare|vercel/iu);
	});
});
