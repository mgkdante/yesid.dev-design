import { render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

const chain = vi.hoisted(() => ({ attach: vi.fn(), destroy: vi.fn() }));
vi.mock('@yesid/motion/actions', () => ({
	scrollChain: (node: HTMLElement) => {
		chain.attach(node);
		return { destroy: chain.destroy };
	},
}));

const { default: StickyPanel } = await import('./StickyPanel.svelte');
const children = createRawSnippet(() => ({ render: () => '<p>Sidebar</p>' }));

describe('StickyPanel', () => {
	it('renders a keyboard-scrollable sticky panel below top', () => {
		const { container } = render(StickyPanel, { props: { children, top: '4rem' } });
		const panel = container.querySelector('[data-slot="sticky-panel"]');

		expect(panel?.getAttribute('style')).toContain('top: 4rem');
		expect(panel?.getAttribute('tabindex')).toBe('0');
		expect(panel?.textContent).toContain('Sidebar');
	});

	it('chains wheel scrolling to the page and cleans up on unmount', () => {
		vi.clearAllMocks();
		const rendered = render(StickyPanel, { props: { children } });
		const panel = rendered.container.querySelector('[data-slot="sticky-panel"]');

		expect(chain.attach).toHaveBeenCalledWith(panel);
		rendered.unmount();
		expect(chain.destroy).toHaveBeenCalledOnce();
	});
});
