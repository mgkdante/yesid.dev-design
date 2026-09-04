import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
} from 'vitest';
import {
	mkdtempSync,
	mkdirSync,
	rmSync,
	symlinkSync,
	truncateSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { walk, walkFiltered } from '../engines/walk.js';

let fixtureRoot: string;

beforeEach(() => {
	fixtureRoot = mkdtempSync(join(tmpdir(), 'gate-walk-'));
});

afterEach(() => {
	rmSync(fixtureRoot, { recursive: true, force: true });
});

describe('gate filesystem walk', () => {
	it('returns matching files in deterministic lexical path order', () => {
		mkdirSync(join(fixtureRoot, 'nested'));
		writeFileSync(join(fixtureRoot, 'z.svelte'), 'z');
		writeFileSync(join(fixtureRoot, 'nested', 'b.svelte'), 'b');
		writeFileSync(join(fixtureRoot, 'nested', 'a.svelte'), 'a');
		writeFileSync(join(fixtureRoot, 'a.svelte'), 'a');

		expect(walk(fixtureRoot, ['.svelte'])).toEqual([
			join(fixtureRoot, 'a.svelte'),
			join(fixtureRoot, 'nested', 'a.svelte'),
			join(fixtureRoot, 'nested', 'b.svelte'),
			join(fixtureRoot, 'z.svelte'),
		]);
	});

	it.skipIf(process.platform === 'win32')('rejects a root path that is itself a symbolic link', () => {
		const realRoot = join(fixtureRoot, 'real');
		const alias = join(fixtureRoot, 'alias');
		mkdirSync(realRoot);
		writeFileSync(join(realRoot, 'inside.svelte'), 'inside');
		symlinkSync(realRoot, alias, 'dir');

		expect(() => walk(alias, ['.svelte'])).toThrow(/walk: refusing symbolic link.*alias/iu);
	});

	it.skipIf(process.platform === 'win32')('rejects a descendant symbolic link outside the root', () => {
		const scanRoot = join(fixtureRoot, 'scan');
		const outside = join(fixtureRoot, 'outside');
		mkdirSync(scanRoot);
		mkdirSync(outside);
		writeFileSync(join(outside, 'escaped.svelte'), 'escaped');
		symlinkSync(outside, join(scanRoot, 'alias'), 'dir');

		expect(() => walk(scanRoot, ['.svelte'])).toThrow(/walk: refusing symbolic link.*alias/iu);
	});

	it.skipIf(process.platform === 'win32')('rejects a symbolic-link cycle with a controlled policy error', () => {
		const scanRoot = join(fixtureRoot, 'scan');
		const nested = join(scanRoot, 'nested');
		mkdirSync(nested, { recursive: true });
		symlinkSync(scanRoot, join(nested, 'cycle'), 'dir');

		expect(() => walkFiltered(scanRoot, { extensions: ['.svelte'] })).toThrow(
			/walk: refusing symbolic link.*cycle/iu,
		);
	});

	it('rejects traversal deeper than sixteen descendant directories', () => {
		let current = fixtureRoot;
		for (let depth = 1; depth <= 17; depth += 1) {
			current = join(current, `d${String(depth).padStart(2, '0')}`);
			mkdirSync(current);
		}
		writeFileSync(join(current, 'deep.svelte'), 'deep');

		expect(() => walk(fixtureRoot, ['.svelte'])).toThrow(/walk: depth.*16/iu);
	});

	it('counts unmatched files against the 4,096-file traversal budget', () => {
		for (let index = 0; index < 4_097; index += 1) {
			writeFileSync(join(fixtureRoot, `${String(index).padStart(4, '0')}.txt`), '');
		}

		expect(() => walk(fixtureRoot, ['.svelte'])).toThrow(/walk: file count.*4,?096/iu);
	});

	it('counts unmatched bytes and does not partially append output when the byte budget fails', () => {
		const output = ['sentinel'];
		writeFileSync(join(fixtureRoot, 'a.svelte'), 'safe');
		const oversized = join(fixtureRoot, 'z.bin');
		writeFileSync(oversized, '');
		truncateSync(oversized, 32 * 1024 * 1024 + 1);

		expect(() => walk(fixtureRoot, ['.svelte'], output)).toThrow(
			/walk: aggregate bytes.*32 MiB/iu,
		);
		expect(output).toEqual(['sentinel']);
	});
});
