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
		expect(read('NOTICE')).toContain('Copyright (c) 2026 Yesid Otalora');
		expect(read('NOTICE')).toContain('TRADEMARK.md');

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
		expect(releasing).toContain('workflow_dispatch` is verification-only');
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

	it('records consumer baselines without claiming the v0.7 cutovers are complete', () => {
		const consumers = read('CONSUMERS.md');

		expect(consumers).toContain('aef4c722d4fbcf1f812c0c37a7e4c1881f68961a');
		expect(consumers).toContain('legacy manifest');
		expect(consumers).toContain('v0.6.0');
		expect(consumers).toContain('7767b729e01c73a3b85fc031d287de2cb9445cb1');
		expect(consumers).toContain('embedded workspace packages');
		expect(consumers).toContain('not yet adopted schema 2');
		expect(consumers).toContain('workspace dogfood consumer');
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

		expect(guide).toContain('schema-2');
		expect(guide).toContain('provenance.mode` is `release');
		expect(guide).toContain('bun vendor/design/tools/adopt.ts --check --dest vendor/design');
		expect(guide).toContain('Rollback to a previously accepted release');
		expect(guide).toContain('Re-upgrade');
		expect(guide).toContain('Never edit `manifest.json` by hand');
	});
});
