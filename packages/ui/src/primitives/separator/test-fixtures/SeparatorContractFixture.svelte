<script lang="ts">
	import { Separator } from '../index.js';

	let hazardRef = $state<HTMLDivElement | null>(null);
</script>

<Separator
	bind:ref={hazardRef}
	variant="hazard"
	orientation="vertical"
	maxWidth="100%"
	data-slot="custom-hazard"
	data-testid="hazard"
/>

<Separator variant="gradient" data-slot="custom-gradient" data-testid="gradient" />

<Separator variant="default">
	{#snippet child({ props })}
		<hr {...props} data-testid="delegated-default" />
	{/snippet}
</Separator>

<output data-testid="hazard-ref">{hazardRef?.tagName ?? ''}</output>

