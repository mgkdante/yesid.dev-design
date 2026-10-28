import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import * as blueprints from '@yesid/ui/blueprints';
import { describe, expect, it } from 'vitest';

import { GALLERY_COVERAGE } from '../src/lib/gallery/coverage.js';
import GalleryPage from '../src/routes/+page.svelte';

type PackageManifest = { exports?: Record<string, unknown> };

function source(path: string): string {
	return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function exportedComponents(path: string): string[] {
	return [...source(path).matchAll(/^export \{ default as (\w+) \}/gm)]
		.map(([, name]) => name!)
		.sort();
}

function exportedActions(path: string): string[] {
	return [...source(path).matchAll(/^export \{ (\w+)(?:,| \})/gm)]
		.map(([, name]) => name!)
		.sort();
}

describe('Gallery coverage authority', () => {
	it('tracks every public primitive family from the package export map', () => {
		const manifest = JSON.parse(source('../../../packages/ui/package.json')) as PackageManifest;
		const publicPrimitives = Object.entries(manifest.exports ?? {})
			.filter(([, target]) => JSON.stringify(target).includes('/primitives/'))
			.map(([subpath]) => subpath.slice(2))
			.sort();

		expect([...GALLERY_COVERAGE.primitives].sort()).toEqual(publicPrimitives);
	});

	it('tracks every public brand component and motion-action family', () => {
		expect([...GALLERY_COVERAGE.brand].sort()).toEqual(
			exportedComponents('../../../packages/ui/src/brand/index.ts'),
		);
		expect([...GALLERY_COVERAGE.motion].sort()).toEqual(
			exportedActions('../../../packages/motion/src/actions/index.ts'),
		);
	});

	it('makes the required state and environment matrix explicit', () => {
		expect(GALLERY_COVERAGE.states).toEqual([
			'disabled',
			'error',
			'loading',
			'overflow',
			'localized-copy',
		]);
		expect(GALLERY_COVERAGE.environments).toEqual([
			'dark',
			'light',
			'reduced-motion',
			'desktop',
			'mobile',
		]);
	});

	it('server-renders every family and state scenario from the executable matrix', () => {
		const { body } = render(GalleryPage);
		for (const name of Object.keys(blueprints)) {
			expect(body, `blueprint:${name}`).toContain(`data-gallery-blueprint="${name}"`);
		}
		for (const family of GALLERY_COVERAGE.primitives) {
			expect(body, `primitive:${family}`).toContain(
				`data-gallery-family="primitive:${family}"`,
			);
		}
		for (const family of GALLERY_COVERAGE.brand) {
			expect(body, `brand:${family}`).toContain(`data-gallery-family="brand:${family}"`);
		}
		for (const family of GALLERY_COVERAGE.motion) {
			expect(body, `motion:${family}`).toContain(`data-gallery-family="motion:${family}"`);
		}
		for (const state of GALLERY_COVERAGE.states) {
			expect(body, `state:${state}`).toContain(`data-gallery-state="${state}"`);
		}
	});
});
