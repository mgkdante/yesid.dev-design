import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import ScrollArea from './scroll-area.svelte';

afterEach(() => cleanup());

describe('ScrollArea keyboard contract', () => {
	it('makes the scrollable viewport keyboard focusable', () => {
		const { container } = render(ScrollArea);
		const viewport = container.querySelector('[data-slot="scroll-area-viewport"]');

		expect(viewport?.getAttribute('tabindex')).toBe('0');
	});
});
