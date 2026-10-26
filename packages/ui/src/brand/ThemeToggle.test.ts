import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import ThemeToggle from './ThemeToggle.svelte';
import { theme } from '../state/theme.svelte.js';

describe('ThemeToggle', () => {
	beforeEach(() => {
		localStorage.clear();
		document.documentElement.dataset.theme = 'dark';
		theme.init();
	});

	it('renders a labelled switch, checked in dark', () => {
		render(ThemeToggle, { props: { label: 'Dark theme' } });
		const toggle = screen.getByRole('switch', { name: 'Dark theme' });
		expect(toggle.getAttribute('aria-checked')).toBe('true');
	});

	it('click flips the document theme and the switch state', async () => {
		render(ThemeToggle, { props: { label: 'Dark theme' } });
		const toggle = screen.getByRole('switch', { name: 'Dark theme' });
		await fireEvent.click(toggle);
		expect(document.documentElement.dataset.theme).toBe('light');
		expect(toggle.getAttribute('aria-checked')).toBe('false');
	});
});
