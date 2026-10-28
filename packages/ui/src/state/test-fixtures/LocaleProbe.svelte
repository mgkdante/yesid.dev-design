<script lang="ts" module>
	import { createLocaleContext } from '../locale.js';

	const locale = createLocaleContext<'en' | 'fr'>('en');
</script>

<script lang="ts">
	import { untrack } from 'svelte';

	let { provided }: { provided?: 'en' | 'fr' } = $props();

	if (untrack(() => provided)) locale.provide(() => provided!);
</script>

<output>{locale.get()}</output>
