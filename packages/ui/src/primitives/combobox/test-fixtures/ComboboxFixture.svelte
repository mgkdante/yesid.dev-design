<script lang="ts">
	import { Combobox, type ComboboxOption } from '../index.js';

	interface Props {
		options: readonly ComboboxOption[];
		value?: string | null;
	}

	let { options, value = $bindable(null) }: Props = $props();

	function fold(raw: string): string {
		return raw
			.normalize('NFD')
			.replace(/\p{Diacritic}/gu, '')
			.toLowerCase()
			.trim();
	}
</script>

<Combobox
	{options}
	bind:value
	label="Choose a product"
	placeholder="Type a name"
	clearLabel="Clear product"
	emptyLabel="No matching products"
	{fold}
	class="fixture-combobox"
/>

<output data-testid="combobox-value">{value ?? 'none'}</output>
