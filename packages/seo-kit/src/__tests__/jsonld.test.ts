import { describe, expect, it } from 'vitest';
import {
	buildBreadcrumbListJsonLd,
	buildCollectionPageJsonLd,
	buildDatasetJsonLd,
	buildOrganizationJsonLd,
	buildProfilePageJsonLd,
	buildWebSiteJsonLd,
} from '../jsonld.js';

describe('JSON-LD byte contracts', () => {
	it('preserves Transit WebSite and BreadcrumbList property order', () => {
		const website = buildWebSiteJsonLd({
			context: true,
			name: 'STM Analytics',
			url: 'https://transit.yesid.dev',
			inLanguage: 'fr',
			searchUrlTemplate: 'https://transit.yesid.dev/search?q={query}',
		});
		expect(JSON.stringify(website)).toBe(
			'{"@context":"https://schema.org","@type":"WebSite","name":"STM Analytics","url":"https://transit.yesid.dev","inLanguage":"fr","potentialAction":{"@type":"SearchAction","target":{"@type":"EntryPoint","urlTemplate":"https://transit.yesid.dev/search?q={query}"},"query-input":"required name=query"}}',
		);

		const breadcrumb = buildBreadcrumbListJsonLd({
			context: true,
			empty: 'null',
			items: [
				{ name: 'Home', url: 'https://transit.yesid.dev/' },
				{ name: 'Lines', url: 'https://transit.yesid.dev/lines' },
			],
		});
		expect(JSON.stringify(breadcrumb)).toBe(
			'{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://transit.yesid.dev/"},{"@type":"ListItem","position":2,"name":"Lines","item":"https://transit.yesid.dev/lines"}]}',
		);
		expect(buildBreadcrumbListJsonLd({ context: true, empty: 'null', items: [] })).toBeNull();
	});

	it('preserves yesid.dev WebSite and BreadcrumbList property order', () => {
		const website = buildWebSiteJsonLd({
			id: 'https://yesid.dev/#website',
			name: 'yesid.dev',
			url: 'https://yesid.dev',
			description: 'Digital infrastructure for practical teams.',
			publisher: { '@id': 'https://yesid.dev/#person' },
		});
		expect(JSON.stringify(website)).toBe(
			'{"@type":"WebSite","@id":"https://yesid.dev/#website","name":"yesid.dev","url":"https://yesid.dev","description":"Digital infrastructure for practical teams.","publisher":{"@id":"https://yesid.dev/#person"}}',
		);

		const breadcrumb = buildBreadcrumbListJsonLd({
			id: 'https://yesid.dev/about#breadcrumb',
			items: [
				{ name: 'Home', url: 'https://yesid.dev' },
				{ name: 'About', url: 'https://yesid.dev/about' },
			],
		});
		expect(JSON.stringify(breadcrumb)).toBe(
			'{"@type":"BreadcrumbList","@id":"https://yesid.dev/about#breadcrumb","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://yesid.dev"},{"@type":"ListItem","position":2,"name":"About","item":"https://yesid.dev/about"}]}',
		);
	});

	it('builds the remaining neutral node shapes without consumer policy', () => {
		expect(buildOrganizationJsonLd({ context: true, id: 'https://example.com#org', name: 'Example', url: 'https://example.com' })).toEqual({
			'@context': 'https://schema.org',
			'@type': 'Organization',
			'@id': 'https://example.com#org',
			name: 'Example',
			url: 'https://example.com',
		});
		expect(buildDatasetJsonLd({
			context: true,
			name: 'Network data',
			description: 'Measured service data.',
			url: 'https://example.com',
			inLanguage: 'en',
			license: 'https://creativecommons.org/licenses/by/4.0/',
			isAccessibleForFree: true,
			creator: { '@type': 'Organization', '@id': 'https://example.com#org', name: 'Example', url: 'https://example.com' },
		})).toMatchObject({ '@type': 'Dataset', name: 'Network data' });
		expect(buildProfilePageJsonLd({ id: 'https://example.com/about#profile', mainEntity: { '@id': 'https://example.com#person' } })).toEqual({
			'@type': 'ProfilePage',
			'@id': 'https://example.com/about#profile',
			mainEntity: { '@id': 'https://example.com#person' },
		});
		expect(buildCollectionPageJsonLd({ id: 'https://example.com/work#collection', name: 'Work', description: 'Selected work.', url: 'https://example.com/work' })).toEqual({
			'@type': 'CollectionPage',
			'@id': 'https://example.com/work#collection',
			name: 'Work',
			description: 'Selected work.',
			url: 'https://example.com/work',
		});
	});
});
