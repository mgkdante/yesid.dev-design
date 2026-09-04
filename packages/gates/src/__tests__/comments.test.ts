import { describe, expect, it } from 'vitest';

import { blankComments } from '../engines/comments.js';

describe('blankComments', () => {
	it('blanks ordinary HTML, block, and line comments without treating URLs as comments', () => {
		const source = 'a<!--x\ny-->b/*z*/c//q\nhttp://example.test';

		expect(blankComments(source)).toBe('a     \n    b     c   \nhttp://example.test');
	});

	it('preserves LF and CRLF newline bytes inside comments', () => {
		const source = 'a/*x\r\ny*/b//z\r\nc';

		expect(blankComments(source)).toBe('a   \r\n   b   \r\nc');
	});

	it('leaves incomplete HTML and block delimiters unchanged', () => {
		const html = 'a<!--x\nb';
		const block = 'a/*x\nb';

		expect(blankComments(html)).toBe(html);
		expect(blankComments(block)).toBe(block);
	});

	it('handles many incomplete delimiters without hiding their source text', () => {
		const source = '<!--'.repeat(4_096);

		expect(blankComments(source)).toBe(source);
	});

	it('does not let an incomplete delimiter in ordinary source hide a later violation', () => {
		const source = "const marker = '<!--';\nconst color = '#123ABC';";

		expect(blankComments(source)).toBe(source);
	});

	it('uses the first opening delimiter when comment syntaxes overlap', () => {
		const source = '/* <!-- */outside -->';

		expect(blankComments(source)).toBe(`${' '.repeat(10)}outside -->`);
	});

	it('rejects source text larger than the 1,048,576-code-unit scanner budget', () => {
		const source = 'x'.repeat(1_048_577);

		expect(() => blankComments(source)).toThrow(/1,048,576 UTF-16 code units/u);
	});

	it('accepts source text at the 1,048,576-code-unit scanner budget', () => {
		const source = 'x'.repeat(1_048_576);

		expect(blankComments(source)).toBe(source);
	});
});
