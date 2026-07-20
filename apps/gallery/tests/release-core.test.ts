import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
	checkPreparedRelease,
	lockWorkspaceVersion,
	parseChangeFragment,
	parseChangeFragments,
	parseExactSemVer,
	parseReleaseTag,
	prepareRelease,
} from '../../../tools/release-core.js';
import { runReleaseCommand } from '../../../tools/release.js';

const scratch: string[] = [];
const RELEASED_WORKSPACES = ['tokens', 'motion', 'gates', 'ui'] as const;
const CONFIG_VERSION = '0.1.0';
const REPOSITORY_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

afterEach(() => {
	for (const directory of scratch.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function manifest(name: string, version: string, indentation: string | number = 2): string {
	return `${JSON.stringify({ name, version, private: true }, null, indentation)}\n`;
}

function lockfile(version: string): string {
	return `{
  "lockfileVersion": 1,
  "configVersion": 1,
  "workspaces": {
    "": {
      "name": "yesid-dev-design",
    },
    "apps/gallery": {
      "name": "@yesid/gallery",
      "version": "0.1.0",
    },
    "packages/gates": {
      "name": "@yesid/gates",
      "version": "${version}",
    },
    "packages/config": {
      "name": "@yesid/config",
      "version": "${CONFIG_VERSION}",
    },
    "packages/motion": {
      "name": "@yesid/motion",
      "version": "${version}",
    },
    "packages/tokens": {
      "name": "@yesid/tokens",
      "version": "${version}",
    },
    "packages/ui": {
      "name": "@yesid/ui",
      "version": "${version}",
    },
  },
}
`;
}

function write(path: string, source: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, source);
}

function createRepository(version = '0.7.0'): string {
	const root = mkdtempSync(join(tmpdir(), 'yesid-release-core-'));
	scratch.push(root);
	write(join(root, 'package.json'), manifest('yesid-dev-design', version, '\t'));
	for (const workspace of RELEASED_WORKSPACES) {
		write(
			join(root, 'packages', workspace, 'package.json'),
			manifest(`@yesid/${workspace}`, version),
		);
	}
	write(
		join(root, 'packages/config/package.json'),
		manifest('@yesid/config', CONFIG_VERSION),
	);
	write(
		join(root, 'packages/config/CHANGELOG.md'),
		'# Changelog\n\n## 0.1.0\n\nIndependent config release.\n',
	);
	write(join(root, 'apps/gallery/package.json'), manifest('@yesid/gallery', '0.1.0', '\t'));
	write(join(root, 'bun.lock'), lockfile(version));
	mkdirSync(join(root, '.changes'));
	return root;
}

function fragment(
	packages: readonly [string, string][] = [['@yesid/ui', 'patch']],
	description = 'Preserve the public UI contract.',
): string {
	return `---\n${packages.map(([name, bump]) => `${JSON.stringify(name)}: ${bump}`).join('\n')}\n---\n\n${description}\n`;
}

function addFragment(root: string, slug: string, source = fragment()): void {
	write(join(root, '.changes', `${slug}.md`), source);
}

function versions(root: string): Record<string, string> {
	return Object.fromEntries(
		[
			'package.json',
			...RELEASED_WORKSPACES.map((workspace) => `packages/${workspace}/package.json`),
			'packages/config/package.json',
			'apps/gallery/package.json',
		].map((path) => [path, JSON.parse(readFileSync(join(root, path), 'utf8')).version as string]),
	);
}

describe('strict release inputs', () => {
	it.each(['1.2', '01.2.3', '1.02.3', '1.2.03', '1.2.3-', '1.2.3-01', 'v1.2.3']) (
		'rejects non-SemVer version %s',
		(value) => {
			expect(() => parseExactSemVer(value)).toThrow(`Invalid exact SemVer: ${value}`);
		},
	);

	it('requires an exact v-prefixed release tag', () => {
		expect(parseReleaseTag('v0.7.0-rc.1')).toBe('0.7.0-rc.1');
		expect(() => parseReleaseTag('0.7.0-rc.1')).toThrow(
			'Invalid release tag 0.7.0-rc.1; expected v<exact SemVer>',
		);
	});

	it.each([
		['missing front matter', '.changes/bad.md', 'must start with release fragment front matter'],
		['---\n---\n\nDescription.\n', '.changes/empty-packages.md', 'must name at least one'],
		[fragment([['@yesid/unknown', 'patch']]), '.changes/unknown.md', 'unknown released package'],
		[fragment([['@yesid/ui', 'fix']]), '.changes/bump.md', 'invalid bump fix'],
		[fragment([['@yesid/ui', 'patch']], '   '), '.changes/empty.md', 'non-empty change description'],
		[
			fragment([
				['@yesid/ui', 'patch'],
				['@yesid/ui', 'minor'],
			]),
			'.changes/duplicate.md',
			'declares @yesid/ui more than once',
		],
	] as const)('rejects invalid fragment %#', (source, path, error) => {
		expect(() => parseChangeFragment(source, path)).toThrow(error);
	});

	it.each([
		'.changes/../escape.md',
		'.changes/nested/change.md',
		'.changes/UPPER.md',
		'.changes/-leading.md',
		'/tmp/change.md',
		'.changes\\escape.md',
	])('rejects path-unsafe fragment %s', (path) => {
		expect(() => parseChangeFragment(fragment(), path)).toThrow(
			`${path} is not a safe release fragment path`,
		);
	});

	it('rejects duplicate fragment identities before aggregation', () => {
		expect(() =>
			parseChangeFragments([
				{ path: '.changes/same.md', source: fragment() },
				{ path: '.changes/same.md', source: fragment() },
			]),
		).toThrow('Duplicate release fragment identity: same');
	});
});

describe('deterministic release preparation', () => {
	it('bootstraps the explicit unreleased 0.7.0 placeholder to rc.1', () => {
		const root = createRepository();
		write(
			join(root, '.config-changes/pending-config.md'),
			'---\nbump: patch\n---\n\nPreserve this config-only fragment.\n',
		);
		const configManifest = readFileSync(join(root, 'packages/config/package.json'));
		const configChangelog = readFileSync(join(root, 'packages/config/CHANGELOG.md'));
		const configFragment = readFileSync(join(root, '.config-changes/pending-config.md'));
		addFragment(root, 'z-motion', fragment([['@yesid/motion', 'patch']], 'Harden motion.'));
		addFragment(
			root,
			'a-ui',
			fragment([['@yesid/ui', 'minor']], 'Add UI.\n\nKeep it source shipped.'),
		);

		prepareRelease(root, '0.7.0-rc.1');

		expect(versions(root)).toEqual({
			'package.json': '0.7.0-rc.1',
			'packages/tokens/package.json': '0.7.0-rc.1',
			'packages/motion/package.json': '0.7.0-rc.1',
			'packages/gates/package.json': '0.7.0-rc.1',
			'packages/ui/package.json': '0.7.0-rc.1',
			'packages/config/package.json': CONFIG_VERSION,
			'apps/gallery/package.json': '0.1.0',
		});
		expect(readFileSync(join(root, 'bun.lock'), 'utf8')).toContain(
			'"version": "0.7.0-rc.1"',
		);
		expect(readFileSync(join(root, 'CHANGELOG.md'), 'utf8')).toBe(`# Changelog

## 0.7.0-rc.1

<!-- release-fragment: a-ui -->
- \`@yesid/ui\` (minor): Add UI.

  Keep it source shipped.

<!-- release-fragment: z-motion -->
- \`@yesid/motion\` (patch): Harden motion.
`);
		expect(existsSync(join(root, '.changes/a-ui.md'))).toBe(false);
		expect(existsSync(join(root, '.changes/z-motion.md'))).toBe(false);
		expect(readFileSync(join(root, 'packages/config/package.json'))).toEqual(configManifest);
		expect(readFileSync(join(root, 'packages/config/CHANGELOG.md'))).toEqual(configChangelog);
		expect(readFileSync(join(root, '.config-changes/pending-config.md'))).toEqual(configFragment);
		expect(lockWorkspaceVersion(readFileSync(join(root, 'bun.lock'), 'utf8'), 'packages/config')).toBe(
			CONFIG_VERSION,
		);
	});

	it('produces identical bytes independent of fragment creation order', () => {
		const left = createRepository();
		const right = createRepository();
		addFragment(left, 'z-last', fragment([['@yesid/tokens', 'patch']], 'Last.'));
		addFragment(left, 'a-first', fragment([['@yesid/ui', 'patch']], 'First.'));
		addFragment(right, 'a-first', fragment([['@yesid/ui', 'patch']], 'First.'));
		addFragment(right, 'z-last', fragment([['@yesid/tokens', 'patch']], 'Last.'));

		prepareRelease(left, '0.7.0-rc.1');
		prepareRelease(right, '0.7.0-rc.1');

		for (const path of [
			'CHANGELOG.md',
			'package.json',
			...RELEASED_WORKSPACES.map((workspace) => `packages/${workspace}/package.json`),
			'packages/config/package.json',
			'bun.lock',
		]) {
			expect(readFileSync(join(left, path))).toEqual(readFileSync(join(right, path)));
		}
	});

	it('rejects fragment reuse after the original file was consumed', () => {
		const root = createRepository();
		addFragment(root, 'one-use');
		prepareRelease(root, '0.7.0-rc.1');
		addFragment(root, 'one-use');

		expect(() => prepareRelease(root, '0.7.0-rc.2')).toThrow(
			'Release fragment one-use was already consumed',
		);
	});

	it('promotes rc.1 to stable without duplicating the fragment or changelog entry', () => {
		const root = createRepository();
		addFragment(root, 'one-use');
		prepareRelease(root, '0.7.0-rc.1');
		rmSync(join(root, '.changes'), { recursive: true });

		prepareRelease(root, '0.7.0');

		const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
		expect(changelog).toContain('## 0.7.0\n');
		expect(changelog).not.toContain('## 0.7.0-rc.1');
		expect(changelog.match(/release-fragment: one-use/gu)).toHaveLength(1);
		expect(changelog.match(/Preserve the public UI contract\./gu)).toHaveLength(1);
		expect(versions(root)['apps/gallery/package.json']).toBe('0.1.0');
	});

	it('rejects zero-fragment arbitrary bumps and the same-version no-op', () => {
		const root = createRepository();
		expect(() => prepareRelease(root, '0.7.1')).toThrow(
			'Release 0.7.1 has no fragments and is not a same-core prerelease promotion',
		);
		expect(() => prepareRelease(root, '0.7.0')).toThrow(
			'Release 0.7.0 has no fragments and is not a same-core prerelease promotion',
		);
	});

	it('rejects package, lockfile, and private Gallery version drift before writing', () => {
		const root = createRepository();
		addFragment(root, 'drift');
		write(join(root, 'packages/ui/package.json'), manifest('@yesid/ui', '9.9.9'));

		expect(() => prepareRelease(root, '0.7.0-rc.1')).toThrow(
			'Lockstep version drift: packages/ui/package.json is 9.9.9; expected 0.7.0',
		);
		expect(readFileSync(join(root, 'package.json'), 'utf8')).toContain('"version": "0.7.0"');
	});
});

describe('prepared release checks', () => {
	it('binds synchronized manifests, lockfile, changelog, fragments, version, and tag', () => {
		const root = createRepository();
		addFragment(root, 'checked');
		prepareRelease(root, '0.7.0-rc.1');
		rmSync(join(root, '.changes'), { recursive: true });

		expect(() =>
			checkPreparedRelease(root, { version: '0.7.0-rc.1', tag: 'v0.7.0-rc.1' }),
		).not.toThrow();
		expect(() =>
			checkPreparedRelease(root, { version: '0.7.0-rc.1', tag: 'v0.7.0' }),
		).toThrow('Release tag v0.7.0 does not match version 0.7.0-rc.1');
	});

	it('fails closed on pending fragments and duplicate consumed identities', () => {
		const root = createRepository();
		addFragment(root, 'checked');
		prepareRelease(root, '0.7.0-rc.1');
		addFragment(root, 'pending', fragment([['@yesid/tokens', 'patch']]));

		expect(() => checkPreparedRelease(root, { version: '0.7.0-rc.1' })).toThrow(
			'Prepared release still has pending fragments: .changes/pending.md',
		);

		rmSync(join(root, '.changes/pending.md'));
		const changelogPath = join(root, 'CHANGELOG.md');
		writeFileSync(
			changelogPath,
			`${readFileSync(changelogPath, 'utf8')}\n<!-- release-fragment: checked -->\n`,
		);
		expect(() => checkPreparedRelease(root, { version: '0.7.0-rc.1' })).toThrow(
			'Duplicate consumed release fragment identity: checked',
		);
	});
});

describe('release CLI contract', () => {
	it('prepares and checks an exact version through the thin command boundary', () => {
		const root = createRepository();
		addFragment(root, 'cli');

		expect(runReleaseCommand(['prepare', '--version', '0.7.0-rc.1'], root)).toBe(
			'Release 0.7.0-rc.1 prepared',
		);
		expect(
			runReleaseCommand(
				['check', '--version', '0.7.0-rc.1', '--tag', 'v0.7.0-rc.1'],
				root,
			),
		).toBe('Release 0.7.0-rc.1 is prepared for v0.7.0-rc.1');
	});

	it.each([
		[[], 'usage: bun tools/release.ts <prepare|check> --version <exact SemVer>'],
		[['prepare'], 'prepare requires --version followed by an exact SemVer'],
		[
			['prepare', '--version', '0.7.0', '--tag', 'v0.7.0'],
			'prepare does not accept --tag',
		],
		[['check', '--version', '0.7.0', '--unknown'], 'Unknown release argument: --unknown'],
	] as const)('rejects invalid argv %#', (args, error) => {
		expect(() => runReleaseCommand(args, createRepository())).toThrow(error);
	});

	it('publishes stable package-script entrypoints', () => {
		const manifest = JSON.parse(readFileSync(join(REPOSITORY_ROOT, 'package.json'), 'utf8')) as {
			scripts: Record<string, string>;
		};
		expect(manifest.scripts['release:prepare']).toBe('bun tools/release.ts prepare');
		expect(manifest.scripts['release:check']).toBe('bun tools/release.ts check');
	});
});
