import { render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import SectionHeading, { type SectionHeadingProps } from './SectionHeading.svelte';

const explainer = createRawSnippet(() => ({ render: () => '<button data-testid="info">i</button>' }));

const show = (props: SectionHeadingProps) => render(SectionHeading, { props });
const slot = (view: { container: HTMLElement }, name: string) =>
	view.container.querySelector<HTMLElement>(`[data-slot="${name}"]`);
const tail = (view: { container: HTMLElement }) => view.container.querySelector('.section-heading-tail')?.textContent;

describe('SectionHeading', () => {
	it('renders an h2 by default and the requested level otherwise', () => {
		const tag = (props: SectionHeadingProps) => slot(show(props), 'section-heading')?.firstElementChild?.tagName;
		expect([tag({ heading: 'A' }), tag({ heading: 'A', level: 1 }), tag({ overline: 'A', level: 3 })]).toEqual([
			'H2',
			'H1',
			'H3',
		]);
	});

	it('shows the display heading with a decorative dot glued to the last word', () => {
		const view = show({ heading: 'What this is' });
		expect(slot(view, 'section-heading')?.dataset.mode).toBe('display');
		expect(view.getByRole('heading').textContent).toBe('What this is.');
		expect(tail(view)).toBe('is.');
		expect(slot(view, 'section-heading-dot')?.getAttribute('aria-hidden')).toBe('true');
		expect(tail(show({ heading: 'Crowding' }))).toBe('Crowding.');
	});

	it('drops the dot with dot={false} and renders the subheading only when given', () => {
		const view = show({ heading: 'What', dot: false, subheading: '// MEASURE' });
		expect(slot(view, 'section-heading-dot')).toBeNull();
		expect(slot(view, 'section-heading-sub')?.textContent).toBe('// MEASURE');
		expect(slot(show({ heading: 'What' }), 'section-heading-sub')).toBeNull();
	});

	it('puts the dot after the last word of the accent line', () => {
		const accent = slot(show({ heading: 'LE RÉSEAU,', headingAccent: 'MESURÉ HONNÊTEMENT' }), 'section-heading-accent')!;
		expect(accent.textContent).toBe('MESURÉ HONNÊTEMENT.');
		expect(accent.querySelector('.section-heading-tail')?.textContent).toBe('HONNÊTEMENT.');
	});

	it('renders an overline as a real heading without dot or subheading, and yields to a heading', () => {
		const overline = show({ overline: 'SOURCES', subheading: 'ignored', id: 'sources' });
		expect(slot(overline, 'section-heading')?.dataset.mode).toBe('overline');
		expect(overline.getByRole('heading').textContent).toBe('SOURCES');
		expect([slot(overline, 'section-heading-dot'), slot(overline, 'section-heading-sub')]).toEqual([null, null]);
		expect(overline.container.querySelector('#sources')).toBe(slot(overline, 'section-heading'));
		expect(slot(show({ heading: 'Network', overline: 'SOURCES' }), 'section-heading')?.dataset.mode).toBe('display');
	});

	it.each([
		[3, '03'],
		[12, '12'],
		[161, '161'],
		[4.9, '04'],
	])('shows number %s as %s inside the heading', (number, text) => {
		const view = show({ heading: 'Punctuality', number });
		expect(slot(view, 'numbered-chip')?.textContent).toBe(text);
		expect(view.getByRole('heading').contains(slot(view, 'numbered-chip'))).toBe(true);
	});

	it('keeps the chip decorative and resting unless made active, and omits it without a number', () => {
		const rest = slot(show({ heading: 'A', number: 1 }), 'numbered-chip');
		expect([rest?.getAttribute('aria-hidden'), rest?.dataset.tone]).toEqual(['true', 'rest']);
		const active = slot(show({ overline: 'A', number: 1, numberTone: 'active' }), 'numbered-chip');
		expect(active?.dataset.tone).toBe('active');
		expect(slot(show({ heading: 'A' }), 'numbered-chip')).toBeNull();
	});

	it('renders the explainer inside the heading', () => {
		const view = show({ overline: 'CROWDING', explainer });
		expect(view.getByRole('heading').contains(view.getByTestId('info'))).toBe(true);
	});
});
