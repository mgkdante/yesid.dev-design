import { describe, expect, it } from 'vitest';
import { OG_HEIGHT, OG_PALETTE, OG_WIDTH, renderOgPng } from '../og.js';
import { ogFonts } from '../og-fonts.js';
import { readOgFonts } from '../og-files.js';

const card = { eyebrow: 'Blog', wordmark: 'yesid', title: 'A share card', handle: 'example.com', location: 'Montréal' };

describe('share card', () => {
	it('hands the rasterizer a token-backed card with the grid behind its foreground', async () => {
		let svg = '';
		const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
		const result = await renderOgPng(card, readOgFonts(), (rendered) => {
			svg = rendered;
			return png;
		});
		expect(result).toBe(png);
		expect(svg).toContain(`width="${OG_WIDTH}"`);
		expect(svg).toContain(`height="${OG_HEIGHT}"`);
		expect(svg.toLowerCase()).toContain(OG_PALETTE.background.toLowerCase());
		const grid = [...svg.matchAll(/<rect\b[^>]*fill-opacity="0\.(?:04|07)"[^>]*\/>/gu)]
			.map(([rectangle]) => rectangle);
		expect(grid).toEqual(expect.arrayContaining([
			expect.stringContaining(`width="1" height="${OG_HEIGHT}"`),
			expect.stringContaining(`width="${OG_WIDTH}" height="1"`),
		]));
		expect(grid.every((rectangle) => rectangle.includes(`fill="${OG_PALETTE.accent}"`))).toBe(true);
		expect(svg.indexOf(grid.at(-1)!)).toBeLessThan(svg.indexOf('<path'));
	});

	it('loads the same fonts for request-time and build-time rendering', () => {
		const read = readOgFonts();
		expect(ogFonts.map(({ data, ...face }) => face)).toEqual(read.map(({ data, ...face }) => face));
		for (const [index, face] of read.entries()) {
			expect(face.data.byteLength).toBeGreaterThan(0);
			expect(Buffer.from(ogFonts[index]!.data).equals(Buffer.from(face.data))).toBe(true);
		}
	});
});
