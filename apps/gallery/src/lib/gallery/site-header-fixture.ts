import type { SiteHeaderLabels, SiteHeaderLink, SiteHeaderMenuItem } from '@yesid/ui/layout';

/** The Gallery header's data, shared by its route and its browser spec. */
export const HOME = '/site-header';
export const LOCALES = ['en', 'fr'] as const;
export const LANGUAGE_LABEL = 'Language';
export const SEARCH_LABEL = 'Search';
export const LINKS: readonly SiteHeaderLink[] = [
	{ href: HOME, label: 'Header', current: true },
	{ href: '/listing-frame', label: 'Listing', priority: 2 },
	{ href: '/detail-frame', label: 'Detail', priority: 3 },
];
export const MENU_ITEMS: readonly SiteHeaderMenuItem[] = [
	{ href: HOME, label: 'Header', subtitle: 'This page', current: true },
	{ href: '/listing-frame', label: 'Listing', subtitle: 'Listing frame' },
	{ href: '/detail-frame', label: 'Detail', subtitle: 'Detail frame' },
	{ href: 'https://example.com', label: 'Elsewhere', external: true, ariaLabel: 'Elsewhere (opens in a new tab)' },
];
export const LABELS = {
	openMenu: 'Open menu',
	closeMenu: 'Close menu',
	menu: 'Site menu',
	theme: 'Dark theme',
	nav: 'Primary',
	menuFooter: 'Sample footer',
} satisfies SiteHeaderLabels;
export const languageHref = (locale: string) => `${HOME}?lang=${locale}`;
