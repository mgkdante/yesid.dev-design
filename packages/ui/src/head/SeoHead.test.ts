import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import SeoHead, { type SeoHeadProps } from './SeoHead.svelte';

const page: SeoHeadProps = {
	title: 'Lines',
	description: 'Every line and its reliability.',
	siteName: 'Example',
	canonical: 'https://example.com/lines',
	alternates: [
		{ hreflang: 'en', href: 'https://example.com/lines' },
		{ hreflang: 'fr', href: 'https://example.com/fr/lines' },
		{ hreflang: 'x-default', href: 'https://example.com/lines' },
	],
	ogLocale: 'en_CA',
	ogLocaleAlternates: ['fr_CA'],
	image: { url: 'https://example.com/og/en.png', alt: 'Example: Lines' },
	jsonLd: [{ '@type': 'WebSite', name: 'Ex</script>ample' }],
};

const head = () => document.head;
const meta = (attribute: 'name' | 'property', key: string) =>
	head().querySelector(`meta[${attribute}="${key}"]`)?.getAttribute('content');

describe('SeoHead', () => {
	it('writes the page into the tags crawlers and share previews read', () => {
		render(SeoHead, { props: page });
		expect(document.title).toBe(page.title);
		expect(meta('name', 'description')).toBe(page.description);
		expect(head().querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(page.canonical);
		const alternates = [...head().querySelectorAll('link[rel="alternate"]')].map((link) => ({
			hreflang: link.getAttribute('hreflang'),
			href: link.getAttribute('href'),
		}));
		expect(alternates).toEqual(page.alternates);
		expect(meta('property', 'og:url')).toBe(page.canonical);
		expect(meta('property', 'og:image')).toBe(page.image.url);
		expect(meta('name', 'twitter:image')).toBe(page.image.url);
		expect(meta('property', 'og:locale')).toBe(page.ogLocale);
		const localeAlternates = [...head().querySelectorAll('meta[property="og:locale:alternate"]')];
		expect(localeAlternates.map((tag) => tag.getAttribute('content'))).toEqual(page.ogLocaleAlternates);
		expect(head().querySelector('meta[name="robots"]')).toBeNull();
	});

	it('leaves canonical, og:url and hreflang off a page without a canonical, and can keep it out of search', () => {
		render(SeoHead, { props: { ...page, canonical: undefined, noIndex: true } });
		expect(head().querySelector('link[rel="canonical"], link[rel="alternate"], meta[property="og:url"]')).toBeNull();
		expect(meta('name', 'robots')).toContain('noindex');
	});

	it('emits one JSON-LD graph that parses back to the nodes', () => {
		render(SeoHead, { props: page });
		const scripts = head().querySelectorAll('script[type="application/ld+json"]');
		expect(scripts).toHaveLength(1);
		expect(JSON.parse(scripts[0]!.textContent ?? '')['@graph']).toEqual(page.jsonLd);
	});
});
