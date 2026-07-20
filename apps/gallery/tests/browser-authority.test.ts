import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { blockingAxeViolations } from './browser/authority.js';

describe('browser accessibility authority', () => {
	it('installs the container setup prerequisite before the shared action', () => {
		const workflow = readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');
		const browserJob = workflow.match(
			/^  browser-authority:\n[\s\S]*?^  token-outputs-windows:\n/m,
		)?.[0];

		expect(browserJob).toBeDefined();
		expect(browserJob).toContain('apt-get install --yes --no-install-recommends unzip');
		expect(browserJob!.indexOf('apt-get install')).toBeLessThan(
			browserJob!.indexOf('uses: ./.github/actions/setup'),
		);
	});

	it('emits full-page candidates without enabling snapshot updates', () => {
		const config = readFileSync(new URL('../playwright.config.ts', import.meta.url), 'utf8');
		const visualSpec = readFileSync(
			new URL('./browser/gallery.visual.spec.ts', import.meta.url),
			'utf8',
		);

		expect(config).toContain("updateSnapshots: 'none'");
		expect(visualSpec).toContain('testInfo.snapshotPath(screenshotName)');
		expect(visualSpec).toContain('testInfo.outputPath(`gallery-${theme}-candidate.png`)');
		expect(visualSpec).toContain('await page.screenshot({');
		expect(visualSpec).toContain("animations: 'disabled'");
		expect(visualSpec).toContain("caret: 'hide'");
		expect(visualSpec).toContain('fullPage: true');
		expect(visualSpec).toContain("scale: 'css'");
	});

	it('blocks serious and critical violations without hiding lower-impact evidence', () => {
		const violations = [
			{ id: 'minor-rule', impact: 'minor' },
			{ id: 'moderate-rule', impact: 'moderate' },
			{ id: 'serious-rule', impact: 'serious' },
			{ id: 'critical-rule', impact: 'critical' },
			{ id: 'unscored-rule', impact: null },
		];

		expect(blockingAxeViolations(violations).map(({ id }) => id)).toEqual([
			'serious-rule',
			'critical-rule',
		]);
		expect(violations).toHaveLength(5);
	});
});
