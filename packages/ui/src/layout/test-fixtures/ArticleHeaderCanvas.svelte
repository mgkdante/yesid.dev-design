<script lang="ts">
	import ArticleHeader from '../ArticleHeader.svelte';

	let { seen }: { seen: (HTMLElement | undefined)[] } = $props();

	function note(header: HTMLElement | undefined) {
		seen.push(header);
		return header ? 'element' : 'undefined';
	}
</script>

{#snippet canvas(header: HTMLElement | undefined)}
	<canvas data-testid="canvas" data-header={note(header)}></canvas>
{/snippet}

<ArticleHeader title="Reliability report" backHref="/" backLabel="Back" meta={['12 metrics']} {canvas} />
