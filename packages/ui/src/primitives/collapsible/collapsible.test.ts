import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, expect, it } from 'vitest';
import CollapsibleFixture from './test-fixtures/CollapsibleFixture.svelte';

afterEach(() => cleanup());

it('points the trigger at its forced-mount content and toggles it', async () => {
	render(CollapsibleFixture);
	const trigger = screen.getByRole('button', { name: 'Details' });
	const content = document.getElementById(trigger.getAttribute('aria-controls') ?? '');
	expect(content?.textContent).toContain('Body');
	expect(trigger.getAttribute('aria-expanded')).toBe('false');
	await fireEvent.click(trigger);
	expect(trigger.getAttribute('aria-expanded')).toBe('true');
});
