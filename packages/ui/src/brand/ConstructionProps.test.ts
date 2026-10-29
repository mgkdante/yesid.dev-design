import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import ConstructionProps from './ConstructionProps.svelte';

afterEach(cleanup);
afterEach(() => vi.unstubAllGlobals());
const props = ['sign', 'helmet', 'barricade', 'balise', 'stop'];

it('renders the five construction artworks and bilingual sign without exposing decorative images to AT', () => {
	const view = render(ConstructionProps);
	for (const prop of props) expect(view.container.querySelector(`[data-construction-prop="${prop}"] svg`)).not.toBeNull();
	expect(view.getByText('ARRÊT')).toBeTruthy();
	expect(view.getByText('STOP')).toBeTruthy();
	expect(screen.queryByRole('img')).toBeNull();
	expect(view.container.querySelector('a, button, [tabindex]')).toBeNull();
	expect(view.container.querySelector('feDiffuseLighting')).toBeNull();
});

it('reverses visibility on every bottom visit and releases its observer on unmount', async () => {
	let update: (visible: boolean) => void = () => {};
	const disconnect = vi.fn();
	vi.stubGlobal('IntersectionObserver', class {
		constructor(callback: IntersectionObserverCallback) {
			update = visible => callback([{ isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
		}
		observe() {}
		disconnect = disconnect;
	});
	const view = render(ConstructionProps, { props: { revealAt: document.createElement('div') } });
	const floor = view.container.querySelector('[data-slot="construction-props"]')!;
	for (const visible of [false, true, false, true]) {
		update(visible);
		await tick();
		expect(floor.getAttribute('data-state')).toBe(visible ? 'visible' : 'hidden');
		expect(disconnect).not.toHaveBeenCalled();
	}
	await view.unmount();
	expect(disconnect).toHaveBeenCalledOnce();
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
