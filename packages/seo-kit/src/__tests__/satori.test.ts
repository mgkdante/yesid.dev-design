import { describe, expect, it } from 'vitest';
import { renderSatoriPng } from '../satori.js';

describe('renderSatoriPng', () => {
	it('passes Satori SVG bytes to the injected rasterizer unchanged', async () => {
		let svg = '';
		const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
		const result = await renderSatoriPng(
			{ type: 'div', props: { style: { display: 'flex', width: '1200px', height: '630px' }, children: null } },
			{ width: 1200, height: 630, fonts: [] },
			(rendered) => {
				svg = rendered;
				return bytes;
			},
		);

		expect(svg).toContain('<svg');
		expect(svg).toContain('width="1200"');
		expect(svg).toContain('height="630"');
		expect(result).toBe(bytes);
	});

	it('preserves rasterizer failure semantics', async () => {
		await expect(
			renderSatoriPng(
				{ type: 'div', props: { style: { display: 'flex' }, children: null } },
				{ width: 1, height: 1, fonts: [] },
				() => {
					throw new Error('rasterizer boom');
				},
			),
		).rejects.toThrow('rasterizer boom');
	});
});
