import type { Component } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

describe('@yesid/ui configuration identity', () => {
	it('shares one singleton across package export conditions and primitive-relative imports', async () => {
		vi.resetModules();
		const root = await import('@yesid/ui');
		const subpath = await import('@yesid/ui/cn');

		expect(root.configureUi({ vocab: { text: ['gallery-label'] } })).toBe('initialized');
		expect(subpath.configureUi({ vocab: { text: ['gallery-label', 'gallery-label'] } })).toBe(
			'unchanged',
		);
		expect(root.cn).toBe(subpath.cn);

		const [{ render }, { Badge }] = await Promise.all([
			import('svelte/server'),
			import('@yesid/ui/badge'),
		]);
		const { body } = render(Badge as Component<{ class?: string }>, {
			props: { class: 'text-gallery-label' },
		});
		expect(body).toContain('text-gallery-label');
		expect(body).not.toContain('text-caption');

		expect(() => root.configureUi({ vocab: { text: ['other-label'] } })).toThrow(
			'@yesid/ui is already initialized with a different configuration. Conflicting fields: vocab.text. configureUi() accepts one semantic configuration per loaded ESM module instance.',
		);
		expect(subpath.cn('text-caption text-gallery-label')).toBe('text-gallery-label');
	});
});
