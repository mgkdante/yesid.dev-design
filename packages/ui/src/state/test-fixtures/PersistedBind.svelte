<script lang="ts">
	import { persisted } from '../persisted.svelte.js';

	const query = persisted('bind-fixture', '');
</script>
<input data-testid="input" bind:value={query.value} />
<output data-testid="echo">{query.value}</output>
