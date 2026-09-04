import { describe, expect, it } from 'vitest';
import { posix, win32 } from 'node:path';

import { isPathWithin, relativePathFromRoot } from '../engines/walk.js';

describe('gate path semantics', () => {
	it('recognizes POSIX descendants without accepting sibling prefixes', () => {
		expect(isPathWithin('/repo/src', '/repo/src/lib/file.ts', posix)).toBe(true);
		expect(isPathWithin('/repo/src', '/repo/src-copy/file.ts', posix)).toBe(false);
		expect(isPathWithin('/repo/src', '/repo/file.ts', posix)).toBe(false);
	});

	it('recognizes win32 descendants without accepting sibling prefixes or another drive', () => {
		expect(isPathWithin('C:\\Repo\\src', 'c:\\repo\\src\\lib\\file.ts', win32)).toBe(true);
		expect(isPathWithin('C:\\repo\\src', 'C:\\repo\\src-copy\\file.ts', win32)).toBe(false);
		expect(isPathWithin('C:\\repo\\src', 'D:\\repo\\src\\file.ts', win32)).toBe(false);
	});

	it('normalizes POSIX and win32 diagnostics to repository-style separators', () => {
		expect(relativePathFromRoot('/repo/src', '/repo/src/lib/Feature.svelte', posix)).toBe(
			'lib/Feature.svelte',
		);
		expect(
			relativePathFromRoot(
				'C:\\repo\\src',
				'C:\\repo\\src\\lib\\Feature.svelte',
				win32,
			),
		).toBe('lib/Feature.svelte');
	});

	it('refuses to produce a diagnostic for a path outside the root', () => {
		expect(() => relativePathFromRoot('/repo/src', '/repo/secret.ts', posix)).toThrow(
			/path is outside root/iu,
		);
	});
});
