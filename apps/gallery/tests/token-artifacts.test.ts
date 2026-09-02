import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Gallery token artifact consumption', () => {
	it('makes the gallery consume the package artifact without a local mirror', () => {
		const appCss = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');

		expect(appCss).toContain("@import '@yesid/tokens/tokens.css';");
		expect(existsSync(new URL('../src/lib/styles/tokens.css', import.meta.url))).toBe(false);
	});
});
