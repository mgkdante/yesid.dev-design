<script lang="ts">
	import { ToggleGroup, ToggleGroupItem } from '../index.js';

	let single = $state('one');
	let multiple = $state<string[]>(['one']);
	let singleChanges = $state(0);
	let multipleChanges = $state(0);
</script>

<ToggleGroup
	type="single"
	bind:value={single}
	spacing={2}
	style="opacity: 0.5"
	data-testid="single-toggle-group"
	onValueChange={() => {
		singleChanges += 1;
	}}
>
	<ToggleGroupItem value="one">One</ToggleGroupItem>
	<ToggleGroupItem value="two">Two</ToggleGroupItem>
</ToggleGroup>

<ToggleGroup
	type="multiple"
	bind:value={multiple}
	spacing={3}
	style={{ opacity: 0.75 }}
	data-testid="multiple-toggle-group"
	onValueChange={() => {
		multipleChanges += 1;
	}}
>
	<ToggleGroupItem value="one">Multi one</ToggleGroupItem>
	<ToggleGroupItem value="two">Multi two</ToggleGroupItem>
</ToggleGroup>

<output data-testid="single-value">{single}</output>
<output data-testid="multiple-value">{multiple.join(',')}</output>
<output data-testid="single-changes">{singleChanges}</output>
<output data-testid="multiple-changes">{multipleChanges}</output>
