import { afterEach, describe, expect, it } from 'vitest';
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

import { adoptFromSource, checkAdoption, parseArgs } from '../../../tools/adopt.js';

const scratch: string[] = [];

function tempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), 'yesid-adopt-test-'));
	scratch.push(dir);
	return dir;
}

function write(path: string, content: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content, 'utf-8');
}

function makeSource(root: string): void {
	write(join(root, 'LICENSE'), 'test license\n');
	write(join(root, 'tools', 'adopt.ts'), "export * from './adopt/runtime.js';\n");
	write(join(root, 'tools', 'adopt', 'runtime.ts'), "export const schema = 2;\n");
	for (const name of ['tokens', 'motion', 'gates', 'ui']) {
		const dependencies = name === 'ui' ? { '@yesid/motion': 'workspace:*' } : undefined;
		const exports = {
			'.': {
				types: './src/runtime.ts',
				...(name === 'ui' ? { svelte: './src/runtime.ts' } : {}),
				default: './src/runtime.ts',
			},
		};
		write(
			join(root, 'packages', name, 'package.json'),
			JSON.stringify(
				{ name: `@yesid/${name}`, version: '0.0.0', exports, dependencies },
				null,
				2,
			) + '\n',
		);
		write(join(root, 'packages', name, 'src', 'runtime.ts'), `export const name = '${name}';\n`);
		write(join(root, 'packages', name, 'src', 'runtime.test.ts'), 'throw new Error();\n');
		write(join(root, 'packages', name, 'src', '__tests__', 'hidden.ts'), 'test only\n');
		write(join(root, 'packages', name, 'src', 'test-fixtures', 'hidden.ts'), 'fixture\n');
		write(join(root, 'packages', name, 'scripts', 'hidden.ts'), 'script\n');
		write(join(root, 'packages', name, 'research', 'hidden.md'), 'research\n');
		write(join(root, 'packages', name, 'node_modules', 'hidden.js'), 'dependency cache\n');
		write(join(root, 'packages', name, '.turbo', 'hidden.json'), 'build cache\n');
		write(join(root, 'packages', name, 'vitest.config.ts'), 'test config\n');
		write(join(root, 'packages', name, '.gitignore'), 'ignored\n');
	}
}

afterEach(() => {
	for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('adoptFromSource', () => {
	it('copies runtime files, applies Transit exclusions, rewrites workspace links, and writes a checkable manifest', () => {
		const root = tempDir();
		const source = join(root, 'source');
		const dest = join(root, 'product', 'vendor', 'design');
		makeSource(source);

		const manifest = adoptFromSource({
			source,
			dest,
			tag: 'v9.8.7',
			packages: ['tokens', 'motion', 'gates', 'ui'],
			commit: '0123456789abcdef0123456789abcdef01234567',
		});

		expect(Object.keys(manifest)).toEqual([
			'schema',
			'repository',
			'provenance',
			'packages',
			'exclusionPolicyDigest',
			'toolDigest',
			'treeHash',
		]);
		expect(manifest).toMatchObject({
			schema: 2,
			repository: 'github.com/mgkdante/yesid.dev-design',
			provenance: {
				mode: 'worktree',
				tag: {
					name: 'v9.8.7',
					object: '0123456789abcdef0123456789abcdef01234567',
					peeledCommit: '0123456789abcdef0123456789abcdef01234567',
				},
				asset: null,
			},
		});
		expect(manifest.exclusionPolicyDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
		expect(manifest.toolDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
		expect(manifest.treeHash).toMatch(/^sha256:[0-9a-f]{64}$/);
		expect(manifest.packages).toEqual(['tokens', 'motion', 'gates', 'ui']);
		expect(readFileSync(join(dest, 'LICENSE'), 'utf-8')).toBe('test license\n');
		expect(readFileSync(join(dest, 'tools', 'adopt.ts'), 'utf-8')).toContain("./adopt/runtime.js");
		expect(existsSync(join(dest, 'tools', 'adopt', 'runtime.ts'))).toBe(true);
		expect(existsSync(join(dest, 'ui', 'src', 'runtime.ts'))).toBe(true);
		expect(existsSync(join(dest, 'ui', 'src', 'runtime.test.ts'))).toBe(false);
		expect(existsSync(join(dest, 'ui', 'src', '__tests__', 'hidden.ts'))).toBe(false);
		expect(existsSync(join(dest, 'ui', 'src', 'test-fixtures', 'hidden.ts'))).toBe(false);
		expect(existsSync(join(dest, 'ui', 'scripts', 'hidden.ts'))).toBe(false);
		expect(existsSync(join(dest, 'ui', 'research', 'hidden.md'))).toBe(false);
		expect(existsSync(join(dest, 'ui', 'node_modules', 'hidden.js'))).toBe(false);
		expect(existsSync(join(dest, 'ui', '.turbo', 'hidden.json'))).toBe(false);
		expect(existsSync(join(dest, 'ui', 'vitest.config.ts'))).toBe(false);
		expect(existsSync(join(dest, 'ui', '.gitignore'))).toBe(false);
		expect(readFileSync(join(dest, 'ui', 'package.json'), 'utf-8')).toContain(
			'"@yesid/motion": "file:../motion"',
		);
		const adoptedUiManifest = JSON.parse(
			readFileSync(join(dest, 'ui', 'package.json'), 'utf-8'),
		) as {
			exports: Record<string, Record<string, string>>;
			dependencies: Record<string, string>;
		};
		expect(adoptedUiManifest.exports).toEqual({
			'.': {
				types: './src/runtime.ts',
				svelte: './src/runtime.ts',
				default: './src/runtime.ts',
			},
		});
		expect(Object.keys(adoptedUiManifest.exports['.'] ?? {})).toEqual([
			'types',
			'svelte',
			'default',
		]);
		expect(adoptedUiManifest.dependencies).toEqual({ '@yesid/motion': 'file:../motion' });
		expect(checkAdoption(dest)).toEqual(manifest);
	});

	it('detects changed, added, and removed vendor files through --check semantics', () => {
		const root = tempDir();
		const source = join(root, 'source');
		const dest = join(root, 'vendor', 'design');
		makeSource(source);
		const options: Parameters<typeof adoptFromSource>[0] = {
			source,
			dest,
			tag: 'v1.0.0',
			packages: ['tokens'],
			commit: 'fedcba9876543210fedcba9876543210fedcba98',
		};
		adoptFromSource(options);

		write(join(dest, 'tokens', 'src', 'runtime.ts'), 'hand edit\n');
		expect(() => checkAdoption(dest)).toThrow(/tree hash mismatch/);

		adoptFromSource(options);
		write(join(dest, 'tokens', 'src', 'extra.ts'), 'extra file\n');
		expect(() => checkAdoption(dest)).toThrow(/tree hash mismatch/);

		adoptFromSource(options);
		rmSync(join(dest, 'tokens', 'src', 'runtime.ts'));
		expect(() => checkAdoption(dest)).toThrow(/tree hash mismatch/);
	});

	it('rejects a package set with an omitted internal dependency', () => {
		const root = tempDir();
		const source = join(root, 'source');
		makeSource(source);

		expect(() =>
			adoptFromSource({
				source,
				dest: join(root, 'vendor', 'design'),
				tag: 'v1.0.0',
				packages: ['ui'],
				commit: 'fedcba9876543210fedcba9876543210fedcba98',
			}),
		).toThrow(/ui requires motion/);
	});

	it('refuses to replace an unrelated nonempty destination', () => {
		const root = tempDir();
		const source = join(root, 'source');
		const dest = join(root, 'product', 'src');
		makeSource(source);
		write(join(dest, 'keep.ts'), 'product source\n');

		expect(() =>
			adoptFromSource({
				source,
				dest,
				tag: 'v1.0.0',
				packages: ['tokens'],
				commit: 'fedcba9876543210fedcba9876543210fedcba98',
			}),
		).toThrow(/refusing to replace a non-adoption destination/);
		expect(readFileSync(join(dest, 'keep.ts'), 'utf-8')).toBe('product source\n');
	});
});

describe('parseArgs', () => {
	it('parses local-source adoption and check mode without accepting unknown input', () => {
		expect(
			parseArgs([
				'--tag',
				'v1.2.3',
				'--packages',
				'tokens,motion',
				'--dest',
				'vendor/design',
				'--source',
				'../yesid.dev-design',
			]),
		).toMatchObject({
			mode: 'adopt',
			tag: 'v1.2.3',
			packages: ['tokens', 'motion'],
			dest: 'vendor/design',
			source: '../yesid.dev-design',
		});
		expect(parseArgs(['--check', '--dest', 'vendor/design'])).toEqual({
			mode: 'check',
			dest: 'vendor/design',
		});
		expect(() => parseArgs(['--wat'])).toThrow(/unknown argument/);
		expect(() =>
			parseArgs(['--tag', 'v1.2.3', '--packages', 'tokens,unknown', '--dest', 'vendor/design']),
		).toThrow(/unknown package/);
	});
});
