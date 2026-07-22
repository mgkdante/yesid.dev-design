import { describe, expect, it } from 'vitest';
import { emitAlternateSitemapEntries, emitSitemapDocument, toW3CDate, xmlEscape } from '../sitemap.js';

const variants = [
	{ hreflang: 'en', href: 'https://example.com/about' },
	{ hreflang: 'fr', href: 'https://example.com/fr/about' },
] as const;

describe('sitemap byte contracts', () => {
	it('emits yesid.dev spaced empty elements and no trailing newline', () => {
		const entries = emitAlternateSitemapEntries({
			variants,
			xDefaultHref: 'https://example.com/about',
			emptyElementStyle: 'spaced',
		});
		expect(entries[0]).toBe(
			'  <url>\n    <loc>https://example.com/about</loc>\n    <xhtml:link rel="alternate" hreflang="en" href="https://example.com/about" />\n    <xhtml:link rel="alternate" hreflang="fr" href="https://example.com/fr/about" />\n    <xhtml:link rel="alternate" hreflang="x-default" href="https://example.com/about" />\n  </url>',
		);
		expect(emitSitemapDocument(entries)).toBe(
			'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + entries.join('\n') + '\n</urlset>',
		);
	});

	it('emits Transit compact empty elements, lastmod, and trailing newline', () => {
		const entries = emitAlternateSitemapEntries({
			variants,
			xDefaultHref: 'https://example.com/about',
			lastmod: '2026-06-20T07:00:00Z',
			emptyElementStyle: 'compact',
		});
		expect(entries[0]).toBe(
			'  <url>\n    <loc>https://example.com/about</loc>\n    <lastmod>2026-06-20T07:00:00.000Z</lastmod>\n    <xhtml:link rel="alternate" hreflang="en" href="https://example.com/about"/>\n    <xhtml:link rel="alternate" hreflang="fr" href="https://example.com/fr/about"/>\n    <xhtml:link rel="alternate" hreflang="x-default" href="https://example.com/about"/>\n  </url>',
		);
		expect(emitSitemapDocument(entries, { trailingNewline: true })).toMatch(/<\/urlset>\n$/);
	});

	it('escapes XML and never invents lastmod values', () => {
		expect(xmlEscape(`a&b<c>d'e"f`)).toBe('a&amp;b&lt;c&gt;d&apos;e&quot;f');
		expect(toW3CDate('2026-06-20T07:00:00Z')).toBe('2026-06-20T07:00:00.000Z');
		expect(toW3CDate('garbage')).toBeNull();
		expect(toW3CDate(undefined)).toBeNull();
	});
});
