import { describe, expect, it } from 'vitest';
import { renderSatoriPng } from '../satori.js';
import { readOgFonts } from '../og-files.js';

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

	it('escapes crafted SVG attributes before passing output to the rasterizer', async () => {
		let svg = '';
		await renderSatoriPng(
			{
				type: 'div',
				props: {
					style: { color: 'red"/><path data-injected="true"/><text fill="red' },
					children: 'Safe label',
				},
			},
			{ width: 100, height: 100, fonts: readOgFonts(), embedFont: false },
			(rendered) => {
				svg = rendered;
				return new Uint8Array();
			},
		);

		expect(svg).not.toContain('<path data-injected="true"');
		expect(svg).toContain('fill="red&quot;/&gt;&lt;path data-injected=&quot;true&quot;');
	});

	it('rejects caller-supplied internal SVG fields before rasterization', async () => {
		let rasterized = false;
		await expect(
			renderSatoriPng(
				{ type: 'div', props: { style: { _inheritedClipPathId: 'x)"/><path data-injected="true"' } } },
				{ width: 1, height: 1, fonts: [] },
				() => {
					rasterized = true;
					return new Uint8Array();
				},
			),
		).rejects.toThrow('Invalid style property: "_inheritedClipPathId"');
		expect(rasterized).toBe(false);
	});
});
