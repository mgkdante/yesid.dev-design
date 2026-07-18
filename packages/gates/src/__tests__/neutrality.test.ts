import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourceRoot = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
	exports: Record<string, unknown>;
};

function productionTypeScriptFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			return entry.name === '__tests__' ? [] : productionTypeScriptFiles(path);
		}
		return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
	});
}

describe('@yesid/gates neutrality', () => {
	it('publishes engines only and leaves product presets to consumers', () => {
		expect(Object.keys(manifest.exports)).toEqual(['.']);
		expect(existsSync(new URL('../presets', import.meta.url))).toBe(false);
	});

	it('contains no app-named policy symbols in its production source', () => {
		const offenders = productionTypeScriptFiles(sourceRoot).flatMap((path) => {
			const matches = readFileSync(path, 'utf8').match(/\b(?:YESID|TRANSIT)_/g) ?? [];
			return matches.map((symbol) => ({ path: relative(sourceRoot, path), symbol }));
		});
		expect(offenders).toEqual([]);
	});
});
