import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import QuietModeButton, { type QuietModeButtonCopy } from './QuietModeButton.svelte';

const componentSource = readFileSync(join(process.cwd(), 'src/brand/QuietModeButton.svelte'), 'utf8');

const copy: QuietModeButtonCopy = {
	collapse: 'Collapse all',
	expand: 'Expand all',
	collapseTitle: 'Collapse every section',
	expandTitle: 'Expand every section',
	remember: 'Always start collapsed',
	forget: "Don't start collapsed",
};

describe('QuietModeButton', () => {
	it('renders the controlled plain-button contract', () => {
		const { container } = render(QuietModeButton, {
			props: {
				copy,
				enabled: false,
				remembered: false,
				onToggle: vi.fn(),
				onRememberToggle: vi.fn(),
			},
		});

		const toggle = screen.getByRole('button', { name: copy.collapse });
		const remember = screen.getByRole('button', { name: copy.remember });
		const controls = container.querySelector('[data-testid="quiet-mode-controls"]');
		const buttons = [...container.querySelectorAll('button')];

		expect(controls?.classList).toContain('quiet-mode-controls');
		expect(controls?.classList).not.toContain('quiet-mode-controls--glow');
		expect(buttons).toEqual([toggle, remember]);
		expect(toggle.getAttribute('type')).toBe('button');
		expect(remember.getAttribute('type')).toBe('button');
		expect(
			['quiet-mode-toggle', 'quiet-mode-toggle--switch', 'tap-press'].every((className) =>
				toggle.classList.contains(className),
			),
		).toBe(true);
		expect(
			['quiet-mode-toggle', 'quiet-mode-toggle--remember', 'tap-press'].every((className) =>
				remember.classList.contains(className),
			),
		).toBe(true);
		expect(toggle.getAttribute('data-testid')).toBe('quiet-mode-toggle');
		expect(remember.getAttribute('data-testid')).toBe('quiet-mode-remember');
		expect(toggle.getAttribute('title')).toBe(copy.collapseTitle);
		expect(remember.getAttribute('title')).toBe(copy.remember);
		expect(toggle.getAttribute('data-collapsed')).toBe('false');
		expect(remember.getAttribute('data-remembered')).toBe('false');
		expect(toggle.hasAttribute('role')).toBe(false);
		expect(toggle.hasAttribute('aria-checked')).toBe(false);
		expect(toggle.hasAttribute('aria-pressed')).toBe(false);
		expect(buttons).toHaveLength(2);
		expect(buttons.map((button) => button.querySelector('svg')?.getAttribute('aria-hidden'))).toEqual([
			'true',
			'true',
		]);
		expect([...toggle.querySelectorAll('path')].map((path) => path.getAttribute('d'))).toEqual([
			'M8.4 8.4a5 5 0 0 0 0 7.2',
			'M15.6 8.4a5 5 0 0 1 0 7.2',
			'M5.7 5.7a8.9 8.9 0 0 0 0 12.6',
			'M18.3 5.7a8.9 8.9 0 0 1 0 12.6',
		]);
		expect(remember.querySelector('.r-bookmark')?.getAttribute('d')).toBe(
			'M7 4.5h10a1 1 0 0 1 1 1V20l-6-3.9L6 20V5.5a1 1 0 0 1 1-1z',
		);
	});

	it('selects enabled and remembered copy without owning product state', () => {
		render(QuietModeButton, {
			props: {
				copy,
				enabled: true,
				remembered: true,
				onToggle: vi.fn(),
				onRememberToggle: vi.fn(),
			},
		});

		expect(screen.getByRole('button', { name: copy.expand }).getAttribute('title')).toBe(
			copy.expandTitle,
		);
		expect(
			screen.getByRole('button', { name: copy.forget }).getAttribute('data-remembered'),
		).toBe('true');
	});

	it('reacts to controlled state changes from the product adapter', async () => {
		const onToggle = vi.fn();
		const onRememberToggle = vi.fn();
		const rendered = render(QuietModeButton, {
			props: { copy, enabled: false, remembered: false, onToggle, onRememberToggle },
		});

		await rendered.rerender({
			copy,
			enabled: true,
			remembered: true,
			onToggle,
			onRememberToggle,
		});

		expect(screen.getByRole('button', { name: copy.expand }).getAttribute('data-collapsed')).toBe(
			'true',
		);
		expect(screen.getByRole('button', { name: copy.forget }).getAttribute('data-remembered')).toBe(
			'true',
		);
	});

	it('delegates both actions to the product adapter', async () => {
		const onToggle = vi.fn();
		const onRememberToggle = vi.fn();
		render(QuietModeButton, {
			props: { copy, enabled: false, remembered: false, onToggle, onRememberToggle },
		});

		await fireEvent.click(screen.getByRole('button', { name: copy.collapse }));
		await fireEvent.click(screen.getByRole('button', { name: copy.remember }));
		expect(onToggle).toHaveBeenCalledOnce();
		expect(onRememberToggle).toHaveBeenCalledOnce();
	});

	it('keeps the glow policy explicit and forwards a consumer class', () => {
		const { container } = render(QuietModeButton, {
			props: {
				copy,
				enabled: true,
				remembered: true,
				onToggle: vi.fn(),
				onRememberToggle: vi.fn(),
				activeEffect: 'glow',
				class: 'consumer-control',
			},
		});

		expect(container.firstElementChild?.classList.contains('quiet-mode-controls')).toBe(true);
		expect(container.firstElementChild?.classList.contains('quiet-mode-controls--glow')).toBe(true);
		expect(container.firstElementChild?.classList.contains('consumer-control')).toBe(true);
	});

	it('locks tap geometry, non-stacking layout, reduced motion, and glow-only filters', () => {
		expect(componentSource).toContain('display: inline-flex;');
		expect(componentSource).toContain('min-width: 44px;');
		expect(componentSource).toContain('min-height: 44px;');
		expect(componentSource).toContain('@media (prefers-reduced-motion: reduce)');
		expect(componentSource).toContain('transition: none;');
		expect(componentSource).toContain(
			".quiet-mode-controls--glow .quiet-mode-toggle[data-collapsed='true'] .q-core",
		);
		expect(componentSource).toContain(
			".quiet-mode-controls--glow .quiet-mode-toggle[data-remembered='true'] .r-bookmark",
		);
	});
});
