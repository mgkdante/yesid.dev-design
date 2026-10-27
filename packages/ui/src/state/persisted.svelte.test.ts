import { fireEvent, render } from '@testing-library/svelte';
import { afterEach, expect, it, vi } from 'vitest';
import type { LocaleFree } from './index.js';
import { persisted } from './persisted.svelte.js';
import PersistedBind from './test-fixtures/PersistedBind.svelte';

afterEach(() => {
	sessionStorage.clear();
	vi.restoreAllMocks();
});

it('persisted writes changes under persisted:<key> and a later read restores them', () => {
	const p = persisted('query', 'init');
	expect(p.value).toBe('init');
	expect(sessionStorage.getItem('persisted:query')).toBeNull();

	p.value = 'svelte';
	expect(sessionStorage.getItem('persisted:query')).toBe('"svelte"');
	expect(persisted('query', 'init').value).toBe('svelte');
	expect(persisted('other', 'init').value).toBe('init');
});

it.each<LocaleFree>([false, 0, '', null, ['a', 1]])('persisted round-trips %j', (value) => {
	persisted<LocaleFree>('flag', 'seed').value = value;
	expect(persisted<LocaleFree>('flag', 'seed').value).toEqual(value);
});

it('persisted falls back to the initial value when the stored text is not JSON', () => {
	sessionStorage.setItem('persisted:broken', '{nope');
	expect(persisted('broken', 'init').value).toBe('init');
});

it('persisted keeps the in-memory value when storage rejects the write', () => {
	vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
		throw new DOMException('full', 'QuotaExceededError');
	});
	const p = persisted('full', 'init');
	expect(() => (p.value = 'next')).not.toThrow();
	expect(p.value).toBe('next');
});

it('persisted works with bind:value and survives a remount', async () => {
	const first = render(PersistedBind);
	await fireEvent.input(first.getByTestId('input'), { target: { value: 'svelte' } });
	expect(first.getByTestId('echo').textContent).toBe('svelte');
	expect(sessionStorage.getItem('persisted:bind-fixture')).toBe('"svelte"');
	first.unmount();

	expect((render(PersistedBind).getByTestId('input') as HTMLInputElement).value).toBe('svelte');
});
