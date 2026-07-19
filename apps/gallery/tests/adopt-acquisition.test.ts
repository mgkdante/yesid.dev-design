import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
import { afterEach, describe, expect, it } from 'vitest';

import {
	REPOSITORY_ID,
	acquireArchive,
	acquireRelease,
	acquireWorktree,
	type AcquiredSource,
} from '../../../tools/adopt/acquisition.js';

const REPOSITORY_NUMERIC_ID = 1_303_136_912;
const TAG = 'v1.2.3';
const TAG_OBJECT = '0123456789abcdef0123456789abcdef01234567';
const COMMIT = 'fedcba9876543210fedcba9876543210fedcba98';
const scratch: string[] = [];

function tempDir(): string {
	const path = mkdtempSync(join(tmpdir(), 'yesid-acquisition-test-'));
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

function makeTaggedWorktree(root: string): { tagObject: string; commit: string } {
	write(join(root, 'LICENSE'), 'license\n');
	write(join(root, 'tools', 'adopt.ts'), 'export {};\n');
	write(join(root, 'tools', 'adopt', 'contract.ts'), 'export {};\n');
	write(join(root, 'packages', 'tokens', 'package.json'), '{"name":"@yesid/tokens"}\n');
	git(root, 'init', '-q');
	git(root, 'config', 'user.name', 'Test');
	git(root, 'config', 'user.email', 'test@example.com');
	git(root, 'add', '.');
	git(root, 'commit', '-qm', 'fixture');
	git(root, 'tag', '-a', TAG, '-m', TAG);
	return {
		tagObject: git(root, 'rev-parse', `refs/tags/${TAG}^{tag}`),
		commit: git(root, 'rev-parse', 'HEAD'),
	};
}

function octal(value: number, width: number): string {
	return value.toString(8).padStart(width - 1, '0') + '\0';
}

function tar(
	entries: ReadonlyArray<{ path: string; content: string; type?: '0' | '2' | '5' }>,
): Buffer {
	const chunks: Buffer[] = [];
	for (const entry of entries) {
		const content = Buffer.from(entry.content);
		const header = Buffer.alloc(512);
		header.write(entry.path, 0, 100, 'utf8');
		header.write(octal(0o644, 8), 100, 8, 'ascii');
		header.write(octal(0, 8), 108, 8, 'ascii');
		header.write(octal(0, 8), 116, 8, 'ascii');
		header.write(octal(content.length, 12), 124, 12, 'ascii');
		header.write(octal(0, 12), 136, 12, 'ascii');
		header.fill(0x20, 148, 156);
		header.write(entry.type ?? '0', 156, 1, 'ascii');
		header.write('ustar\0', 257, 6, 'binary');
		header.write('00', 263, 2, 'ascii');
		const checksum = header.reduce((sum, byte) => sum + byte, 0);
		header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
		chunks.push(header, content, Buffer.alloc((512 - (content.length % 512)) % 512));
	}
	chunks.push(Buffer.alloc(1024));
	return Buffer.concat(chunks);
}

function archiveFixture(
	tag = TAG,
	tagObject = TAG_OBJECT,
	commit = COMMIT,
	extra: ReadonlyArray<{ path: string; content: string; type?: '0' | '2' | '5' }> = [],
): Buffer {
	const root = `yesid.dev-design-${tag}`;
	const receipt = JSON.stringify({
		schema: 1,
		repository: REPOSITORY_ID,
		tag: { name: tag, object: tagObject, peeledCommit: commit },
	});
	return tar([
		{ path: `${root}/.yesid-release.json`, content: `${receipt}\n` },
		{ path: `${root}/LICENSE`, content: 'license\n' },
		{ path: `${root}/tools/adopt.ts`, content: 'export {};\n' },
		{ path: `${root}/tools/adopt/contract.ts`, content: 'export {};\n' },
		{
			path: `${root}/packages/tokens/package.json`,
			content: '{"name":"@yesid/tokens"}\n',
		},
		...extra,
	]);
}

function releaseFetch(
	archive: Buffer,
	overrides: {
		repository?: Record<string, unknown>;
		release?: Record<string, unknown>;
		ref?: Record<string, unknown>;
		tag?: Record<string, unknown>;
	} = {},
): typeof fetch {
	const digest = `sha256:${createHash('sha256').update(archive).digest('hex')}`;
	const repository = {
		id: REPOSITORY_NUMERIC_ID,
		full_name: 'mgkdante/yesid.dev-design',
		private: false,
		...overrides.repository,
	};
	const release = {
		tag_name: TAG,
		draft: false,
		immutable: true,
		assets: [
			{
				id: 42,
				name: `yesid.dev-design-${TAG}.tar`,
				state: 'uploaded',
				size: archive.length,
				digest,
			},
		],
		...overrides.release,
	};
	const ref = {
		ref: `refs/tags/${TAG}`,
		object: { type: 'tag', sha: TAG_OBJECT },
		...overrides.ref,
	};
	const annotatedTag = {
		tag: TAG,
		object: { type: 'commit', sha: COMMIT },
		...overrides.tag,
	};
	return (async (input: string | URL | Request) => {
		const url = String(input);
		if (url.endsWith('/repos/mgkdante/yesid.dev-design')) return Response.json(repository);
		if (url.includes('/releases/tags/')) return Response.json(release);
		if (url.includes('/git/ref/tags/')) return Response.json(ref);
		if (url.includes('/git/tags/')) return Response.json(annotatedTag);
		if (url.includes('/releases/assets/42')) return new Response(new Uint8Array(archive));
		return new Response('not found', { status: 404 });
	}) as typeof fetch;
}

afterEach(() => {
	for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});

function close(acquired: AcquiredSource): void {
	acquired.cleanup();
}

describe('worktree acquisition', () => {
	it('binds a clean annotated tag object to its peeled HEAD commit', () => {
		const root = tempDir();
		const expected = makeTaggedWorktree(root);
		const acquired = acquireWorktree(root, TAG);
		const snapshot = acquired.source;
		try {
			expect(snapshot).not.toBe(root);
			expect(acquired.provenance).toEqual({
				mode: 'worktree',
				tag: { name: TAG, object: expected.tagObject, peeledCommit: expected.commit },
				asset: null,
			});
		} finally {
			close(acquired);
		}
		expect(existsSync(snapshot)).toBe(false);
	});

	it('excludes ignored files by snapshotting the peeled Git tree', () => {
		const root = tempDir();
		makeTaggedWorktree(root);
		write(join(root, '.git', 'info', 'exclude'), 'ignored.txt\n');
		write(join(root, 'ignored.txt'), 'not part of the tag\n');

		const acquired = acquireWorktree(root, TAG);
		try {
			expect(existsSync(join(acquired.source, 'ignored.txt'))).toBe(false);
		} finally {
			close(acquired);
		}
	});

	it('ignores assume-unchanged mutations by snapshotting the peeled Git tree', () => {
		const root = tempDir();
		makeTaggedWorktree(root);
		git(root, 'update-index', '--assume-unchanged', 'LICENSE');
		write(join(root, 'LICENSE'), 'hidden mutation\n');

		const acquired = acquireWorktree(root, TAG);
		try {
			expect(readFileSync(join(acquired.source, 'LICENSE'), 'utf8')).toBe('license\n');
		} finally {
			close(acquired);
		}
	});

	it('remains immutable when the originating worktree changes after acquisition', () => {
		const root = tempDir();
		makeTaggedWorktree(root);
		const acquired = acquireWorktree(root, TAG);
		try {
			write(join(root, 'LICENSE'), 'later mutation\n');
			expect(readFileSync(join(acquired.source, 'LICENSE'), 'utf8')).toBe('license\n');
		} finally {
			close(acquired);
		}
	});

	it('rejects a dirty or lightweight-tagged worktree', () => {
		const dirty = tempDir();
		makeTaggedWorktree(dirty);
		write(join(dirty, 'untracked.txt'), 'dirty\n');
		expect(() => acquireWorktree(dirty, TAG)).toThrow(/clean worktree/i);

		const lightweight = tempDir();
		makeTaggedWorktree(lightweight);
		git(lightweight, 'tag', '-d', TAG);
		git(lightweight, 'tag', TAG);
		expect(() => acquireWorktree(lightweight, TAG)).toThrow(/annotated tag/i);
	});
});

describe('archive acquisition', () => {
	it('extracts a bounded regular-file archive with an embedded receipt', () => {
		const root = tempDir();
		const path = join(root, 'release.tar');
		writeFileSync(path, archiveFixture());
		const acquired = acquireArchive(path, TAG);
		try {
			expect(acquired.provenance).toEqual({
				mode: 'archive',
				tag: { name: TAG, object: TAG_OBJECT, peeledCommit: COMMIT },
				asset: null,
			});
			expect(readFileSync(join(acquired.source, 'LICENSE'), 'utf8')).toBe('license\n');
		} finally {
			close(acquired);
		}
	});

	it.each([
		['traversal', [{ path: `yesid.dev-design-${TAG}/../escape`, content: 'bad' }]],
		['link', [{ path: `yesid.dev-design-${TAG}/link`, content: '', type: '2' as const }]],
	])('rejects %s entries before extraction', (_label, entries) => {
		const root = tempDir();
		const path = join(root, 'bad.tar');
		writeFileSync(path, archiveFixture(TAG, TAG_OBJECT, COMMIT, entries));
		expect(() => acquireArchive(path, TAG)).toThrow(/unsafe archive/i);
	});

	it('accepts canonical POSIX ustar root and directory entries with trailing slashes', () => {
		const root = tempDir();
		const path = join(root, 'directories.tar');
		const archiveRoot = `yesid.dev-design-${TAG}`;
		writeFileSync(
			path,
			archiveFixture(TAG, TAG_OBJECT, COMMIT, [
				{ path: `${archiveRoot}/`, content: '', type: '5' },
				{ path: `${archiveRoot}/tools/`, content: '', type: '5' },
				{ path: `${archiveRoot}/packages/`, content: '', type: '5' },
			]),
		);
		const acquired = acquireArchive(path, TAG);
		close(acquired);
	});

	it.each([
		['alternate data stream', `yesid.dev-design-${TAG}/tokens.json:secret`],
		['reserved device name', `yesid.dev-design-${TAG}/CON.json`],
		['trailing dot', `yesid.dev-design-${TAG}/tokens.`],
		['trailing space', `yesid.dev-design-${TAG}/tokens `],
	])('rejects Win32 %s path hazards', (_label, unsafePath) => {
		const root = tempDir();
		const path = join(root, 'win32-unsafe.tar');
		writeFileSync(
			path,
			archiveFixture(TAG, TAG_OBJECT, COMMIT, [{ path: unsafePath, content: 'bad' }]),
		);
		expect(() => acquireArchive(path, TAG)).toThrow(/unsafe archive path/i);
	});

	it('rejects a non-POSIX ustar version', () => {
		const root = tempDir();
		const path = join(root, 'bad-version.tar');
		const archive = archiveFixture();
		archive.write('99', 263, 2, 'ascii');
		archive.fill(0x20, 148, 156);
		const checksum = archive.subarray(0, 512).reduce((sum, byte) => sum + byte, 0);
		archive.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
		writeFileSync(path, archive);
		expect(() => acquireArchive(path, TAG)).toThrow(/POSIX ustar version/i);
	});

	it('rejects nonzero file padding', () => {
		const root = tempDir();
		const path = join(root, 'bad-padding.tar');
		const archive = archiveFixture();
		const receiptSize = Number.parseInt(
			archive.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim(),
			8,
		);
		archive[512 + receiptSize] = 1;
		writeFileSync(path, archive);
		expect(() => acquireArchive(path, TAG)).toThrow(/padding/i);
	});
});

describe('immutable Release acquisition', () => {
	it('binds repository, immutable release asset, annotated tag, bytes, and receipt', async () => {
		const archive = archiveFixture();
		const acquired = await acquireRelease(TAG, { fetch: releaseFetch(archive) });
		try {
			expect(acquired.provenance.mode).toBe('release');
			expect(acquired.provenance.tag).toEqual({
				name: TAG,
				object: TAG_OBJECT,
				peeledCommit: COMMIT,
			});
			expect(acquired.provenance.asset).toMatchObject({
				name: `yesid.dev-design-${TAG}.tar`,
				size: archive.length,
			});
		} finally {
			close(acquired);
		}
	});

	it.each([
		['mutable release', { release: { immutable: false } }],
		['wrong repository', { repository: { id: 1 } }],
		['lightweight tag', { ref: { object: { type: 'commit', sha: COMMIT } } }],
	] as const)('rejects %s provenance', async (_label, overrides) => {
		await expect(
			acquireRelease(TAG, { fetch: releaseFetch(archiveFixture(), overrides) }),
		).rejects.toThrow(/release provenance/i);
	});

	it('rejects downloaded bytes that do not match the asset digest', async () => {
		const archive = archiveFixture();
		const metadataArchive = Buffer.from(archive);
		metadataArchive[513] = (metadataArchive[513] ?? 0) ^ 1;
		const fetcher = releaseFetch(metadataArchive);
		const tamperedFetch = (async (input: string | URL | Request, init?: RequestInit) => {
			if (String(input).includes('/releases/assets/42')) {
				return new Response(new Uint8Array(archive));
			}
			return fetcher(input, init);
		}) as typeof fetch;
		await expect(acquireRelease(TAG, { fetch: tamperedFetch })).rejects.toThrow(/digest/i);
	});

	it('rejects oversized GitHub JSON before parsing it', async () => {
		const archive = archiveFixture();
		const baseFetch = releaseFetch(archive);
		const oversizedFetch = (async (input: string | URL | Request, init?: RequestInit) => {
			if (String(input).endsWith('/repos/mgkdante/yesid.dev-design')) {
				return new Response(JSON.stringify({ payload: 'x'.repeat(2 * 1024 * 1024) }));
			}
			return baseFetch(input, init);
		}) as typeof fetch;

		await expect(
			acquireRelease(TAG, { fetch: oversizedFetch, timeoutMs: 250 }),
		).rejects.toThrow(/API response exceeds size limit/i);
	});

	it(
		'aborts a stalled asset stream at the acquisition deadline',
		async () => {
			const archive = archiveFixture();
			const baseFetch = releaseFetch(archive);
			let cancelled = false;
			const stalledFetch = (async (input: string | URL | Request, init?: RequestInit) => {
				if (String(input).includes('/releases/assets/42')) {
					return new Response(
						new ReadableStream({
							cancel() {
								cancelled = true;
							},
						}),
					);
				}
				return baseFetch(input, init);
			}) as typeof fetch;

			await expect(
				acquireRelease(TAG, { fetch: stalledFetch, timeoutMs: 25 }),
			).rejects.toThrow(/timed out/i);
			expect(cancelled).toBe(true);
		},
		1_000,
	);
});
