// Frozen fixture self-tests prove each neutral engine catches its violation
// class and honors its allowlist or exemption contract.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { styleRegressionViolations } from '../engines/styleRegressions.js';
import { brandHexViolations, buildBrandHexPattern } from '../engines/brandHex.js';
import { datavizViolations } from '../engines/datavizDoctrine.js';
import { colorMixViolations, buildColorMixPatterns } from '../engines/colorMixFloors.js';
import { tvOnlyInUiViolations } from '../engines/tvOnlyInUi.js';
import { ratio } from '../engines/contrastPairs.js';
import { blankComments } from '../engines/comments.js';
import { FROZEN_BRAND_HEXES, FROZEN_FORBIDDEN } from './fixtures/neutral-policy.js';

let root: string;

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), 'gate-engines-'));
	mkdirSync(join(root, 'lib/components/ui/button'), { recursive: true });
	mkdirSync(join(root, 'lib/components/dataviz'), { recursive: true });
	mkdirSync(join(root, 'lib/styles'), { recursive: true });

	// styleRegressions + brandHex fixtures
	writeFileSync(join(root, 'Bad.svelte'), '<div class="bg-legacy text-foreground"></div>\n');
	writeFileSync(join(root, 'Good.svelte'), '<div class="bg-card text-foreground"></div>\n');
	writeFileSync(
		join(root, 'RawHex.svelte'),
		'<div style="color: #123ABC"></div>\n<!-- #FEDCBA named in a comment: must NOT trip -->\n',
	);
	writeFileSync(join(root, 'lib/styles/tokens.css'), ':root { --primary: #123ABC; }\n');
	// tvOnlyInUi fixtures
	writeFileSync(
		join(root, 'lib/components/ui/button/button.svelte'),
		"<script>import { tv } from 'tailwind-variants';</script>\n",
	);
	writeFileSync(
		join(root, 'Feature.svelte'),
		"<script>import { tv } from 'tailwind-variants';</script>\n",
	);
	writeFileSync(
		join(root, 'TypeOnly.svelte'),
		"<script lang=\"ts\">import type { VariantProps } from 'tailwind-variants';</script>\n",
	);
});

afterAll(() => {
	rmSync(root, { recursive: true, force: true });
});

describe('styleRegressions engine', () => {
	it('catches a forbidden utility and passes clean files', () => {
		const results = styleRegressionViolations({ root, forbidden: FROZEN_FORBIDDEN });
		expect(results).toHaveLength(1);
		expect(results[0]?.hits).toEqual(['src/Bad.svelte']);
	});
});

describe('brandHex engine', () => {
	it('rejects empty or malformed consumer policy', () => {
		expect(() => buildBrandHexPattern([])).toThrow(/at least one/i);
		expect(() => buildBrandHexPattern(['orange'])).toThrow(/6-digit hex/i);
	});

	it('compiles the configured hex pattern', () => {
		expect(buildBrandHexPattern(FROZEN_BRAND_HEXES).source).toBe('#(?:123abc|fedcba)\\b');
	});

	it('catches raw hex, skips comments, honors the allowlist, counts files', () => {
		const res = brandHexViolations({
			root,
			hexes: FROZEN_BRAND_HEXES,
			allowlist: new Set([join(root, 'lib/styles/tokens.css')]),
		});
		expect(res.fileCount).toBeGreaterThan(0);
		expect(res.violations).toHaveLength(1);
		expect(res.violations[0]).toContain('RawHex.svelte:1');
	});
});

describe('datavizDoctrine engine', () => {
	it('catches an affordance fill on stripped source', () => {
		const bad = datavizViolations('<rect fill="var(--primary)" />');
		expect(bad).toHaveLength(1);
	});

	it('honors the allow-marker window on ORIGINAL source', () => {
		const src = '<!-- dataviz-allow: interactive -->\n<rect fill="var(--primary)" />';
		expect(datavizViolations(src)).toEqual([]);
	});

	it('never trips on doctrine prose inside comments', () => {
		expect(datavizViolations('<!-- never use fill="var(--primary)" for data -->')).toEqual([]);
	});

	it('catches utility-class fills', () => {
		expect(datavizViolations('<div class="bg-success"></div>')).toHaveLength(1);
		expect(datavizViolations('<div class="bg-dataviz-status-on-time"></div>')).toEqual([]);
	});
});

describe('colorMixFloors engine', () => {
	it('compiles the byte-identical default brand pattern', () => {
		const { colorMixText } = buildColorMixPatterns(['primary', 'accent', 'signal']);
		expect(colorMixText.source).toBe(
			'(?<![-\\w])color:\\s*color-mix\\(in srgb,\\s*var\\(--(?:primary|accent|signal)[^)]*\\)\\s*(\\d+(?:\\.\\d+)?)%',
		);
	});

	it('fails below the floor, passes at it, and honors the exemption window', () => {
		expect(colorMixViolations('color: color-mix(in srgb, var(--primary) 80%, transparent);')).toHaveLength(1);
		expect(colorMixViolations('color: color-mix(in srgb, var(--primary) 85%, transparent);')).toEqual([]);
		expect(
			colorMixViolations(
				'/* contrast-exempt: decorative */\ncolor: color-mix(in srgb, var(--primary) 40%, transparent);',
			),
		).toEqual([]);
		// border-color is a boundary, not text — never scanned
		expect(colorMixViolations('border-color: color-mix(in srgb, var(--primary) 20%, transparent);')).toEqual([]);
	});
});

describe('tvOnlyInUi engine (minted)', () => {
	it('flags value imports outside uiRoots, allows ui/ and type-only imports', () => {
		const res = tvOnlyInUiViolations({
			root,
			uiRoots: [join(root, 'lib/components/ui')],
		});
		expect(res.fileCount).toBeGreaterThan(0);
		expect(res.violations).toHaveLength(1);
		expect(res.violations[0]).toContain('Feature.svelte');
	});
});

describe('contrast math', () => {
	it('WCAG math sanity: black on white is 21:1', () => {
		expect(ratio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
	});
});

describe('blankComments contract', () => {
	it('preserves newlines and line alignment', () => {
		const src = 'a\n/* two\nline comment */\nb // tail\nc';
		const out = blankComments(src);
		expect(out.split('\n')).toHaveLength(src.split('\n').length);
		expect(out).toContain('a\n');
		expect(out).not.toContain('comment');
		expect(out).not.toContain('tail');
	});
});
