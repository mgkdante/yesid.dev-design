import type { Component } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

describe('@yesid/ui configuration identity', () => {
	it('shares neutral consumer class merging across export conditions and primitive imports', async () => {
		vi.resetModules();
		const root = await import('@yesid/ui');
		const subpath = await import('@yesid/ui/cn');

		expect(
			root.configureUi({
				vocab: {
					text: ['product-label', 'product-value'],
					colors: ['status-muted', 'status-critical'],
				},
			}),
		).toBe('initialized');
		expect(
			subpath.configureUi({
				vocab: {
					text: ['product-value', 'product-label', 'product-value'],
					colors: ['status-critical', 'status-muted', 'status-critical'],
				},
			}),
		).toBe('unchanged');
		expect(root.cn).toBe(subpath.cn);

		const [{ render }, { Badge }] = await Promise.all([
			import('svelte/server'),
			import('@yesid/ui/badge'),
		]);
		const { body } = render(Badge as Component<{ class?: string }>, {
			props: {
				class:
					'text-product-label text-product-value text-status-muted text-status-critical bg-status-muted bg-status-critical border-status-muted border-status-critical',
			},
		});
		const renderedClasses = new Set(body.match(/class="([^"]+)"/u)?.[1]?.split(/\s+/u));
		for (const retained of [
			'text-product-value',
			'text-status-critical',
			'bg-status-critical',
			'border-status-critical',
		]) {
			expect(renderedClasses.has(retained), retained).toBe(true);
		}
		for (const removed of [
			'text-caption',
			'text-product-label',
			'text-status-muted',
			'bg-primary',
			'bg-status-muted',
			'border-transparent',
			'border-status-muted',
		]) {
			expect(renderedClasses.has(removed), removed).toBe(false);
		}

		expect(() =>
			root.configureUi({
				vocab: {
					text: ['other-label'],
					colors: ['status-muted', 'status-critical'],
				},
			}),
		).toThrow(
			'@yesid/ui is already initialized with a different configuration. Conflicting fields: vocab.text. configureUi() accepts one semantic configuration per loaded ESM module instance.',
		);
		expect(
			subpath.cn(
				'text-product-label text-product-value text-status-muted text-status-critical bg-status-muted bg-status-critical border-status-muted border-status-critical',
			),
		).toBe('text-product-value text-status-critical bg-status-critical border-status-critical');
	});
});
