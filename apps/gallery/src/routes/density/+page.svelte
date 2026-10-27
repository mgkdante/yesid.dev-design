<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';

	onMount(() => {
		if (page.url.searchParams.get('density') !== 'compact') return;
		document.documentElement.dataset.density = 'compact';
		return () => {
			delete document.documentElement.dataset.density;
		};
	});
</script>

<svelte:head>
	<title>yesid.dev-design — density</title>
</svelte:head>

{#snippet scale(name: string)}
	<p class="text-body" data-testid="{name}-class">Body copy sized by the text-body class.</p>
	<p class="body-var" data-testid="{name}-body">Body copy sized by the body token.</p>
	<p class="detail-var" data-testid="{name}-detail">Detail copy sized by the detail body token.</p>
{/snippet}

<h1 class="font-heading text-title font-semibold">Density</h1>

<section aria-label="Default density" class="mt-6 grid gap-2">
	{@render scale('default')}
</section>

<section aria-label="Compact density" data-density="compact" class="mt-6 grid gap-2">
	{@render scale('compact')}
</section>

<style>
	.body-var {
		font-size: var(--text-body);
	}
	.detail-var {
		font-size: var(--text-detail-body-desktop);
	}
</style>
