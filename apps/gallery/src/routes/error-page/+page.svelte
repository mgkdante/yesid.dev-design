<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { ErrorPage, SiteFooter } from '@yesid/ui/layout';

	const suggestions = [
		{ href: '/', label: 'Home' },
		{ href: '/listing-frame', label: 'Listing' },
		{ href: '/detail-frame', label: 'Detail' },
	];
	const longSuggestions = suggestions.map(({ href, label }) => ({
		href,
		label: `${label} with a deliberately long destination label`,
	}));

	let long = $state(false);
	onMount(() => (long = page.url.searchParams.get('long') === '1'));
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
	heading={long
		? 'Wrong platform, and a heading long enough to wrap across several lines on a narrow screen'
		: 'Wrong platform'}
	body={long
		? 'The page you asked for is not on this line. This longer explanation keeps going so the body wraps onto several lines as well and the whole error page grows taller than a short viewport.'
		: 'The page you asked for is not on this line.'}
	suggestions={long ? longSuggestions : suggestions}
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
