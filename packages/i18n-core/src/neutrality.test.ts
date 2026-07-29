import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = fileURLToPath(new URL('.', import.meta.url));
const FORBIDDEN = [
	/\$app\//u,
	/\$lib\//u,
	/\bfrom\s+['"]svelte(?:\/|['"])/u,
	/\byesid\.dev\b/iu,
	/\btransit\b/iu,
	/\b(?:SUPPORTED|PREFIX|PUBLISHED)_LOCALES\b/u,
	/(?:manifest\.webmanifest|sitemap\.xml|robots\.txt|\/api\/|\/og\/|\/work\b)/u,
];

function productionTypeScriptFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return productionTypeScriptFiles(path);
		return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')
			? [path]
			: [];
	});
}

describe('@yesid/i18n-core neutrality', () => {
	it('contains no framework virtual modules, consumer identity, or product routing policy', () => {
		for (const path of productionTypeScriptFiles(SOURCE_ROOT)) {
			const source = readFileSync(path, 'utf8');
			for (const forbidden of FORBIDDEN) {
				expect.soft(source, `${relative(SOURCE_ROOT, path)} matched ${forbidden}`).not.toMatch(
					forbidden,
				);
			}
		}
	});
});
