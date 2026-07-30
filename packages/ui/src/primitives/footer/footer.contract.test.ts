import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import FooterContractFixture from './test-fixtures/FooterContractFixture.svelte';

afterEach(() => cleanup());

const groupSource = readFileSync(
	join(process.cwd(), 'src/primitives/footer/footer-group.svelte'),
	'utf8',
);
const linkSource = readFileSync(
	join(process.cwd(), 'src/primitives/footer/footer-link.svelte'),
	'utf8',
);

describe('Footer leaf contracts', () => {
	it('renders the group label recipe and nav content with native overrides', () => {
		render(FooterContractFixture);
		const group = screen.getByTestId('footer-group');

		expect(group.getAttribute('data-slot')).toBe('custom-footer-group');
		expect(group.classList.contains('fixture-footer-group')).toBe(true);
		expect(group.contains(screen.getByRole('link', { name: 'Work' }))).toBe(true);
		expect(group.contains(screen.getByRole('button', { name: 'Preferences' }))).toBe(true);
		expect(screen.getByText('Explore').getAttribute('data-slot')).toBe('footer-group-label');
		expect(groupSource).toContain('font-family: var(--font-mono);');
		expect(groupSource).toContain('font-size: var(--text-caption);');
		expect(groupSource).toContain('letter-spacing: 2px;');
		expect(groupSource).toContain('text-transform: uppercase;');
		expect(groupSource).toContain('color: var(--accent-text);');
		expect(groupSource).toContain('margin-bottom: 2px;');
	});

	it('selects the native element from href and forwards refs and element props', async () => {
		render(FooterContractFixture);
		const anchor = screen.getByTestId('footer-anchor');
		const button = screen.getByTestId('footer-button');
		const nullableButton = screen.getByTestId('nullable-footer-button');

		expect(anchor.tagName).toBe('A');
		expect(anchor.getAttribute('href')).toBe('/work');
		expect(anchor.getAttribute('target')).toBe('_blank');
		expect(anchor.getAttribute('rel')).toBe('noopener noreferrer');
		expect(anchor.getAttribute('data-slot')).toBe('footer-link');
		expect(anchor.classList.contains('fixture-footer-link')).toBe(true);

		expect(button.tagName).toBe('BUTTON');
		expect(button.getAttribute('type')).toBe('submit');
		expect(button.getAttribute('aria-controls')).toBe('analytics-consent');
		expect(button.getAttribute('aria-expanded')).toBe('false');
		expect(button.getAttribute('data-slot')).toBe('custom-footer-link');
		expect(nullableButton.tagName).toBe('BUTTON');
		expect(nullableButton.getAttribute('type')).toBe('button');

		button.click();
		await waitFor(() => expect(screen.getByTestId('button-clicks').textContent).toBe('1'));
		expect(screen.getByTestId('anchor-ref').textContent).toBe('A');
		expect(screen.getByTestId('button-ref').textContent).toBe('BUTTON');
	});

	it('ships the yesid underline recipe with the literal tap-floor fallback', () => {
		expect(linkSource).toContain(
			'background-image: linear-gradient(var(--primary), var(--primary));',
		);
		expect(linkSource).toContain('background-repeat: no-repeat;');
		expect(linkSource).toContain('background-position: 0 100%;');
		expect(linkSource).toContain('background-size: 0% 1px;');
		expect(linkSource).toContain('min-height: var(--size-tap-min, 44px);');
		expect(linkSource).toContain(
			'background-size var(--duration-fast) var(--ease-out),',
		);
		expect(linkSource).toContain(
			'color var(--duration-fast) var(--ease-default);',
		);
		expect(linkSource).toContain('.footer-link:focus-visible {');
		expect(linkSource).toContain('background-size: 100% 1px;');
	});
});
