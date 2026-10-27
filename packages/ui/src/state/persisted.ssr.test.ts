// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { persisted } from './persisted.svelte.js';

it('persisted returns the initial value and never touches storage without a document', () => {
	const storage = { getItem: vi.fn(), setItem: vi.fn() };
	vi.stubGlobal('sessionStorage', storage);
	expect(typeof document).toBe('undefined');

	const p = persisted('server', 'init');
	p.value = 'next';
	expect(p.value).toBe('next');
	expect(persisted('server', 'init').value).toBe('init');
	expect([storage.getItem, storage.setItem].some((fn) => fn.mock.calls.length > 0)).toBe(false);
	vi.unstubAllGlobals();
});
