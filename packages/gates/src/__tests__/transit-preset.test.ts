// v0.2.0 dogfood: the transit AA preset runs against THIS repo's tokens.json
// (which gained the dataviz scale in v0.2.0). Proves the reconciled dataviz
// values satisfy the same contrast contract transit enforces at home.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runContrastPairs } from '../engines/contrastPairs.js';
import { TRANSIT_AA_PAIRS } from '../presets/transit.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('transit preset vs the reconciled tokens.json (v0.2.0 dataviz)', () => {
	const tokens = JSON.parse(
		readFileSync(resolve(here, '../../../tokens/tokens.json'), 'utf-8'),
	) as Record<string, unknown>;

	it('all transit AA pairs (text + dataviz-on-card) pass', () => {
		const results = runContrastPairs(tokens, TRANSIT_AA_PAIRS);
		const failures = results.filter((r) => !r.pass);
		expect(
			failures,
			failures.map((f) => `${f.label} computed ${f.ratio.toFixed(2)}:1 < ${f.floor}`).join('\n'),
		).toEqual([]);
	});
});
