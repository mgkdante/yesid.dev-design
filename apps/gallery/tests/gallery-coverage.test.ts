import { readFileSync } from 'node:fs';
import * as brand from '@yesid/ui/brand';
import * as motionActions from '@yesid/motion/actions';
import { describe, expect, it } from 'vitest';

import { GALLERY_COVERAGE } from '../src/lib/gallery/coverage.js';

type PackageManifest = { exports?: Record<string, unknown> };

function source(path: string): string {
	return readFileSync(new URL(path, import.meta.url), 'utf8');
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
		const components = Object.entries(brand)
			.filter(([name, value]) => /^[A-Z]/.test(name) && typeof value === 'function')
			.map(([name]) => name);
		expect([...GALLERY_COVERAGE.brand].sort()).toEqual(components.sort());
		expect([...GALLERY_COVERAGE.motion].sort()).toEqual(Object.keys(motionActions).sort());
	});
});
