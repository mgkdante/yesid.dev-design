<script lang="ts">
	import { Badge } from '@yesid/ui/badge';
	import { Button } from '@yesid/ui/button';
	import { Combobox, type ComboboxOption } from '@yesid/ui/combobox';
	import { Sheet, SheetContent } from '@yesid/ui/sheet';
	import { ToggleGroup, ToggleGroupItem } from '@yesid/ui/toggle-group';

	let buttonRef = $state<HTMLButtonElement | null>(null);
	let linkRef = $state<HTMLAnchorElement | null>(null);
	let badgeRef = $state<HTMLSpanElement | null>(null);
	let badgeLinkRef = $state<HTMLAnchorElement | null>(null);
	let selected = $state<string | null>(null);
	let comboboxOpen = $state(false);
	let sheetOpen = $state(false);
	let single = $state('one');
	let multiple = $state<string[]>(['one']);

	const options: readonly ComboboxOption[] = [
		{ value: 'one', label: 'One', search: 'one' },
		{ value: 'two', label: 'Two', search: 'two' },
	];
</script>

<Button bind:ref={buttonRef} type="button">Button</Button>
<Button bind:ref={linkRef} href="" type="text/html">Link</Button>
<Badge bind:ref={badgeRef}>Badge</Badge>
<Badge bind:ref={badgeLinkRef} href="">Badge link</Badge>

<Combobox
	{options}
	bind:value={selected}
	bind:open={comboboxOpen}
	label="Choose"
	clearLabel="Clear"
	emptyLabel="Empty"
	fold={(raw) => raw.toLowerCase()}
/>

<ToggleGroup type="single" bind:value={single}>
	<ToggleGroupItem value="one">
		{#snippet child({ props, pressed })}
			<button {...props} data-pressed={pressed}>One</button>
		{/snippet}
	</ToggleGroupItem>
</ToggleGroup>

<ToggleGroup type="multiple" bind:value={multiple}>
	<ToggleGroupItem value="one">
		{#snippet child({ props, pressed })}
			<button {...props} data-pressed={pressed}>One</button>
		{/snippet}
	</ToggleGroupItem>
</ToggleGroup>

<Sheet bind:open={sheetOpen}>
	<SheetContent portalProps={{ disabled: true }} closeLabel="Close fixture">
		<p>Sheet body</p>
	</SheetContent>
</Sheet>

<output>{buttonRef?.tagName ?? ''}</output>
<output>{linkRef?.tagName ?? ''}</output>
<output>{badgeRef?.tagName ?? ''}</output>
<output>{badgeLinkRef?.tagName ?? ''}</output>
