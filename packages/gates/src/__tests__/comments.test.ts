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

	it('blanks incomplete HTML and block comments through EOF', () => {
		const html = 'a<!--x\nb';
		const block = 'a/*x\nb';

		expect(blankComments(html)).toBe('a     \n ');
		expect(blankComments(block)).toBe('a   \n ');
	});

	it('handles many incomplete delimiters as one comment span', () => {
		const source = '<!--'.repeat(4_096);

		expect(blankComments(source)).toBe(' '.repeat(source.length));
	});

	it('uses the first opening delimiter when comment syntaxes overlap', () => {
		const source = '/* <!-- */outside -->';

		expect(blankComments(source)).toBe(`${' '.repeat(10)}outside -->`);
	});

	it('rejects source text larger than the one-MiB scanner budget', () => {
		const source = 'x'.repeat(1_048_577);

		expect(() => blankComments(source)).toThrow(/1 MiB|1,048,576|1048576/u);
	});

	it('accepts source text exactly at the one-MiB scanner budget', () => {
		const source = 'x'.repeat(1_048_576);

		expect(blankComments(source)).toBe(source);
	});
});
