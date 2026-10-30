<script lang="ts">
	import { onMount } from 'svelte';
	import * as ResizablePrimitive from 'paneforge';
	import { cn, type WithoutChildrenOrChild } from '../../cn/index.js';

	let {
		ref = $bindable(null),
		class: className,
		withHandle = false,
		tabindex = 0,
		...restProps
	}: WithoutChildrenOrChild<ResizablePrimitive.PaneResizerProps> & {
		withHandle?: boolean;
	} = $props();

	// The server cannot know the layout, so the handle renders as a static separator, out of the tab order, until
	// paneforge writes its aria values on mount. `null` drops the attribute; paneforge types it as a number.
	let hydrated = $state(false);
	onMount(() => (hydrated = true));
</script>
<ResizablePrimitive.PaneResizer
	bind:ref
	tabindex={hydrated ? tabindex : (null as unknown as number)}
	data-slot="resizable-handle"
	class={cn(
		'relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-hidden data-[direction=vertical]:h-px data-[direction=vertical]:w-full data-[direction=vertical]:after:left-0 data-[direction=vertical]:after:h-1 data-[direction=vertical]:after:w-full data-[direction=vertical]:after:translate-x-0 data-[direction=vertical]:after:-translate-y-1/2 [&[data-direction=vertical]>div]:rotate-90',
		className,
	)}
	{...restProps}
>
	{#if withHandle}
		<div class="z-10 flex h-6 w-1 shrink-0 rounded-lg bg-border"></div>
	{/if}
</ResizablePrimitive.PaneResizer>
