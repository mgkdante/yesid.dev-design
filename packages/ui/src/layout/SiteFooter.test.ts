import { render, within } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SiteFooter, { type SiteFooterProps } from './SiteFooter.svelte';

const html = (markup: string) => createRawSnippet(() => ({ render: () => markup }));

const groups: SiteFooterProps['groups'] = [
	{
		label: 'Explore',
		links: [
			{ href: '/docs', label: 'Docs' },
			{ href: '/guides', label: 'Guides' },
		],
	},
	{ label: 'Status', navLabel: 'System status', links: [{ href: '/status', label: 'Uptime' }] },
	{
		label: 'Legal',
		testId: 'footer-legal',
		links: [{ href: '/privacy', label: 'Privacy' }],
		after: html('<button type="button" data-testid="footer-preferences">Preferences</button>'),
	},
	{
		label: 'Connect',
		links: [
			{ href: 'https://example.com/code', label: 'GitHub', ariaLabel: 'Code on GitHub', external: true },
			{ href: 'https://example.com/profile', label: 'Profile', external: true, me: true },
			{ href: '/contact', label: 'Contact' },
		],
	},
];

const footer = (props: Partial<SiteFooterProps> = {}) =>
	render(SiteFooter, {
		props: {
			brand: html('<a href="/" data-testid="wordmark">Acme</a>'),
			tagline: 'Sample analytics',
			groups,
			statusPrefix: 'SYSTEM',
			liveLabel: 'Live',
			...props,
		},
	});
type View = ReturnType<typeof footer>;

const root = (view: View) => view.container.querySelector<HTMLElement>('[data-testid="footer"]')!;
const navs = (view: View) => within(root(view)).getAllByRole('navigation');
const links = (nav: HTMLElement) =>
	[...nav.querySelectorAll('a')].map((link) => [link.textContent?.trim(), link.getAttribute('href')]);
const precedes = (a: Node, b: Node) => a.compareDocumentPosition(b) === Node.DOCUMENT_POSITION_FOLLOWING;

const stubObserver = () => {
	const observe = vi.fn();
	const disconnect = vi.fn();
	let report: (isIntersecting: boolean) => void = () => {};
	vi.stubGlobal(
		'IntersectionObserver',
		class {
			observe = observe;
			disconnect = disconnect;
			constructor(callback: IntersectionObserverCallback) {
				report = (isIntersecting) =>
					callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
			}
		},
	);
	return { observe, disconnect, report: (isIntersecting: boolean) => report(isIntersecting) };
};

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('brand', () => {
	it('renders the brand and tagline inside the footer', () => {
		const view = footer();
		expect(root(view).dataset.slot).toBe('footer');
		expect(root(view).contains(view.getByTestId('wordmark'))).toBe(true);
		expect(within(root(view)).getByText('Sample analytics')).toBeInTheDocument();
	});
});

describe('groups', () => {
	it('gives each group its own labelled navigation, in order, with its links in order', () => {
		const view = footer();
		expect(navs(view).map((nav) => nav.getAttribute('aria-label'))).toEqual(['Explore', 'System status', 'Legal', 'Connect']);
		expect(links(navs(view)[0])).toEqual([
			['Docs', '/docs'],
			['Guides', '/guides'],
		]);
		expect(links(navs(view)[1])).toEqual([['Uptime', '/status']]);
	});

	it('keeps the group label as the visible heading when navLabel differs', () => {
		const status = within(footer().getByRole('navigation', { name: 'System status' }));
		expect(status.getByText('Status')).toBeInTheDocument();
	});

	it('puts a group testId on that group navigation only', () => {
		const view = footer();
		expect(view.getAllByTestId('footer-legal')).toHaveLength(1);
		expect(view.getByTestId('footer-legal')).toBe(view.getByRole('navigation', { name: 'Legal' }));
	});

	it('sizes the footer grid by the number of groups', () => {
		expect(root(footer()).style.getPropertyValue('--footer-groups')).toBe('4');
		expect(root(footer({ groups: groups.slice(0, 2) })).style.getPropertyValue('--footer-groups')).toBe('2');
	});

	it('renders after inside its own group, following the links', () => {
		const view = footer();
		const legal = view.getByTestId('footer-legal');
		const button = view.getByTestId('footer-preferences');
		expect(legal.contains(button)).toBe(true);
		expect(precedes(legal.querySelector('a')!, button)).toBe(true);
		expect(view.getAllByTestId('footer-preferences')).toHaveLength(1);
	});
});

describe('links', () => {
	it('opens external links in a new tab with protections and an accessible name', () => {
		const link = footer().getByRole('link', { name: 'Code on GitHub' });
		expect(link.getAttribute('href')).toBe('https://example.com/code');
		expect(link.getAttribute('target')).toBe('_blank');
		expect(link.getAttribute('rel')).toBe('noopener noreferrer');
	});

	it('adds me to the rel of an external link that is the owner profile', () => {
		expect(footer().getByRole('link', { name: 'Profile' }).getAttribute('rel')).toBe('me noopener noreferrer');
	});

	it('leaves internal links in the same tab without an aria-label', () => {
		const link = footer().getByRole('link', { name: 'Contact' });
		expect(link.getAttribute('target')).toBeNull();
		expect(link.getAttribute('rel')).toBeNull();
		expect(link.getAttribute('aria-label')).toBeNull();
	});
});

describe('status row', () => {
	it('shows a labelled live lamp, the prefix and today after statusStart', () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(2026, 6, 30, 12));
		const view = footer({ statusStart: html('<address data-testid="status-start">Montreal</address>') });
		const lamp = root(view).querySelector<HTMLElement>('[data-slot="status-dot"]')!;

		expect(lamp.textContent).toBe('Live');
		expect(lamp.parentElement!.textContent?.replace(/\s+/g, ' ')).toContain('SYSTEM 2026.07.30');
		expect(precedes(view.getByTestId('status-start'), lamp)).toBe(true);
	});

	it('still renders the lamp without statusStart', () => {
		expect(root(footer()).querySelector('[data-slot="status-dot"]')).not.toBeNull();
	});
});

describe('in view', () => {
	it('follows the intersection observer and releases it on unmount', async () => {
		const observer = stubObserver();
		const view = footer();
		await vi.waitFor(() => expect(observer.observe).toHaveBeenCalledWith(root(view)));
		expect(root(view).dataset.inView).toBe('false');

		for (const isIntersecting of [true, false]) {
			observer.report(isIntersecting);
			await tick();
			expect(root(view).dataset.inView).toBe(String(isIntersecting));
		}
		view.unmount();
		expect(observer.disconnect).toHaveBeenCalledOnce();
	});

	it('stays out of view without IntersectionObserver', () => {
		vi.stubGlobal('IntersectionObserver', undefined);
		expect(root(footer()).dataset.inView).toBe('false');
	});
});
