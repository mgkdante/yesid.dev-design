<script lang="ts">
	import CollapsibleSection from '../CollapsibleSection.svelte';

	let { open }: { open?: boolean } = $props();
</script>
<CollapsibleSection title="Server section" {open}>
	<p>Complete methodology source</p>
</CollapsibleSection>
