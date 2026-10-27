<script lang="ts">
	import DetailFrame from '../DetailFrame.svelte';
</script>

{#snippet header()}<div>Page header</div>{/snippet}
{#snippet left()}<div>Left rail</div>{/snippet}
{#snippet right()}<div>Right rail</div>{/snippet}
{#snippet after()}<div>After the grid</div>{/snippet}

<DetailFrame {header} {left} {right} {after}>
	<div>Center column</div>
</DetailFrame>
