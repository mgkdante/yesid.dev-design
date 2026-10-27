import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import ErrorIllustration, { type ErrorIllustrationProps } from './ErrorIllustration.svelte';

const scene = (props: ErrorIllustrationProps = {}) => render(ErrorIllustration, { props });

describe('ErrorIllustration', () => {
	it('is decorative and carries the caller class', () => {
		const view = scene({ class: 'wide' });
		const root = view.getByTestId('construction-scene');
		expect(root.classList.contains('wide')).toBe(true);
		expect(root.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
	});

	it.each([
		[{}, []],
		[{ code: '404' }, ['404']],
		[{ signLabel: 'STATION' }, ['STATION']],
		[{ signLabel: 'STATION', code: '404' }, ['STATION', '404']],
	])('with %j the sign reads %j', (props, expected) => {
		const texts = [...scene(props).container.querySelectorAll('text')].map((text) => text.textContent);
		expect(texts).toEqual(expected);
	});

	it('gives two instances on one page different pattern ids, each referenced by its own barriers', () => {
		const [first, second] = [scene(), scene()].map(({ container }) => ({
			id: container.querySelector('pattern')!.id,
			fills: [...container.querySelectorAll('rect[fill]')].map((rect) => rect.getAttribute('fill')),
		}));

		expect(first.id).not.toBe('');
		expect(first.id).not.toBe(second.id);
		for (const { id, fills } of [first, second]) {
			expect(fills).toEqual([`url(#${id})`, `url(#${id})`]);
			expect(document.querySelectorAll(`[id="${id}"]`)).toHaveLength(1);
		}
	});
});
