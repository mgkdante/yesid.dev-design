// @vitest-environment node
import { Window } from 'happy-dom';
import { render } from 'svelte/server';
import { expect, it } from 'vitest';
import ArticleHeader from './ArticleHeader.svelte';
import Canvas from './test-fixtures/ArticleHeaderCanvas.svelte';

it('server markup has the title, back link and meta', () => {
	const { body } = render(ArticleHeader, {
		props: {
			title: 'Reliability report',
			highlight: 'report',
			backHref: '/reports',
			backLabel: 'Back to reports',
			meta: ['12 metrics', { label: 'Updated', text: 'Jul 9', datetime: '2026-07-09' }],
		},
	});
	const document = new Window().document;
	document.body.innerHTML = body;

	expect(document.querySelector('h1')?.textContent?.trim()).toBe('Reliability report');
	expect(body).toContain('href="/reports"');
	expect(body).toContain('Back to reports');
	expect(body).toContain('12 metrics');
	expect(body).toContain('datetime="2026-07-09"');
});

it('server markup renders the canvas snippet with undefined', () => {
	const seen: (HTMLElement | undefined)[] = [];
	const { body } = render(Canvas, { props: { seen } });

	expect(seen).toEqual([undefined]);
	expect(body).toContain('data-header="undefined"');
});
