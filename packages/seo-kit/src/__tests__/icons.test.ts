import { describe, expect, it } from 'vitest';
import { brandMarkSvg, touchIconSvg } from '../icons.js';

describe('icons', () => {
	it('draws the mark only in the given color', () => {
		const svg = brandMarkSvg('#123456');
		expect(svg.startsWith('<svg')).toBe(true);
		expect(svg).toContain('#123456');
		expect(svg).not.toMatch(/#(?!123456)[0-9a-f]{6}/i);
	});

	it('sizes the touch icon and fills its ground', () => {
		const svg = touchIconSvg('#000000', '#ffffff', 64);
		expect(svg).toContain('width="64"');
		expect(svg).toContain('height="64"');
		expect(svg).toContain('fill="#000000"');
		expect(svg).toContain('#ffffff');
	});
});
