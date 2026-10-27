<script lang="ts">
	import CollapsibleSection from '../CollapsibleSection.svelte';

	let { open = $bindable(true), quiet = true }: { open?: boolean; quiet?: boolean } = $props();
</script>
<CollapsibleSection title="Bound" bind:open {quiet} />
<output data-testid="bound">{open}</output>
