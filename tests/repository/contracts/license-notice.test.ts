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

describe('license and notices', () => {
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
});
