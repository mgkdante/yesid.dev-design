import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { ConfigureUiResult as RootConfigureUiResult } from '../index.js';
import type { ConfigureUiResult as CnConfigureUiResult } from './index.js';

const CONFLICT_PREFIX =
	'@yesid/ui is already initialized with a different configuration. Conflicting fields: ';
const CONFLICT_SUFFIX =
	'. configureUi() accepts one semantic configuration per loaded ESM module instance.';

async function freshCnModule() {
	vi.resetModules();
	return import('./index.js');
}

async function renderFreshBadge(className: string) {
	const { render, cleanup } = await import('@testing-library/svelte');
	const { default: Badge } = await import('../primitives/badge/badge.svelte');
	const rendered = render(Badge, { props: { class: className } });
	return { ...rendered, cleanup };
}

describe('configureUi', () => {
	it('publishes the same result type from the package root and cn subpath', () => {
		expectTypeOf<RootConfigureUiResult>().toEqualTypeOf<CnConfigureUiResult>();
		expectTypeOf<CnConfigureUiResult>().toEqualTypeOf<'initialized' | 'unchanged'>();
	});

	it('keeps zero-configuration behavior and locks the default on first use', async () => {
		const { cn, configureUi } = await freshCnModule();

		expect(cn('text-caption text-body')).toBe('text-body');
		expect(configureUi()).toBe('unchanged');
		expect(() => configureUi({ vocab: { text: ['late-token'] } })).toThrow(
			`${CONFLICT_PREFIX}vocab.text${CONFLICT_SUFFIX}`,
		);
		expect(cn('text-caption text-body')).toBe('text-body');
	});

	it('initializes consumer vocabulary before a primitive renders', async () => {
		const { configureUi } = await freshCnModule();
		expect(
			configureUi({
				vocab: { text: ['consumer-label', 'consumer-value'] },
			}),
		).toBe('initialized');

		const { container, cleanup } = await renderFreshBadge(
			'text-consumer-label text-consumer-value',
		);
		const badge = container.querySelector('[data-slot="badge"]');

		expect(badge).not.toBeNull();
		expect(badge?.classList.contains('text-caption')).toBe(false);
		expect(badge?.classList.contains('text-consumer-label')).toBe(false);
		expect(badge?.classList.contains('text-consumer-value')).toBe(true);
		cleanup();
	});

	it('treats reordered and duplicated vocabulary as the same initialization', async () => {
		const { cn, configureUi } = await freshCnModule();
		expect(
			configureUi({
				vocab: {
					text: ['consumer-value', 'consumer-label', 'consumer-value'],
					colors: ['metric-warning', 'metric-healthy', 'metric-warning'],
				},
			}),
		).toBe('initialized');

		const before = cn('text-consumer-label text-consumer-value');
		expect(
			configureUi({
				vocab: {
					text: ['consumer-label', 'consumer-value'],
					colors: ['metric-healthy', 'metric-warning'],
				},
			}),
		).toBe('unchanged');
		expect(cn('text-consumer-label text-consumer-value')).toBe(before);
	});

	it('canonicalizes every empty configuration form to the same default', async () => {
		const { configureUi } = await freshCnModule();

		expect(configureUi()).toBe('initialized');
		expect(configureUi({})).toBe('unchanged');
		expect(configureUi({ vocab: {} })).toBe('unchanged');
		expect(configureUi({ vocab: { text: [], colors: [] } })).toBe('unchanged');
	});

	it('copies caller arrays before storing configuration', async () => {
		const { cn, configureUi } = await freshCnModule();
		const text = ['consumer-label'];
		const colors = ['metric-healthy'];

		expect(configureUi({ vocab: { text, colors } })).toBe('initialized');
		text.push('consumer-value');
		colors.push('metric-warning');

		expect(cn('text-consumer-label text-consumer-value')).toBe(
			'text-consumer-label text-consumer-value',
		);
		expect(configureUi({ vocab: { text: ['consumer-label'], colors: ['metric-healthy'] } })).toBe(
			'unchanged',
		);
	});

	it('rejects malformed JavaScript vocabulary without locking the module graph', async () => {
		const { cn, configureUi } = await freshCnModule();

		expect(() =>
			configureUi({
				vocab: { text: [null] as unknown as readonly string[] },
			}),
		).toThrow('@yesid/ui configureUi() vocab.text must be an array of strings.');
		expect(configureUi({ vocab: { text: ['consumer-value'] } })).toBe('initialized');
		expect(cn('text-caption text-consumer-value')).toBe('text-consumer-value');
	});

	it('rejects conflicting fields in canonical order and preserves the first merger', async () => {
		const { cn, configureUi } = await freshCnModule();
		expect(
			configureUi({
				vocab: {
					text: ['consumer-label', 'consumer-value'],
					colors: ['metric-healthy'],
				},
			}),
		).toBe('initialized');

		expect(() =>
			configureUi({
				vocab: {
					text: ['other-label'],
					colors: ['metric-warning'],
				},
			}),
		).toThrow(`${CONFLICT_PREFIX}vocab.text, vocab.colors${CONFLICT_SUFFIX}`);
		expect(cn('text-caption text-consumer-value')).toBe('text-consumer-value');
	});

	it('shares one active configuration across root, cn, and primitive imports', async () => {
		vi.resetModules();
		const root = await import('../index.js');
		const subpath = await import('./index.js');

		expect(root.configureUi({ vocab: { text: ['consumer-label', 'consumer-value'] } })).toBe(
			'initialized',
		);
		expect(subpath.configureUi({ vocab: { text: ['consumer-value', 'consumer-label'] } })).toBe(
			'unchanged',
		);
		expect(root.cn).toBe(subpath.cn);

		const { container, cleanup } = await renderFreshBadge(
			'text-consumer-label text-consumer-value',
		);
		expect(container.querySelector('[data-slot="badge"]')?.classList.contains('text-consumer-value')).toBe(
			true,
		);
		cleanup();
		expect(() => subpath.configureUi({ vocab: { text: ['other-label'] } })).toThrow(
			`${CONFLICT_PREFIX}vocab.text${CONFLICT_SUFFIX}`,
		);
		expect(root.cn('text-caption text-consumer-value')).toBe('text-consumer-value');
	});

	it('keeps separately loaded module graphs independent', async () => {
		const first = await freshCnModule();
		expect(first.configureUi({ vocab: { text: ['first-label', 'first-value'] } })).toBe(
			'initialized',
		);
		expect(first.cn('text-caption text-first-value')).toBe('text-first-value');

		vi.resetModules();
		const second = await import('./index.js');
		expect(second.configureUi()).toBe('initialized');
		expect(second.cn('text-caption text-first-value')).toBe('text-caption text-first-value');
		expect(first.configureUi({ vocab: { text: ['first-value', 'first-label'] } })).toBe(
			'unchanged',
		);
		expect(first.cn('text-caption text-first-value')).toBe('text-first-value');
	});
});
