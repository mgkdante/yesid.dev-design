import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import * as blueprints from './index.js';

describe('blueprints', () => {
	it.each(Object.entries(blueprints))('%s forwards attributes to its SVG with a viewBox', (name, Drawing) => {
		const view = render(Drawing, { props: { class: 'probe', 'data-part': name } });
		const drawings = view.container.querySelectorAll('svg');
		expect(drawings).toHaveLength(1);
		expect(drawings[0].getAttribute('viewBox')).toBeTruthy();
		expect(drawings[0].getAttribute('data-part')).toBe(name);
		expect(drawings[0].getAttribute('class')?.split(/\s+/)).toContain('probe');
	});

	it('keeps ids unique and every paint reference within its own drawing across instances', () => {
		for (const Drawing of Object.values(blueprints)) {
			render(Drawing);
			render(Drawing);
		}
		const ids = new Set<string>();
		for (const element of document.body.querySelectorAll('*')) {
			if (element.hasAttribute('id')) {
				expect(ids.has(element.id), element.id).toBe(false);
				ids.add(element.id);
			}
			for (const name of element.getAttributeNames()) {
				if (!/^(fill|clip-path|stroke|mask|marker-.*)$/.test(name)) continue;
				for (const [, id] of element.getAttribute(name)!.matchAll(/url\(['"]?#([^)'"\s]+)['"]?\)/g)) {
					const target = document.getElementById(id);
					expect(target, id).not.toBeNull();
					expect(element.closest('svg')?.contains(target), id).toBe(true);
				}
			}
		}
	});
});
