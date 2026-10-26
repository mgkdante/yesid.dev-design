import { beforeEach, describe, expect, it } from 'vitest';
import { quietMode } from './quiet-mode.svelte.js';

describe('quietMode', () => {
	beforeEach(() => {
		quietMode.resetForTest();
		localStorage.clear();
	});

	it('init restores a remembered default by closing sections', () => {
		localStorage.setItem('quiet-mode', 'true');
		quietMode.init();
		expect(quietMode.enabled).toBe(true);
		expect(quietMode.remembered).toBe(true);
		expect(quietMode.closeSignal).toBe(1);
		expect(document.documentElement.dataset.quietMode).toBe('true');
	});

	it('init without a remembered default issues no open signal', () => {
		quietMode.init();
		expect(quietMode.enabled).toBe(false);
		expect(quietMode.openSignal).toBe(0);
		expect(quietMode.closeSignal).toBe(0);
		expect(document.documentElement.dataset.quietMode).toBeUndefined();
	});

	it('uses the storage key passed to init', () => {
		localStorage.setItem('transit:quiet-mode', 'true');
		quietMode.init({ storageKey: 'transit:quiet-mode' });
		expect(quietMode.enabled).toBe(true);
		quietMode.forgetDefault();
		expect(localStorage.getItem('transit:quiet-mode')).toBeNull();
	});

	it('remembers and forgets the collapsed default', () => {
		quietMode.init();
		quietMode.rememberCurrent();
		expect(quietMode.enabled).toBe(true);
		expect(localStorage.getItem('quiet-mode')).toBe('true');
		quietMode.forgetDefault();
		expect(quietMode.remembered).toBe(false);
		expect(localStorage.getItem('quiet-mode')).toBeNull();
	});

	it('toggle alternates close and open signals', () => {
		quietMode.toggle();
		quietMode.toggle();
		expect(quietMode.closeSignal).toBe(1);
		expect(quietMode.openSignal).toBe(1);
		expect(quietMode.enabled).toBe(false);
	});
});
