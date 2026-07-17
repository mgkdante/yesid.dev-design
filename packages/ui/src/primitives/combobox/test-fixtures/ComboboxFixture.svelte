<script lang="ts">
	import { Combobox, type ComboboxOption } from '../index.js';

	interface Props {
		options: readonly ComboboxOption[];
		value?: string | null;
		open?: boolean;
		disabled?: boolean;
	}

	let {
		options,
		value = $bindable(null),
		open = $bindable(false),
		disabled = false,
	}: Props = $props();
	let valueChanges = $state(0);
	let openChanges = $state(0);
	let openCompletions = $state(0);

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
	bind:open
	{disabled}
	name="product"
	label="Choose a product"
	placeholder="Type a name"
	clearLabel="Clear product"
	emptyLabel="No matching products"
	{fold}
	class="fixture-combobox"
	onValueChange={() => {
		valueChanges += 1;
	}}
	onOpenChange={() => {
		openChanges += 1;
	}}
	onOpenChangeComplete={() => {
		openCompletions += 1;
	}}
/>

<button type="button" data-testid="combobox-external-value" onclick={() => (value = 'gamma')}>
	Select gamma externally
</button>
<output data-testid="combobox-value">{value ?? 'none'}</output>
<output data-testid="combobox-open">{open ? 'open' : 'closed'}</output>
<output data-testid="combobox-value-changes">{valueChanges}</output>
<output data-testid="combobox-open-changes">{openChanges}</output>
<output data-testid="combobox-open-completions">{openCompletions}</output>
