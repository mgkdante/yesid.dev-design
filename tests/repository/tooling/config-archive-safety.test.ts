import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { parseConfigArchive } from '../../../tools/config-archive.js';

function octal(value: number, width: number): string {
	return `${value.toString(8).padStart(width - 1, '0')}\0`;
}

function tar(entries: ReadonlyArray<{ path: string; content: Buffer; type?: '0' | '5' }>): Buffer {
	const chunks: Buffer[] = [];
	for (const entry of entries) {
		const header = Buffer.alloc(512);
		header.write(entry.path, 0, 100, 'utf8');
		header.write(octal(0o644, 8), 100, 8, 'ascii');
		header.write(octal(0, 8), 108, 8, 'ascii');
		header.write(octal(0, 8), 116, 8, 'ascii');
		header.write(octal(entry.content.length, 12), 124, 12, 'ascii');
		header.write(octal(0, 12), 136, 12, 'ascii');
		header.fill(0x20, 148, 156);
		header.write(entry.type ?? '0', 156, 1, 'ascii');
		header.write('ustar\0', 257, 6, 'binary');
		header.write('00', 263, 2, 'ascii');
		const checksum = header.reduce((sum, byte) => sum + byte, 0);
		header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
		chunks.push(
			header,
			entry.content,
			Buffer.alloc((512 - (entry.content.length % 512)) % 512),
		);
	}
	chunks.push(Buffer.alloc(1_024));
	return Buffer.concat(chunks);
}

describe('config archive safety boundary', () => {
	it('parses a complete small gzip-compressed POSIX ustar before materialization', () => {
		const archive = gzipSync(
			tar([
				{ path: 'package/', content: Buffer.alloc(0), type: '5' },
				{ path: 'package/package.json', content: Buffer.from('{"name":"@yesid/config"}\n') },
			]),
		);

		expect(parseConfigArchive(archive)).toEqual([
			{ path: 'package/', type: 'directory', content: Buffer.alloc(0) },
			{
				path: 'package/package.json',
				type: 'file',
				content: Buffer.from('{"name":"@yesid/config"}\n'),
			},
		]);
	});

	it('rejects compressed input beyond 8 MiB before inflation', () => {
		expect(() => parseConfigArchive(Buffer.alloc(8 * 1024 * 1024 + 1))).toThrow(
			/compressed size limit.*8 MiB/iu,
		);
	});

	it('rejects a high-expansion gzip stream beyond 2 MiB', () => {
		const archive = gzipSync(Buffer.alloc(2 * 1024 * 1024 + 512));

		expect(() => parseConfigArchive(archive)).toThrow(/expanded size limit.*2 MiB/iu);
	});

	it('rejects a member beyond 256 KiB', () => {
		const archive = gzipSync(
			tar([{ path: 'package/large.txt', content: Buffer.alloc(256 * 1024 + 1) }]),
		);

		expect(() => parseConfigArchive(archive)).toThrow(/member size limit.*256 KiB/iu);
	});

	it('rejects aggregate member bytes beyond 1 MiB', () => {
		const entries = Array.from({ length: 5 }, (_, index) => ({
			path: `package/member-${index}.txt`,
			content: Buffer.alloc(220 * 1024),
		}));

		expect(() => parseConfigArchive(gzipSync(tar(entries)))).toThrow(
			/payload size limit.*1 MiB/iu,
		);
	});

	it('rejects a sixty-fifth archive entry', () => {
		const entries = Array.from({ length: 65 }, (_, index) => ({
			path: `package/member-${index}.txt`,
			content: Buffer.alloc(0),
		}));

		expect(() => parseConfigArchive(gzipSync(tar(entries)))).toThrow(/entry limit.*64/iu);
	});

	it('accepts the exact expanded, member, payload, and entry limits', () => {
		const payloadEntries = Array.from({ length: 4 }, (_, index) => ({
			path: `package/payload-${index}.bin`,
			content: Buffer.alloc(256 * 1024),
		}));
		expect(parseConfigArchive(gzipSync(tar(payloadEntries)))).toHaveLength(4);

		const entryLimit = Array.from({ length: 64 }, (_, index) => ({
			path: `package/entry-${index}.txt`,
			content: Buffer.alloc(0),
		}));
		expect(parseConfigArchive(gzipSync(tar(entryLimit)))).toHaveLength(64);

		const smallTar = tar([{ path: 'package/exact.txt', content: Buffer.from('exact\n') }]);
		const exactExpanded = Buffer.alloc(2 * 1024 * 1024);
		smallTar.copy(exactExpanded);
		expect(parseConfigArchive(gzipSync(exactExpanded))).toHaveLength(1);
	});
});
