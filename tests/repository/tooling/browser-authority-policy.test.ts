import { describe, expect, it } from 'vitest';
import {
	BROWSER_AUTHORITY_ARCHIVE_LIMITS,
	inspectArchiveTree,
} from '../../../tools/browser-authority-dependency-policy.ts';

const object = 'a'.repeat(40);

function entry(mode: string, type: string, size: number | '-', path: string): string {
	return `${mode} ${type} ${object} ${size}\t${path}\0`;
}

describe('browser authority archive policy', () => {
	it('accepts regular files and trees within every bound', () => {
		const result = inspectArchiveTree(
			entry('040000', 'tree', '-', 'packages') +
				entry('100644', 'blob', 12, 'package.json') +
				entry('100755', 'blob', 24, 'tools/run.sh'),
		);

		expect(result).toEqual({
			blobBytes: 36,
			entries: 3,
			paths: ['packages', 'package.json', 'tools/run.sh'],
		});
	});

	it.each([
		['symlink', entry('120000', 'blob', 8, 'link')],
		['gitlink', entry('160000', 'commit', '-', 'submodule')],
	])('rejects an unsupported %s mode', (_label, input) => {
		expect(() => inspectArchiveTree(input)).toThrow('unsupported archive entry');
	});

	it('rejects a blob over the per-file limit', () => {
		expect(() =>
			inspectArchiveTree(
				entry(
					'100644',
					'blob',
					BROWSER_AUTHORITY_ARCHIVE_LIMITS.blobBytes + 1,
					'large.bin',
				),
			),
		).toThrow('per-file byte limit');
	});

	it('rejects aggregate blob bytes over the archive limit', () => {
		const count =
			Math.floor(
				BROWSER_AUTHORITY_ARCHIVE_LIMITS.totalBlobBytes /
					BROWSER_AUTHORITY_ARCHIVE_LIMITS.blobBytes,
			) + 1;
		const input = Array.from({ length: count }, (_, index) =>
			entry('100644', 'blob', BROWSER_AUTHORITY_ARCHIVE_LIMITS.blobBytes, `part-${index}.bin`),
		)
			.join('');
		expect(() => inspectArchiveTree(input)).toThrow('aggregate byte limit');
	});

	it('rejects more entries than the archive limit', () => {
		const input = Array.from(
			{ length: BROWSER_AUTHORITY_ARCHIVE_LIMITS.entries + 1 },
			(_, index) => entry('100644', 'blob', 0, `file-${index}`),
		).join('');
		expect(() => inspectArchiveTree(input)).toThrow('entry limit');
	});
});
