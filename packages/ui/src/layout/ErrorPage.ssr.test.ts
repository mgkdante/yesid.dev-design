// @vitest-environment node
import { render } from 'svelte/server';
import { expect, it } from 'vitest';
import ErrorPage from './ErrorPage.svelte';

const props = {
	label: 'ROUTE NOT FOUND',
	heading: 'This station is under construction',
	body: 'The page you want has not opened yet.',
	suggestions: [{ href: '/lines', label: 'Lines' }],
	suggestionsLabel: 'Where to next',
	statusNote: '# no such route',
};

it.each([404, 500])('server markup of a %i has the scene, copy, destinations and terminal line', (status) => {
	const { body } = render(ErrorPage, { props: { ...props, status } });

	expect(body).toContain('data-testid="construction-scene"');
	expect(body).toContain('ROUTE NOT FOUND');
	expect(body).toContain('This station is under construction');
	expect(body).toContain('The page you want has not opened yet.');
	expect(body).toContain('href="/lines"');
	expect(body).toContain('aria-label="Where to next"');
	expect(body).toContain('data-testid="terminal-line"');
	expect(body.includes('role="alert"')).toBe(status !== 404);
});
