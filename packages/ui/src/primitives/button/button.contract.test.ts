import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import Button from './button.svelte';

afterEach(() => cleanup());

describe('Button element contract', () => {
	it('treats a present empty href as an anchor and preserves anchor type', () => {
		const { container } = render(Button, { props: { href: '', type: 'text/html' } });
		const element = container.querySelector('[data-slot="button"]');

		expect(element?.tagName).toBe('A');
		expect(element?.getAttribute('href')).toBe('');
		expect(element?.getAttribute('type')).toBe('text/html');
	});

	it('keeps the native button default and disabled-link semantics', () => {
		const buttonRender = render(Button);
		const button = buttonRender.container.querySelector('[data-slot="button"]');
		expect(button?.tagName).toBe('BUTTON');
		expect(button?.getAttribute('type')).toBe('button');
		buttonRender.unmount();

		const linkRender = render(Button, { props: { href: '/next', disabled: true } });
		const link = linkRender.container.querySelector('[data-slot="button"]');
		expect(link?.tagName).toBe('A');
		expect(link?.hasAttribute('href')).toBe(false);
		expect(link?.getAttribute('aria-disabled')).toBe('true');
		expect(link?.getAttribute('role')).toBe('link');
		expect(link?.getAttribute('tabindex')).toBe('-1');
	});
});

