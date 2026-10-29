import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import StateNotice from './StateNotice.svelte';

const html = (markup: string) => createRawSnippet(() => ({ render: () => markup }));

describe('StateNotice', () => {
	it('announces as the role and live region the caller gives it', () => {
		render(StateNotice, {
			props: {
				title: 'No departures',
				body: 'The feed is quiet right now.',
				role: 'status',
				'aria-live': 'polite',
			},
		});

		const notice = screen.getByRole('status', { name: 'No departures' });
		expect(notice.getAttribute('aria-live')).toBe('polite');
		expect(notice.textContent).toContain('No departures');
		expect(notice.textContent).toContain('The feed is quiet right now.');
	});

	it('keeps the glyph and separator out of the accessible text', () => {
		render(StateNotice, {
			props: { title: 'Unavailable', body: 'No data', glyph: '!', presentation: 'pill', role: 'note' },
		});

		const hidden = [...screen.getByRole('note').querySelectorAll('[aria-hidden="true"]')];
		expect(hidden.map((el) => el.textContent?.trim())).toEqual(['!', '·']);
	});

	it('renders its action', () => {
		render(StateNotice, {
			props: { title: 'Unavailable', presentation: 'pill', action: html('<button>Retry</button>') },
		});

		expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
	});
});
