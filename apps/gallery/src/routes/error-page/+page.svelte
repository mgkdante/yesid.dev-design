<script lang="ts">
	import { ErrorPage, SiteFooter } from '@yesid/ui/layout';
</script>

<svelte:head>
	<title>yesid.dev-design — error page</title>
</svelte:head>

{#snippet brand()}
	<span class="font-heading font-bold">yesid.dev</span>
{/snippet}

{#snippet statusStart()}
	<span>Sample station, Montreal</span>
{/snippet}

{#snippet themeButton()}
	<button type="button" class="mt-2 rounded-md border border-border px-3 py-1 text-small">Toggle theme</button>
{/snippet}

<ErrorPage
	status={404}
	label="Error 404"
	heading="Wrong platform"
	body="The page you asked for is not on this line."
	suggestions={[
		{ href: '/', label: 'Home' },
		{ href: '/listing-frame', label: 'Listing' },
		{ href: '/detail-frame', label: 'Detail' },
	]}
	suggestionsLabel="Suggested pages"
	statusNote="route not found"
	signLabel="STATION"
/>

<SiteFooter
	{brand}
	tagline="Sample footer copy"
	groups={[
		{ label: 'Pages', links: [{ href: '/', label: 'Home' }, { href: '/listing-frame', label: 'Listing' }] },
		{ label: 'Elsewhere', links: [{ href: 'https://example.com', label: 'Source', external: true }], after: themeButton },
		{ label: 'Contact', links: [{ href: 'mailto:hello@example.com', label: 'Email' }] },
	]}
	{statusStart}
	statusPrefix="System date"
	liveLabel="Live"
/>
