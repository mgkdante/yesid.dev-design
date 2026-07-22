import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const CONFIG_TAG = 'config-v0.2.0';
const CONFIG_VERSION = '0.2.0';
const CONFIG_FILES = [
	'README.md',
	'LICENSE',
	'CHANGELOG.md',
	'tsconfig/base.json',
	'tsconfig/library.json',
	'tsconfig/svelte-kit.json',
	'turbo/base.json',
	'svelte/project-runes.js',
	'svelte/project-runes.d.ts',
] as const;
const CONFIG_MANIFEST_URL = new URL('../../../packages/config/package.json', import.meta.url);
const CONFIG_ROOT = fileURLToPath(new URL('../../../packages/config/', import.meta.url));
const ROOT_MANIFEST_URL = new URL('../../../package.json', import.meta.url);
const CONFIG_WORKFLOW_URL = new URL('../../../.github/workflows/config-release.yml', import.meta.url);
const CONFIG_RELEASE_TOOL = fileURLToPath(
	new URL('../../../tools/config-release.ts', import.meta.url),
);
const scratch: string[] = [];

function tempDir(prefix = 'yesid-config-release-test-'): string {
	const path = mkdtempSync(join(tmpdir(), prefix));
	scratch.push(path);
	return path;
}

function write(path: string, content: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content, 'utf8');
}

function git(root: string, ...args: string[]): string {
	const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
	if (result.status !== 0) throw new Error(result.stderr || result.stdout);
	return result.stdout.trim();
}

function manifest(
	name: string,
	version: string,
	files: readonly string[] = ['README.md', 'LICENSE', 'CHANGELOG.md'],
): string {
	const exports = Object.fromEntries([
		['./package.json', './package.json'],
		...files
			.filter((path) => path.endsWith('.json'))
			.map((path) => [`./${path}`, `./${path}`]),
		...(files.includes('svelte/project-runes.js')
			? [
					[
						'./svelte/project-runes.js',
						{
							types: './svelte/project-runes.d.ts',
							default: './svelte/project-runes.js',
						},
					],
				]
			: []),
	]);
	return `${JSON.stringify({
		name,
		version,
		private: true,
		type: 'module',
		files,
		exports,
	}, null, '\t')}\n`;
}

function repository(configVersion = CONFIG_VERSION, tag = `config-v${configVersion}`): {
	root: string;
	tagObject: string;
	peeledCommit: string;
} {
	const root = join(tempDir(), 'repository');
	mkdirSync(root);
	git(root, 'init', '-q', '-b', 'main');
	git(root, 'config', 'user.name', 'Config Release Test');
	git(root, 'config', 'user.email', 'config-release-test@example.com');
	write(join(root, 'package.json'), manifest('yesid-dev-design', '9.9.9'));
	write(
		join(root, 'packages/config/package.json'),
		manifest('@yesid/config', configVersion, CONFIG_FILES),
	);
	write(join(root, 'packages/config/README.md'), '# Config package\n');
	write(join(root, 'packages/config/LICENSE'), 'MIT\n');
	write(join(root, 'packages/config/CHANGELOG.md'), '# Changelog\n');
	for (const path of CONFIG_FILES.slice(3)) {
		write(
			join(root, 'packages/config', path),
			readFileSync(join(CONFIG_ROOT, path), 'utf8'),
		);
	}
	write(join(root, 'packages/config/.env'), 'DO_NOT_SHIP=secret\n');
	write(join(root, 'packages/config/secret.txt'), 'also excluded\n');
	symlinkSync('secret.txt', join(root, 'packages/config/secret-link'));
	for (const name of ['tokens', 'motion', 'gates', 'seo-kit', 'ui']) {
		write(join(root, `packages/${name}/package.json`), manifest(`@yesid/${name}`, '9.9.9'));
	}
	git(root, 'add', '.');
	git(root, 'commit', '-qm', 'config release fixture');
	git(root, 'tag', '-a', tag, '-m', tag);
	git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
	return {
		root,
		tagObject: git(root, 'rev-parse', `refs/tags/${tag}`),
		peeledCommit: git(root, 'rev-parse', `refs/tags/${tag}^{commit}`),
	};
}

function runTool(
	command: 'build' | 'verify',
	repositoryRoot: string,
	archive: string,
	tag = CONFIG_TAG,
): { status: number | null; stdout: string; stderr: string } {
	const result = spawnSync(
		'bun',
		[
			CONFIG_RELEASE_TOOL,
			command,
			'--tag',
			tag,
			command === 'build' ? '--output' : '--archive',
			archive,
			'--repository-root',
			repositoryRoot,
		],
		{ encoding: 'utf8' },
	);
	return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function tar(root: string, ...args: string[]): string {
	const result = spawnSync('tar', args, { cwd: root, encoding: 'utf8' });
	if (result.status !== 0) throw new Error(result.stderr || result.stdout);
	return result.stdout;
}

afterEach(() => {
	for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('@yesid/config distribution boundary', () => {
	it('owns an independently versioned neutral configuration release line', () => {
		expect(existsSync(CONFIG_MANIFEST_URL)).toBe(true);
		const manifestValue = JSON.parse(readFileSync(CONFIG_MANIFEST_URL, 'utf8')) as {
			name?: unknown;
			version?: unknown;
			files?: unknown;
			exports?: unknown;
		};
		expect(manifestValue).toMatchObject({
			name: '@yesid/config',
			version: CONFIG_VERSION,
			files: CONFIG_FILES,
			exports: { './package.json': './package.json' },
		});
		const rootManifest = JSON.parse(readFileSync(ROOT_MANIFEST_URL, 'utf8')) as {
			version: string;
			scripts: Record<string, string>;
		};
		expect(rootManifest.scripts).toMatchObject({
			'config:release:prepare': 'bun tools/config-version.ts prepare',
			'config:release:check': 'bun tools/config-version.ts check',
			'config:release:build': 'bun tools/config-release.ts build',
			'config:release:verify': 'bun tools/config-release.ts verify',
		});
	});

	it('owns a distinct immutable config-v tag workflow without changing the v release lane', () => {
		const workflow = readFileSync(CONFIG_WORKFLOW_URL, 'utf8');
		expect(workflow).toMatch(/tags:\s*\['config-v\*'\]/u);
		expect(workflow).toContain('bun run config:release:build');
		expect(workflow).toContain('bun run config:release:verify');
		expect(workflow).toContain('yesid-${RELEASE_TAG}.tgz');
		expect(workflow).toContain('.tgz.sha256');
		expect(workflow).toContain('built-config-evidence.json');
		expect(workflow).toContain('draft-config-release.json');
		expect(workflow).toContain('downloaded-config-evidence.json');
		expect(workflow).toContain('gh release verify "$RELEASE_TAG"');
		expect(workflow.match(/gh release verify-asset/gu)).toHaveLength(2);
		expect(workflow).toContain('for attempt in {1..12}');
		expect(workflow).toContain('--prerelease');
		expect(workflow).toContain('.prerelease == $prerelease');
		expect(workflow).toContain('bun run config:release:check');
		expect(workflow).not.toMatch(/tags:\s*\['v\*'\]/u);
	});

	it('recovers only an exact failed first publication without moving or deleting its tag', () => {
		const workflow = readFileSync(CONFIG_WORKFLOW_URL, 'utf8');
		expect(workflow).toMatch(/permissions:\n\s+contents: read/u);
		expect(workflow).toMatch(
			/config-release:\n\s+if: github\.event_name == 'push' \|\| inputs\.mode == 'recover-first-publication'[\s\S]*?permissions:\n\s+actions: read\n\s+contents: write/u,
		);
		expect(workflow).toMatch(
			/config-verify:[\s\S]*?if: >-[\s\S]*?inputs\.mode == 'verify'[\s\S]*?permissions:\n\s+contents: read/u,
		);
		expect(workflow).toContain('recover-first-publication');
		expect(workflow).toContain('recovery_run_id:');
		expect(workflow).toContain('recovery_draft_id:');
		expect(workflow).toContain('immutable_settings_tag_object:');
		expect(workflow).toContain("RELEASE_MODE: ${{ github.event_name == 'push' && 'publish' || inputs.mode }}");
		expect(workflow).toContain('GITHUB_ACTOR');
		expect(workflow).toContain('GITHUB_TRIGGERING_ACTOR');
		expect(workflow).toContain('recovery must execute from exact current main');
		expect(workflow).toContain('actions/runs/${RECOVERY_RUN_ID}');
		expect(workflow).toContain('.event == "push"');
		expect(workflow).toContain('.path == ".github/workflows/config-release.yml"');
		expect(workflow).toContain('.head_branch == $tag');
		expect(workflow).toContain('.head_sha == $commit');
		expect(workflow).toContain('.conclusion == "failure"');
		expect(workflow).not.toContain('repos/${GITHUB_REPOSITORY}/immutable-releases');
		expect(workflow).toContain('Protect release tags');
		expect(workflow).toContain('gh api --paginate --slurp');
		expect(workflow).toContain('draft_found=false');
		expect(workflow).toContain('test "$draft_found" = true');
		expect(workflow).toContain('draft-config-verification');
		expect(workflow).toContain('cmp "$asset" "$draft_asset"');
		expect(workflow).toContain('cmp "$asset.sha256" "$draft_checksum"');
		expect(workflow).toContain('id: publication');
		expect(workflow).toContain('RELEASE_ID: ${{ needs.config-release.outputs.release_id }}');
		expect(workflow).toContain('test "$VERIFY_MODE" = "recover-first-publication"');
		expect(workflow).toContain('test "$GITHUB_EVENT_NAME" = "push"');
		expect(workflow).toContain('repos/${GITHUB_REPOSITORY}/releases/${RELEASE_ID}');
		expect(workflow).toContain('publication_visible=false');
		expect(workflow).toContain('test "$publication_visible" = true');
		expect(workflow).toMatch(
			/cmp "\$draft_projection" "\$final_draft_projection"[\s\S]*?git\/ref\/tags\/\$\{RELEASE_TAG\}[\s\S]*?gh api --method PATCH/u,
		);
		expect(workflow).not.toMatch(/git\s+(?:push|update-ref)|gh\s+release\s+delete/u);
	});

	it('builds deterministic config-only npm artifacts with a checksum and exact tag receipt', () => {
		const source = repository();
		const firstRoot = tempDir();
		const secondRoot = tempDir();
		const assetName = `yesid-${CONFIG_TAG}.tgz`;
		const firstPath = join(firstRoot, assetName);
		const secondPath = join(secondRoot, assetName);

		const first = runTool('build', source.root, firstPath);
		expect(first.status, `${first.stdout}\n${first.stderr}`).toBe(0);
		const second = runTool('build', source.root, secondPath);
		expect(second.status, `${second.stdout}\n${second.stderr}`).toBe(0);
		expect(readFileSync(firstPath)).toEqual(readFileSync(secondPath));

		const bytes = readFileSync(firstPath);
		const digest = createHash('sha256').update(bytes).digest('hex');
		expect(readFileSync(`${firstPath}.sha256`, 'utf8')).toBe(`${digest}  ${assetName}\n`);
		expect(JSON.parse(first.stdout)).toMatchObject({
			name: assetName,
			digest: `sha256:${digest}`,
			package: { name: '@yesid/config', version: CONFIG_VERSION },
			tag: {
				name: CONFIG_TAG,
				object: source.tagObject,
				peeledCommit: source.peeledCommit,
			},
		});

		const entries = tar(firstRoot, '-tzf', firstPath).trim().split('\n');
		expect(entries).toEqual([
			'package/',
			'package/package.json',
			...CONFIG_FILES.map((path) => `package/${path}`),
			'package/.yesid-config-release.json',
		]);
		expect(entries.join('\n')).not.toMatch(/(?:\.env|secret|symlink)/i);
		const receipt = JSON.parse(
			tar(firstRoot, '-xOzf', firstPath, 'package/.yesid-config-release.json'),
		);
		expect(receipt).toEqual({
			schema: 1,
			repository: 'github.com/mgkdante/yesid.dev-design',
			package: { name: '@yesid/config', version: CONFIG_VERSION },
			tag: {
				name: CONFIG_TAG,
				object: source.tagObject,
				peeledCommit: source.peeledCommit,
			},
		});

		const verified = runTool('verify', source.root, firstPath);
		expect(verified.status, `${verified.stdout}\n${verified.stderr}`).toBe(0);
		expect(JSON.parse(verified.stdout)).toEqual(JSON.parse(first.stdout));
	});

	it('installs and resolves the exact file asset in a clean consumer', () => {
		const source = repository();
		const asset = join(tempDir(), `yesid-${CONFIG_TAG}.tgz`);
		const built = runTool('build', source.root, asset);
		expect(built.status, `${built.stdout}\n${built.stderr}`).toBe(0);

		const consumer = tempDir('yesid-config-consumer-');
		write(
			join(consumer, 'package.json'),
			`${JSON.stringify({
				name: 'config-consumer',
				private: true,
				dependencies: { '@yesid/config': `file:${asset}` },
			}, null, '\t')}\n`,
		);
		const install = spawnSync('bun', ['install', '--ignore-scripts'], {
			cwd: consumer,
			encoding: 'utf8',
		});
		expect(install.status, `${install.stdout}\n${install.stderr}`).toBe(0);
		rmSync(join(consumer, 'node_modules'), { recursive: true, force: true });
		const frozenInstall = spawnSync(
			'bun',
			['install', '--frozen-lockfile', '--ignore-scripts'],
			{ cwd: consumer, encoding: 'utf8' },
		);
		expect(frozenInstall.status, `${frozenInstall.stdout}\n${frozenInstall.stderr}`).toBe(0);
		const resolved = spawnSync(
			'bun',
			[
				'-e',
				"const p=require('@yesid/config/package.json'); const b=require('@yesid/config/tsconfig/base.json'); const {projectRunes}=require('@yesid/config/svelte/project-runes.js'); const runes=projectRunes('/app'); console.log(`${p.name}@${p.version}:${b.compilerOptions.strict}:${runes({filename:'/app/src/a.svelte'})}:${runes({filename:'/app/node_modules/p/a.svelte'})}`)",
			],
			{ cwd: consumer, encoding: 'utf8' },
		);
		expect(resolved.status, `${resolved.stdout}\n${resolved.stderr}`).toBe(0);
		expect(resolved.stdout.trim()).toBe(`@yesid/config@${CONFIG_VERSION}:true:true:undefined`);
	});

	it('upgrades and downgrades config assets without changing the U4 release pin', () => {
		const firstSource = repository('0.1.0');
		const secondSource = repository('0.2.0');
		const assets = tempDir();
		const firstAsset = join(assets, 'yesid-config-v0.1.0.tgz');
		const secondAsset = join(assets, 'yesid-config-v0.2.0.tgz');
		expect(runTool('build', firstSource.root, firstAsset, 'config-v0.1.0').status).toBe(0);
		expect(runTool('build', secondSource.root, secondAsset, 'config-v0.2.0').status).toBe(0);

		const consumer = tempDir('yesid-config-upgrade-');
		const u4Receipt = join(consumer, 'vendor/design/manifest.json');
		write(u4Receipt, '{"schema":2,"provenance":{"tag":{"name":"v9.9.9"}}}\n');
		const frozenU4Receipt = readFileSync(u4Receipt);
		const install = (asset: string): void => {
			write(
				join(consumer, 'package.json'),
				`${JSON.stringify({
					name: 'config-upgrade-consumer',
					private: true,
					dependencies: { '@yesid/config': `file:${asset}` },
				}, null, '\t')}\n`,
			);
			const result = spawnSync('bun', ['install', '--ignore-scripts', '--force'], {
				cwd: consumer,
				encoding: 'utf8',
			});
			expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
			expect(readFileSync(u4Receipt)).toEqual(frozenU4Receipt);
		};
		const resolvedVersion = (): string => {
			const result = spawnSync(
				'bun',
				['-e', "console.log(require('@yesid/config/package.json').version)"],
				{ cwd: consumer, encoding: 'utf8' },
			);
			expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
			return result.stdout.trim();
		};

		install(firstAsset);
		expect(resolvedVersion()).toBe('0.1.0');
		install(secondAsset);
		expect(resolvedVersion()).toBe('0.2.0');
		install(firstAsset);
		expect(resolvedVersion()).toBe('0.1.0');
	});

	it('fails closed on config version drift and tampered artifact or checksum bytes', () => {
		const mismatched = repository('0.1.1', CONFIG_TAG);
		const mismatchAsset = join(tempDir(), `yesid-${CONFIG_TAG}.tgz`);
		const mismatch = runTool('build', mismatched.root, mismatchAsset);
		expect(mismatch.status).toBe(1);
		expect(mismatch.stderr).toContain(
			`tag ${CONFIG_TAG} does not match @yesid/config version 0.1.1`,
		);
		expect(existsSync(mismatchAsset)).toBe(false);

		const source = repository();
		const builtRoot = tempDir();
		const built = join(builtRoot, `yesid-${CONFIG_TAG}.tgz`);
		expect(runTool('build', source.root, built).status).toBe(0);
		const bytes = readFileSync(built);
		bytes[Math.floor(bytes.length / 2)] = (bytes[Math.floor(bytes.length / 2)] ?? 0) ^ 1;
		writeFileSync(built, bytes);
		const tampered = runTool('verify', source.root, built);
		expect(tampered.status).toBe(1);
		expect(tampered.stderr).toMatch(/checksum|deterministic tagged package/i);

		const checksumAsset = join(tempDir(), `yesid-${CONFIG_TAG}.tgz`);
		expect(runTool('build', source.root, checksumAsset).status).toBe(0);
		writeFileSync(`${checksumAsset}.sha256`, `${'0'.repeat(64)}  yesid-${CONFIG_TAG}.tgz\n`);
		const tamperedChecksum = runTool('verify', source.root, checksumAsset);
		expect(tamperedChecksum.status).toBe(1);
		expect(tamperedChecksum.stderr).toMatch(/checksum/i);
	});
});
