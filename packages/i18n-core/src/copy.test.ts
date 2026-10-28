import { expect, it } from 'vitest';
import { createCopy } from './copy.js';

type Locale = 'fr' | 'en' | 'es';
const defineCopy = createCopy<Locale, 'fr'>();

// @ts-expect-error Every locale must be present.
defineCopy({ fr: { title: 'Titre' }, en: { title: 'Title' } });
// @ts-expect-error Every locale must keep the source locale's keys.
defineCopy({ fr: { title: 'Titre', hint: 'Astuce' }, en: { title: 'Title' }, es: { title: 'Título' } });

it('returns the copy unchanged, formatters included', () => {
	const copy = {
		fr: { title: 'Titre', trips: (n: number) => `${n} trajets` },
		en: { title: 'Title', trips: (n: number) => `${n} trips` },
		es: { title: 'Título', trips: (n: number) => `${n} viajes` },
	};
	const localized = defineCopy(copy);
	expect(localized).toBe(copy);
	expect(localized.es.trips(3)).toBe('3 viajes');
});
