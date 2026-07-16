<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Action } from 'svelte/action';
	import StickyPanel from '../StickyPanel.svelte';

	interface Props {
		children: Snippet;
		scrollChain: Action<HTMLDivElement>;
		top?: string;
	}

	let { children, scrollChain, top = '6rem' }: Props = $props();
	let panel = $state<HTMLDivElement | null>(null);

	$effect(() => {
		if (!panel) return;
		const lifecycle = scrollChain(panel);

		return () => lifecycle?.destroy?.();
	});
</script>

<StickyPanel bind:ref={panel} class="yesid-sticky-panel" {top} {children} />

<style>
	:global(.yesid-sticky-panel.yesid-sticky-panel.yesid-sticky-panel) {
		background: var(--surface-3);
		box-shadow: none;
	}
</style>
