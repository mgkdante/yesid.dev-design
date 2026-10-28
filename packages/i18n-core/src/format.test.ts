import { describe, expect, it } from 'vitest';
import { createIntl } from './format.js';

const tags = { en: 'en-CA', fr: 'fr-CA' } as const;
type Locale = keyof typeof tags;
const locales = Object.keys(tags) as Locale[];
const intl = createIntl<Locale>(tags);

describe('createIntl', () => {
	it.each(locales)('formats %s with its tag and reuses one formatter per request', (locale) => {
		expect(intl.number(locale).format(1234.5)).toBe(new Intl.NumberFormat(tags[locale]).format(1234.5));
		const date = new Date('2026-06-15T12:00:00Z');
		const options = { dateStyle: 'medium', timeZone: 'UTC' } as const;
		expect(intl.dateTime(locale, options).format(date)).toBe(new Intl.DateTimeFormat(tags[locale], options).format(date));
		expect(['b', 'a'].sort(intl.collator(locale).compare)).toEqual(['a', 'b']);
		expect(intl.number(locale, { maximumFractionDigits: 0 })).toBe(intl.number(locale, { maximumFractionDigits: 0 }));
		expect(intl.number(locale, { maximumFractionDigits: 0 })).not.toBe(intl.number(locale));
	});

	// [offset in seconds, expected value, expected unit]: the largest whole unit, rounding half away from zero.
	it.each([
		[-4, 0, 'second'],
		[4, 0, 'second'],
		[-5, -5, 'second'],
		[-90, -2, 'minute'],
		[-150, -3, 'minute'],
		[3_600, 1, 'hour'],
		[-86_400, -1, 'day'],
		[-14 * 86_400, -2, 'week'],
	] as const)('reads %i seconds as %i %s in every locale', (seconds, value, unit) => {
		for (const locale of locales) {
			const native = new Intl.RelativeTimeFormat(tags[locale], { numeric: 'auto' });
			expect(intl.relativeTime(locale, seconds)).toBe(native.format(value, unit));
		}
	});

	it('throws on a non-finite offset, as Intl does', () => {
		expect(() => intl.relativeTime('en', Number.NaN)).toThrow(RangeError);
	});
});
