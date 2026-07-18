import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { brandHexViolations, styleRegressionViolations } from '@yesid/gates';
import { describe, expect, it } from 'vitest';
import { GALLERY_BRAND_HEXES, GALLERY_FORBIDDEN } from './gates/policy.js';

const srcRoot = fileURLToPath(new URL('.', import.meta.url));
const brandHexDefinitionFiles = new Set([
	join(srcRoot, 'app.css'),
	join(srcRoot, 'gates/policy.ts'),
]);

describe('gallery brand gates', () => {
	it('uses tokens instead of raw brand hex values', () => {
		const result = brandHexViolations({
			root: srcRoot,
			hexes: GALLERY_BRAND_HEXES,
			allowlist: brandHexDefinitionFiles,
		});

		expect(result.fileCount).toBeGreaterThan(0);
		expect(result.violations, result.violations.join('\n')).toEqual([]);
	});

	it('avoids the gallery forbidden style patterns', () => {
		const violations = styleRegressionViolations({
			root: srcRoot,
			forbidden: GALLERY_FORBIDDEN,
		}).filter(({ hits }) => hits.length > 0);

		expect(
			violations,
			violations.map(({ reason, hits }) => `${reason}: ${hits.join(', ')}`).join('\n'),
		).toEqual([]);
	});
});
