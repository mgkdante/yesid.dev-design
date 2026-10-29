import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import ConstructionProps from './ConstructionProps.svelte';

afterEach(cleanup);
afterEach(() => vi.unstubAllGlobals());
const props = ['sign', 'helmet', 'barricade', 'balise'];

it('renders the four original construction artworks without exposing decorative images to AT', () => {
	const view = render(ConstructionProps);
	for (const prop of props) expect(view.container.querySelector(`[data-construction-prop="${prop}"] svg`)).not.toBeNull();
	expect(screen.queryByRole('img')).toBeNull();
	expect(view.container.querySelector('a, button, [tabindex]')).toBeNull();
	expect(view.container.querySelector('feDiffuseLighting')).toBeNull();
});

it('tracks scroll position in both directions in the active viewport and cleans up', async () => {
	vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
	const viewport = document.createElement('div'), marker = document.createElement('div');
	Object.defineProperty(viewport, 'clientHeight', { value: 800 });
	viewport.getBoundingClientRect = () => new DOMRect(0, 0, 1200, 800);
	let top = 800;
	marker.getBoundingClientRect = () => new DOMRect(0, top, 1, 1);
	const remove = vi.spyOn(viewport, 'removeEventListener');
	const view = render(ConstructionProps, { props: { revealAt: marker, revealRoot: viewport } });
	const floor = view.container.querySelector('[data-slot="construction-props"]')!;
	for (const [position, progress] of [[800, 0], [710, .25], [660, .5], [560, 1], [660, .5], [800, 0], [560, 1]]) {
		top = position;
		viewport.dispatchEvent(new Event('scroll'));
		await tick();
		expect(Number(floor.getAttribute('data-progress'))).toBe(progress);
	}
	await view.unmount();
	expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function));
});

it('keeps every clip and optional lighting reference local to its own instance', () => {
	const first = render(ConstructionProps, { props: { lighting: true } });
	const second = render(ConstructionProps, { props: { lighting: true } });
	const allIds = [...document.querySelectorAll('[data-slot="construction-props"] [id]')].map(el => el.id);
	expect(allIds.length).toBeGreaterThan(0);
	expect(new Set(allIds).size).toBe(allIds.length);
	for (const view of [first, second]) {
		for (const prop of props) {
			const art = view.container.querySelector(`[data-construction-prop="${prop}"] svg`)!;
			const references = [...art.querySelectorAll('[filter], [clip-path]')];
			expect(references.length).toBeGreaterThan(0);
			for (const reference of references) {
				const value = reference.getAttribute('filter') ?? reference.getAttribute('clip-path')!;
				const id = value.slice('url(#'.length, -1);
				expect([...art.querySelectorAll('[id]')].some(el => el.id === id)).toBe(true);
			}
		}
	}
});
