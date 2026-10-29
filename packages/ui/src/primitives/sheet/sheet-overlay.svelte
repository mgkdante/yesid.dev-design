<script lang="ts">
	import { Dialog as SheetPrimitive } from 'bits-ui';
	import { cn, type WithoutChildrenOrChild } from '../../cn/index.js';

	export type SheetOverlayProps = WithoutChildrenOrChild<SheetPrimitive.OverlayProps>;

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: SheetOverlayProps = $props();
</script>

<!-- The scrim dims the page one rung below the sheet; a curtain, not a surface, so it may be translucent. -->
<SheetPrimitive.Overlay
	bind:ref
	data-slot="sheet-overlay"
	style="z-index: var(--z-index-sheet); background: var(--scrim, color-mix(in srgb, var(--background) 70%, transparent));"
	class={cn(
		'motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0',
		className,
	)}
	{...restProps}
/>
