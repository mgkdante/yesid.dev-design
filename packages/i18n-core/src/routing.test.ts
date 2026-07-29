import { describe, expect, it } from 'vitest';
import { createLocaleRouting, type UrlParts } from './routing.js';

type Locale = 'en' | 'fr' | 'es';

const PREFIX_LOCALES = ['fr', 'es'] as const satisfies readonly Locale[];
const LOCALE_SEGMENT = '/[[lang=locale]]';
const isPathExempt = (pathname: string): boolean =>
	pathname === '/status.txt' || pathname.startsWith('/internal/');

const routing = createLocaleRouting<Locale>({
	defaultLocale: 'en',
	prefixLocales: PREFIX_LOCALES,
	isPathExempt,
	localeSegment: LOCALE_SEGMENT,
	preserveSearchAndHash: true,
});

const {
	pathLocale,
	delocalizePath,
	localizeHref,
	localizeUrl,
	isLocaleSwitch,
	stripLocaleSegment,
	isPrefixLocale,
} = routing;

describe('createLocaleRouting', () => {
	it('rejects a default locale that is also configured as a prefix', () => {
		expect(() =>
			createLocaleRouting({
				defaultLocale: 'en',
				prefixLocales: ['en'],
				isPathExempt: () => false,
				localeSegment: LOCALE_SEGMENT,
				preserveSearchAndHash: true,
			}),
		).toThrow('defaultLocale must not appear in prefixLocales');
	});
});

describe('pathLocale', () => {
	it('reads the first segment when it is a configured prefix', () => {
		expect(pathLocale('/fr')).toBe('fr');
		expect(pathLocale('/fr/')).toBe('fr');
		expect(pathLocale('/fr/about')).toBe('fr');
		expect(pathLocale('/es/about')).toBe('es');
	});

	it('uses the configured default otherwise', () => {
		expect(pathLocale('/')).toBe('en');
		expect(pathLocale('/about')).toBe('en');
		expect(pathLocale('/france')).toBe('en');
		expect(pathLocale('/de/about')).toBe('en');
	});
});

describe('delocalizePath', () => {
	it('strips a configured locale prefix', () => {
		expect(delocalizePath('/fr')).toBe('/');
		expect(delocalizePath('/fr/')).toBe('/');
		expect(delocalizePath('/fr/about')).toBe('/about');
		expect(delocalizePath('/es/reports/daily')).toBe('/reports/daily');
	});

	it('passes unprefixed paths through', () => {
		expect(delocalizePath('/')).toBe('/');
		expect(delocalizePath('/about')).toBe('/about');
		expect(delocalizePath('/france')).toBe('/france');
		expect(delocalizePath('')).toBe('/');
	});
});

describe('localizeHref', () => {
	it('prefixes internal page hrefs for a configured locale', () => {
		expect(localizeHref('/', 'fr')).toBe('/fr');
		expect(localizeHref('/about', 'fr')).toBe('/fr/about');
		expect(localizeHref('/reports/daily', 'fr')).toBe('/fr/reports/daily');
	});

	it('is identity for the default locale', () => {
		expect(localizeHref('/about', 'en')).toBe('/about');
		expect(localizeHref('/', 'en')).toBe('/');
	});

	it('is idempotent across already-localized input', () => {
		expect(localizeHref('/fr/about', 'fr')).toBe('/fr/about');
		expect(localizeHref('/fr/about', 'en')).toBe('/about');
		expect(localizeHref('/es/about', 'fr')).toBe('/fr/about');
	});

	it('passes external, special, and consumer-exempt hrefs through', () => {
		expect(localizeHref('https://example.test/path', 'fr')).toBe(
			'https://example.test/path',
		);
		expect(localizeHref('//cdn.example.test/file.js', 'fr')).toBe(
			'//cdn.example.test/file.js',
		);
		expect(localizeHref('mailto:hello@example.test', 'fr')).toBe(
			'mailto:hello@example.test',
		);
		expect(localizeHref('#section', 'fr')).toBe('#section');
		expect(localizeHref('/status.txt', 'fr')).toBe('/status.txt');
		expect(localizeHref('/internal/health', 'fr')).toBe('/internal/health');
	});

	it('applies every configured non-default prefix locale', () => {
		expect(localizeHref('/about', 'es')).toBe('/es/about');
		expect(localizeHref('/es/about', 'en')).toBe('/about');
	});
});

describe('localizeUrl', () => {
	const url = (value: string) => new URL(value, 'https://example.test');

	it('preserves the query string and hash when adding a prefix', () => {
		expect(localizeUrl(url('/reports?period=week#chart'), 'fr')).toBe(
			'/fr/reports?period=week#chart',
		);
	});

	it('preserves URL state when removing a prefix', () => {
		expect(localizeUrl(url('/fr/reports?period=week#chart'), 'en')).toBe(
			'/reports?period=week#chart',
		);
	});

	it('is idempotent on already-localized paths', () => {
		expect(localizeUrl(url('/fr/reports?period=week'), 'fr')).toBe(
			'/fr/reports?period=week',
		);
	});

	it('works with no query string or hash', () => {
		expect(localizeUrl(url('/about'), 'fr')).toBe('/fr/about');
		expect(localizeUrl(url('/'), 'fr')).toBe('/fr');
	});

	it('preserves a hash-only URL', () => {
		expect(localizeUrl(url('/about#contact'), 'fr')).toBe('/fr/about#contact');
	});

	it('does not read search or hash when preservation is disabled', () => {
		const buildRouting = createLocaleRouting<Locale>({
			defaultLocale: 'en',
			prefixLocales: PREFIX_LOCALES,
			isPathExempt,
			localeSegment: LOCALE_SEGMENT,
			preserveSearchAndHash: false,
		});
		const buildUrl: UrlParts = {
			pathname: '/reports',
			get search(): string {
				throw new Error('search must not be read');
			},
			get hash(): string {
				throw new Error('hash must not be read');
			},
		};

		expect(buildRouting.localizeUrl(buildUrl, 'fr')).toBe('/fr/reports');
	});
});

describe('isLocaleSwitch', () => {
	it('is true for the same canonical page in a different locale', () => {
		expect(isLocaleSwitch('/about', '/fr/about')).toBe(true);
		expect(isLocaleSwitch('/fr/about', '/about')).toBe(true);
		expect(isLocaleSwitch('/', '/fr')).toBe(true);
		expect(isLocaleSwitch('/fr', '/')).toBe(true);
		expect(isLocaleSwitch('/reports', '/es/reports')).toBe(true);
	});

	it('is false for a different page', () => {
		expect(isLocaleSwitch('/about', '/reports')).toBe(false);
		expect(isLocaleSwitch('/about', '/fr/reports')).toBe(false);
		expect(isLocaleSwitch('/fr/about', '/fr/reports')).toBe(false);
	});

	it('is false when the locale is unchanged', () => {
		expect(isLocaleSwitch('/about', '/about')).toBe(false);
		expect(isLocaleSwitch('/fr/about', '/fr/about')).toBe(false);
		expect(isLocaleSwitch('/', '/')).toBe(false);
	});
});

describe('stripLocaleSegment', () => {
	it('strips the configured locale segment from route ids', () => {
		expect(stripLocaleSegment('/[[lang=locale]]')).toBe('/');
		expect(stripLocaleSegment('/[[lang=locale]]/about')).toBe('/about');
		expect(stripLocaleSegment('/[[lang=locale]]/reports/[id]')).toBe('/reports/[id]');
	});

	it('passes other route ids through', () => {
		expect(stripLocaleSegment('/')).toBe('/');
		expect(stripLocaleSegment('/assets/[name].png')).toBe('/assets/[name].png');
		expect(stripLocaleSegment('/__error')).toBe('/__error');
	});
});

describe('isPrefixLocale', () => {
	it('accepts every configured prefix locale', () => {
		expect(isPrefixLocale('fr')).toBe(true);
		expect(isPrefixLocale('es')).toBe(true);
	});

	it('rejects the default locale', () => {
		expect(isPrefixLocale('en')).toBe(false);
	});

	it('rejects arbitrary route segments', () => {
		expect(isPrefixLocale('about')).toBe(false);
		expect(isPrefixLocale('FR')).toBe(false);
		expect(isPrefixLocale('')).toBe(false);
		expect(isPrefixLocale('france')).toBe(false);
	});
});
