<script lang="ts">
	import { afterNavigate, beforeNavigate, onNavigate } from '$app/navigation';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { SiteHeader } from '@yesid/ui/layout';

	const locale = $derived((browser && page.url.searchParams.get('lang')) || 'en');
</script>

<svelte:head>
	<title>yesid.dev-design — site header</title>
</svelte:head>

{#snippet search()}
	<input
		type="search"
		aria-label="Search"
		placeholder="Search"
		class="h-9 w-56 rounded-full border border-border-subtle bg-muted px-4 text-small"
	/>
{/snippet}

<SiteHeader
	navigation={{ beforeNavigate, onNavigate, afterNavigate }}
	home="/site-header"
	links={[
		{ href: '/site-header', label: 'Header', current: true },
		{ href: '/listing-frame', label: 'Listing', priority: 2 },
		{ href: '/detail-frame', label: 'Detail', priority: 3 },
	]}
	menuItems={[
		{ href: '/site-header', label: 'Header', subtitle: 'This page', current: true },
		{ href: '/listing-frame', label: 'Listing', subtitle: 'Listing frame' },
		{ href: '/detail-frame', label: 'Detail', subtitle: 'Detail frame' },
		{ href: 'https://example.com', label: 'Elsewhere', external: true, ariaLabel: 'Elsewhere (opens in a new tab)' },
	]}
	labels={{
		openMenu: 'Open menu',
		closeMenu: 'Close menu',
		menu: 'Site menu',
		theme: 'Dark theme',
		nav: 'Primary',
		menuFooter: 'Sample footer',
	}}
	language={{
		locale,
		locales: ['en', 'fr'],
		href: (next) => `/site-header?lang=${next}`,
		label: 'Language',
		preserveState: true,
	}}
	{search}
/>

<div style="padding-top: var(--nav-clearance);">
	<h1 class="font-heading text-display font-bold">Site header</h1>
	<p class="mt-4 max-w-prose text-body text-muted-foreground">
		Priority 2 links show from 500px of header width, priority 3 links and search from 1024px. The
		menu holds every destination; a language switch from the open menu keeps it open.
	</p>
</div>
