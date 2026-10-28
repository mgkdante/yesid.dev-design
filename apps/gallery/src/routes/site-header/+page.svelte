<script lang="ts">
	import { afterNavigate, beforeNavigate, onNavigate } from '$app/navigation';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { SiteHeader } from '@yesid/ui/layout';
	import {
		HOME,
		LABELS,
		LANGUAGE_LABEL,
		LINKS,
		LOCALES,
		MENU_ITEMS,
		SEARCH_LABEL,
		languageHref,
	} from '$lib/gallery/site-header-fixture';

	const locale = $derived((browser && page.url.searchParams.get('lang')) || LOCALES[0]);
</script>

<svelte:head>
	<title>yesid.dev-design — site header</title>
</svelte:head>

{#snippet search()}
	<input
		type="search"
		aria-label={SEARCH_LABEL}
		placeholder={SEARCH_LABEL}
		class="h-9 w-56 rounded-full border border-border-subtle bg-muted px-4 text-small"
	/>
{/snippet}

<SiteHeader
	navigation={{ beforeNavigate, onNavigate, afterNavigate }}
	home={HOME}
	links={LINKS}
	menuItems={MENU_ITEMS}
	labels={LABELS}
	language={{ locale, locales: LOCALES, href: languageHref, label: LANGUAGE_LABEL, preserveState: true }}
	{search}
/>

<div style="padding-top: var(--nav-clearance);">
	<h1 class="font-heading text-display font-bold">Site header</h1>
	<p class="mt-4 max-w-prose text-body text-muted-foreground">
		Priority 2 links show from 500px of header width, priority 3 links and search from 1024px. The
		menu holds every destination; a language switch from the open menu keeps it open.
	</p>
</div>
