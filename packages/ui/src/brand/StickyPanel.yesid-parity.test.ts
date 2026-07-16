import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import StickyPanel from './StickyPanel.svelte';
import StickyPanelYesidFixture from './test-fixtures/StickyPanelYesidFixture.svelte';

const children = createRawSnippet(() => ({ render: () => '<p>Sidebar</p>' }));
const fixtureSource = readFileSync(
	join(process.cwd(), 'src/brand/test-fixtures/StickyPanelYesidFixture.svelte'),
	'utf8',
);

describe('StickyPanel yesid.dev wrapper parity', () => {
	it('exposes the current root markup and a consumer hook without importing app motion', () => {
		// yesid.dev/apps/web/src/lib/components/brand/StickyPanel.svelte:18-38
		// uses this root/class/top contract; its surface-3 CSS and scrollChain action stay app-side.
		const { container } = render(StickyPanel, {
			props: {
				children,
				class: 'yesid-sticky-panel',
				top: '4rem',
				'data-lenis-prevent': '',
			},
		});
		const panel = container.querySelector('[data-slot="sticky-panel"]');

		expect(panel?.classList).toContain('panel');
		expect(panel?.classList).toContain('scrollbar-hidden');
		expect(panel?.classList).toContain('yesid-sticky-panel');
		expect(panel?.getAttribute('style')).toContain('top: 4rem');
		expect(panel?.hasAttribute('data-lenis-prevent')).toBe(true);
			expect(panel?.textContent).toContain('Sidebar');
		});

	it('wires and cleans up the app-local scrollChain action through the bindable ref', async () => {
		// yesid.dev/apps/web/src/lib/components/brand/StickyPanel.svelte:8,26
		// attaches the app-local scrollChain action directly to the panel element.
		const destroy = vi.fn();
		const scrollChain = vi.fn((node: HTMLElement) => {
			node.setAttribute('data-lenis-prevent', '');
			return {
				destroy() {
					node.removeAttribute('data-lenis-prevent');
					destroy();
				},
			};
		});
		const rendered = render(StickyPanelYesidFixture, { props: { children, scrollChain } });
		await tick();
		const panel = rendered.container.querySelector('[data-slot="sticky-panel"]');

		expect(scrollChain).toHaveBeenCalledOnce();
		expect(scrollChain).toHaveBeenCalledWith(panel);
		expect(panel?.hasAttribute('data-lenis-prevent')).toBe(true);

		rendered.unmount();
		expect(destroy).toHaveBeenCalledOnce();
		expect(panel?.hasAttribute('data-lenis-prevent')).toBe(false);
	});

	it('locks the exact yesid.dev surface and shadow overrides in the wrapper fixture', () => {
		// yesid.dev/apps/web/src/lib/components/brand/StickyPanel.svelte:30-39
		expect(fixtureSource).toContain('background: var(--surface-3);');
		expect(fixtureSource).toContain('box-shadow: none;');
	});
});
