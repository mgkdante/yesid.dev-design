import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import StatusDot, { type StatusDotColor, type StatusDotProps } from './StatusDot.svelte';

const dotOf = (props: StatusDotProps = {}) =>
	render(StatusDot, { props }).container.querySelector<HTMLElement>('[data-slot="status-dot"]')!;

const COLOR_CLASS: [StatusDotColor, string][] = [
	['orange', 'bg-primary'],
	['green', 'bg-[var(--signal-proceed)]'],
	['caution', 'bg-[var(--signal-caution)]'],
	['stop', 'bg-[var(--signal-stop)]'],
	['lunar', 'bg-[var(--signal-lunar)]'],
	['early', 'bg-[var(--dataviz-status-early)]'],
	['on_time', 'bg-[var(--dataviz-status-on-time)]'],
	['late', 'bg-[var(--dataviz-status-late)]'],
	['severe', 'bg-[var(--dataviz-status-severe)]'],
	['unknown', 'bg-[var(--dataviz-status-unknown)]'],
];

describe('StatusDot', () => {
	it.each(COLOR_CLASS)('colors %s with %s', (color, expected) => {
		expect(dotOf({ color }).classList.contains(expected)).toBe(true);
	});

	it('defaults to a small orange dot, grows with size="md", and pulses and rings only when asked', () => {
		const plain = dotOf();
		expect(['bg-primary', 'size-1.5'].every((name) => plain.classList.contains(name))).toBe(true);
		expect(plain.className).not.toMatch(/led-pulse|outline/);
		expect(dotOf({ size: 'md' }).classList.contains('size-2.5')).toBe(true);
		const loud = dotOf({ pulse: true, ring: true }).classList;
		expect(loud.contains('led-pulse') && loud.contains('outline-[var(--muted)]')).toBe(true);
	});

	it('is decorative without a label and screen-reader text with one', () => {
		const plain = dotOf();
		expect([plain.getAttribute('aria-hidden'), plain.textContent]).toEqual(['true', '']);
		const labelled = dotOf({ label: 'Delayed' });
		expect(labelled.hasAttribute('aria-hidden')).toBe(false);
		expect(labelled.querySelector('.sr-only')?.textContent).toBe('Delayed');
	});

	it('merges a consumer class and forwards attributes', () => {
		const dot = dotOf({ class: 'consumer-dot', 'aria-label': 'No realtime' });
		expect(dot.classList.contains('consumer-dot')).toBe(true);
		expect(dot.getAttribute('aria-label')).toBe('No realtime');
	});
});
