import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('../../../', import.meta.url);

function read(path: string): string {
	return readFileSync(new URL(path, ROOT), 'utf8');
}

const MIT_LICENSE = `MIT License

Copyright (c) 2026 Yesid Otalora

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

describe('repository governance contract', () => {
	it('keeps LICENSE as the unmodified MIT grant and separates brand notices', () => {
		expect(read('LICENSE')).toBe(MIT_LICENSE);

		const notice = read('NOTICE');
		const resolvedGsapVersion = /"gsap": \["gsap@([^"\]]+)"/u.exec(read('bun.lock'))?.[1];
		expect(resolvedGsapVersion).toBeDefined();
		expect(notice).toContain('Copyright (c) 2026 Yesid Otalora');
		expect(notice).toContain('TRADEMARK.md');
		expect(notice).toContain(`GSAP ${resolvedGsapVersion}`);
		expect(notice).toContain('Standard "No Charge" GSAP License');
		expect(notice).toContain('https://gsap.com/community/standard-license/');
		expect(notice).toContain('GSAP is not covered by this repository\'s MIT License');
		expect(notice).toContain('including commercial projects');
		expect(notice).toMatch(/visual animations without\s+code/u);

		const trademark = read('TRADEMARK.md');
		expect(trademark).toContain('The MIT License covers the software');
		expect(trademark).toMatch(/does not grant\s+permission/u);
		expect(trademark).toContain('yesid');
	});

	it('binds releases to immutable annotated tags and fail-closed reruns', () => {
		const releasing = read('RELEASING.md');

		expect(releasing).toContain('annotated tag');
		expect(releasing).toContain('tag object');
		expect(releasing).toContain('peeled commit');
		expect(releasing).toContain('yesid.dev-design-${tag}.tar');
		expect(releasing).toContain('.yesid-release.json');
		expect(releasing).toContain('Do not move, replace, delete, or recreate a published tag');
		expect(releasing).toContain('The tag push automatically starts');
		expect(releasing).toContain('Normal `workflow_dispatch` runs are verification-only');
		expect(releasing).toContain('recover-first-publication');
		expect(releasing).toContain('Administration (read)');
		expect(releasing).toContain('Platform-enforced immutability begins only after');
		expect(releasing).toContain('byte-for-byte');
		expect(releasing).toMatch(/delete\s+only that draft/u);
		expect(releasing).toContain('A rerun verifies');
		expect(releasing).toContain('digest');
	});

	it('defines support boundaries and structured contribution intake', () => {
		const support = read('SUPPORT.md');
		expect(support).toContain('Reproducible software defects');
		expect(support).toContain('Consumer-owned code');
		expect(support).toContain('Security reports');

		const bug = read('.github/ISSUE_TEMPLATE/bug-report.yml');
		expect(bug).toContain('Exact release tag');
		expect(bug).toContain('Minimal reproduction');
		expect(bug).toContain('bun vendor/design/tools/adopt.ts --check');

		const feature = read('.github/ISSUE_TEMPLATE/feature-request.yml');
		expect(feature).toContain('Consumer evidence');
		expect(feature).toContain('three independent consumers');

		const pullRequest = read('.github/PULL_REQUEST_TEMPLATE.md');
		expect(pullRequest).toContain('.changes/');
		expect(pullRequest).toContain('bun run api:check');
		expect(pullRequest).toContain('No consumer vendored files are patched');
	});

	it('records the exact v0.13.1 consumer receipts without inferring product verification', () => {
		const consumers = read('CONSUMERS.md');

		expect(consumers).toContain('ee2e565c86df4ffa40f11fcffb2ae23b56410a4e');
		expect(consumers).toContain('8e23e70bcd564de09ac52f09141a9a848a128180');
		expect(consumers.match(/schema-2 Release receipt for `v0\.13\.1`/gu)).toHaveLength(2);
		expect(
			consumers.match(
				/annotated tag object `cb2a6d76423c33303b9e86257f5639d10eb20bc7`/gu,
			),
		).toHaveLength(2);
		expect(consumers.match(/7cda0887287ef1e274582813d4c1a5795a54b7ea/gu)).toHaveLength(2);
		expect(consumers).toContain('9a1535c36a731268131b1631c32eeac63d42bbcc');
		expect(
			consumers.match(/containing `tokens,motion,gates,seo-kit,ui,analytics,i18n-core`/gu),
		).toHaveLength(2);
		expect(consumers).toContain('former embedded package copies are no longer present');
		expect(consumers).toContain('workspace dogfood consumer');
		expect(consumers).toContain('does not infer product verification');
		expect(consumers).not.toContain('legacy manifest');
		expect(consumers).not.toContain('not yet adopted schema 2');
	});

	it('keeps migrated fluid-token and UI compatibility knowledge under durable owners', () => {
		const decisions = read('DECISIONS.md');
		const boundaries = read('BOUNDARIES.md');
		const ui = read('packages/ui/README.md');
		const readme = read('README.md');

		expect(decisions).toContain('## D10: Fluid clamp tokens stay structured at the source');
		expect(decisions).toContain('Figma export carries that expression as a STRING variable');
		expect(decisions).toContain('## D11: UI compatibility is owned by durable package and consumer contracts');
		expect(boundaries).toContain('[Card contract](packages/ui/README.md#card)');
		for (const contract of [
			'--size-tap-min: 44px',
			'conversion signage colors',
			'no-edge-highlight contract',
			'force-mounts by default',
			'localized prefix',
			'app-local `scrollChain`',
			'8px width, 14px height, and 4px left margin',
			'Package tests and Gallery browser checks',
		]) {
			expect(ui, contract).toContain(contract);
		}
		expect(ui).not.toMatch(/\bwave\s+\d/iu);
		expect(readme).toContain('This repo is built with AI assistance under human direction');
	});

	it('defines a bounded deprecation lifecycle for stable contracts', () => {
		const deprecation = read('DEPRECATION.md');

		expect(deprecation).toContain('Experimental');
		expect(deprecation).toContain('Stable');
		expect(deprecation).toContain('Deprecated');
		expect(deprecation).toContain('Patch releases never intentionally break');
		expect(deprecation).toContain('at least 90 days');
		expect(deprecation).toMatch(/at least one\s+intervening minor release/u);
	});

	it('documents schema-2 adoption, offline verification, downgrade, and re-upgrade', () => {
		const guide = read('docs/BUILD-A-YESID-PRODUCT.md');
		const rollback = guide.slice(
			guide.indexOf('### Rollback to a previously accepted release'),
			guide.indexOf('### Re-upgrade'),
		);

		expect(guide).toContain('schema-2');
		expect(guide).toContain('provenance.mode` is `release');
		expect(guide).toContain('bun vendor/design/tools/adopt.ts --check --dest vendor/design');
		expect(guide).toContain('Add the seven vendored packages to `package.json`');
		expect(guide).toContain('"@yesid/analytics": "file:./vendor/design/analytics"');
		expect(guide).toContain('"@yesid/i18n-core": "file:./vendor/design/i18n-core"');
		expect(guide).toContain('"@yesid/seo-kit": "file:./vendor/design/seo-kit"');
		expect(guide).toContain('Rollback to a previously accepted release');
		expect(guide).toContain('Re-upgrade');
		expect(guide).toContain('Never edit `manifest.json` by hand');
		expect(rollback).toMatch(/The selected tag owns its package\s+closure/u);
		expect(rollback).toContain(
			"import { PACKAGE_NAMES } from './.yesid-design-rollback/tools/adopt/contract.ts'",
		);
		expect(rollback).toContain("process.stdout.write(PACKAGE_NAMES.join(','))");
		expect(rollback).toContain('--packages "$YESID_DESIGN_PACKAGES"');
		expect(rollback).not.toContain(
			'--packages tokens,motion,gates,seo-kit,ui,analytics,i18n-core',
		);
		expect(rollback).toMatch(
			/Before running `bun install`, reconcile the consumer's `package\.json`/u,
		);
		expect(rollback).toContain(
			'remove `"@yesid/analytics": "file:./vendor/design/analytics"`',
		);
		expect(rollback).toContain(
			'`"@yesid/i18n-core": "file:./vendor/design/i18n-core"`',
		);
		expect(rollback).toMatch(
			/dependency set\s+must match the installed `manifest\.json` package\s+closure/u,
		);
	});
});
