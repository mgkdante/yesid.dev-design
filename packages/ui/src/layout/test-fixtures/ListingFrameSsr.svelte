<script lang="ts">
	import ListingFrame from '../ListingFrame.svelte';

	let { filterPersistKey }: { filterPersistKey?: string } = $props();
</script>

{#snippet blueprint()}<div>Art</div>{/snippet}
{#snippet filters()}<div><input aria-label="Filter query" /><button type="button">Apply filters</button></div>{/snippet}

<ListingFrame heading="Lines" subtitle="Network" filterLabel="Filters" {filterPersistKey} {blueprint} {filters}>
	<div>Results</div>
</ListingFrame>
