import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { brandHexViolations, styleRegressionViolations } from '@yesid/gates';
import { YESID_FORBIDDEN } from '@yesid/gates/presets/yesid';
import { describe, expect, it } from 'vitest';

const srcRoot = fileURLToPath(new URL('.', import.meta.url));
const generatedTokenFiles = new Set([
	join(srcRoot, 'app.css'),
]);

describe('gallery brand gates', () => {
	it('uses tokens instead of raw brand hex values', () => {
		const result = brandHexViolations({
			root: srcRoot,
			allowlist: generatedTokenFiles,
		});

		expect(result.fileCount).toBeGreaterThan(0);
		expect(result.violations, result.violations.join('\n')).toEqual([]);
	});

	it('avoids the yesid forbidden style patterns', () => {
		const violations = styleRegressionViolations({
			root: srcRoot,
			forbidden: YESID_FORBIDDEN,
		}).filter(({ hits }) => hits.length > 0);

		expect(
			violations,
			violations.map(({ reason, hits }) => `${reason}: ${hits.join(', ')}`).join('\n'),
		).toEqual([]);
	});
});
