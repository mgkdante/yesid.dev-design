import { describe, expect, it } from 'vitest';
import { highlight } from '../highlight.js';

describe('highlight', () => {
	it('marks SQL with syntax classes and keeps the exact source text', async () => {
		const html = await highlight("SELECT a, count(*) FROM t -- c\nWHERE x = 'a<b' AND y > 1", 'sql');
		expect(html.split(/<span class="syn-[a-z]+">|<\/span>/).join('')).toBe(
			"SELECT a, count(*) FROM t -- c\nWHERE x = 'a&lt;b' AND y &gt; 1",
		);
		expect(new Set(html.match(/syn-[a-z]+/g))).toEqual(
			new Set(['syn-keyword', 'syn-function', 'syn-punctuation', 'syn-comment', 'syn-string', 'syn-number']),
		);
		expect(html).not.toContain('style=');
	});

	it('resolves language aliases', async () => {
		expect(await highlight('const a = 1;', 'ts')).toBe(await highlight('const a = 1;', 'typescript'));
	});

	it('keeps Python # lines as comments', async () => {
		expect(await highlight('# note\nx = 1', 'python')).toContain('<span class="syn-comment"># note</span>');
	});

	it('returns an unknown language as escaped text', async () => {
		expect(await highlight('<script>&</script>', 'cobol')).toBe('&lt;script&gt;&amp;&lt;/script&gt;');
	});
});
