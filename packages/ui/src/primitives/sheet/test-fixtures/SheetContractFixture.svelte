<script lang="ts">
	import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../index.js';

	interface Props {
		closeLabel?: string;
	}

	let { closeLabel }: Props = $props();
	let open = $state(true);
</script>

<Sheet bind:open>
	<SheetContent portalProps={{ disabled: true }} {closeLabel}>
		<SheetTitle>Fixture title</SheetTitle>
		<SheetDescription>Fixture description</SheetDescription>
		<p>Fixture body</p>
	</SheetContent>
</Sheet>

