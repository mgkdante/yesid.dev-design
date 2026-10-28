import { getContext, setContext } from 'svelte';

export interface LocaleContext<Locale extends string> {
	/** Call once from the root layout; `read` closes over reactive data, so readers stay current. */
	provide(read: () => Locale): void;
	/** The provided locale, or the fallback where nothing provides one, such as a unit test. */
	get(): Locale;
}

export function createLocaleContext<Locale extends string>(fallback: Locale): LocaleContext<Locale> {
	const key = Symbol('locale');
	return {
		provide: (read) => void setContext(key, read),
		get: () => getContext<(() => Locale) | undefined>(key)?.() ?? fallback,
	};
}
