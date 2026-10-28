import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetFocusAfterNavigation } from './navigation.js';

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
	document.body.removeAttribute('tabindex');
	document.body.replaceChildren();
	getSelection()?.removeAllRanges();
});

function focusedButton() {
	const button = document.createElement('button');
	document.body.append(button);
	button.focus();
	return button;
}

describe('resetFocusAfterNavigation', () => {
	it('focuses the body without scrolling and keeps its tabindex', () => {
		document.body.setAttribute('tabindex', '0');
		focusedButton();
		const focus = vi.spyOn(document.body, 'focus');
		resetFocusAfterNavigation()();
		expect(document.activeElement).toBe(document.body);
		expect(focus).toHaveBeenCalledWith({ preventScroll: true, focusVisible: false });
		expect(document.body.getAttribute('tabindex')).toBe('0');
	});

	it('focuses the destination autofocus control without scrolling', () => {
		focusedButton();
		const reset = resetFocusAfterNavigation();
		const input = document.createElement('input');
		input.setAttribute('autofocus', '');
		document.body.append(input);
		const focus = vi.spyOn(input, 'focus');
		reset();
		expect(document.activeElement).toBe(input);
		expect(focus).toHaveBeenCalledWith({ preventScroll: true });
	});

	it('respects focus explicitly moved during navigation', () => {
		focusedButton();
		const reset = resetFocusAfterNavigation();
		const destination = focusedButton();
		reset();
		expect(document.activeElement).toBe(destination);
	});

	it.each([false, true])('clears selection only when unchanged (changed=%s)', async (changed) => {
		vi.useFakeTimers();
		focusedButton();
		const text = document.createTextNode('selection');
		document.body.append(text);
		const range = document.createRange();
		range.setStart(text, 0);
		range.setEnd(text, 4);
		const selection = getSelection()!;
		selection.addRange(range);
		resetFocusAfterNavigation()();
		if (changed) range.setEnd(text, 6);
		await vi.runOnlyPendingTimersAsync();
		expect(selection.rangeCount).toBe(changed ? 1 : 0);
	});
});
