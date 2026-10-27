import { render } from '@testing-library/svelte';
import { expect, it } from 'vitest';
import CornerMarks, { type CornerMarksProps } from './CornerMarks.svelte';

const marksOf = (props: CornerMarksProps = {}) =>
	render(CornerMarks, { props }).container.querySelector<HTMLElement>('[data-slot="corner-marks"]')!;
const cssVars = (el: HTMLElement) => ['--arm', '--mark-opacity'].map((name) => el.style.getPropertyValue(name));

it('CornerMarks draws four ticks, hidden from assistive tech, sized and faded by props', () => {
	const marks = marksOf();
	expect(marks.querySelectorAll('.mark')).toHaveLength(4);
	expect(marks.getAttribute('aria-hidden')).toBe('true');
	expect(cssVars(marks)).toEqual(['12px', '0.4']);
	expect(cssVars(marksOf({ size: 'md', opacity: 0.8 }))).toEqual(['32px', '0.8']);
});

it('CornerMarks merges a consumer class and forwards attributes', () => {
	const marks = marksOf({ class: 'consumer-marks', 'data-testid': 'marks' });
	expect(marks.classList.contains('consumer-marks')).toBe(true);
	expect(marks.getAttribute('data-testid')).toBe('marks');
});
