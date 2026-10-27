<script lang="ts">
	import { persisted } from '../../state/persisted.svelte.js';
	import SearchInput from '../SearchInput.svelte';

	const query = persisted('some-key', '');
</script>
<SearchInput bind:value={query.value} label="Search lines" placeholder="Route or stop" />
<output data-testid="echo">{query.value}</output>
