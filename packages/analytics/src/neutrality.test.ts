import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const PACKAGE_ROOT = fileURLToPath(new URL('../', import.meta.url));
const SOURCE_ROOT = join(PACKAGE_ROOT, 'src');
const FORBIDDEN = [
	new RegExp(['yesid', 'dev'].join('\\.'), 'iu'),
	new RegExp(`\\b${['trans', 'it'].join('')}\\b`, 'iu'),
	new RegExp(`\\${'$'}${['ap', 'p'].join('')}\\b`, 'u'),
	new RegExp(`\\${'$'}${['li', 'b'].join('')}\\b`, 'u'),
	new RegExp(`\\b(?:${['c', 'ms'].join('')}|${['loc', 'ale'].join('')})\\b`, 'iu'),
	new RegExp(
		[
			['contact', 'form', 'success'].join('_'),
			['booking', 'click'].join('_'),
			['direct', 'contact', 'click'].join('_'),
			['project', 'proof', 'click'].join('_'),
		].join('|'),
		'u',
	),
];

function sourceFiles(root: string): string[] {
	return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
		const path = join(root, entry.name);
		return entry.isDirectory() ? sourceFiles(path) : extname(path) === '.ts' ? [path] : [];
	});
}

describe('analytics package neutrality', () => {
	it('contains no consumer identity, framework aliases, copy, or product event names', () => {
		for (const path of sourceFiles(SOURCE_ROOT)) {
			const source = readFileSync(path, 'utf8');
			for (const forbidden of FORBIDDEN) {
				expect.soft(source, `${relative(PACKAGE_ROOT, path)} matched ${forbidden}`).not.toMatch(
					forbidden,
				);
			}
		}
	});
});
