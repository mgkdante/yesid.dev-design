<script lang="ts">
	import '@yesid/motion/ripple.css';
	import { initGlobalRipple } from '@yesid/motion/utils/globalRipple';
	import { SiteRoot } from '@yesid/ui/layout';
	import { theme } from '@yesid/ui/state';
	import { onMount } from 'svelte';
	import '@yesid/tokens/fonts.css';
	import '../gallery.css';

	let { children } = $props();

	onMount(() => initGlobalRipple());
</script>

<SiteRoot smoothScroll={false}>
<div class="min-h-screen bg-background text-foreground font-body">
	<header
		class="sticky top-0 z-50 flex items-center justify-between border-b border-border-subtle bg-background/90 px-6 py-3 backdrop-blur"
	>
		<p class="font-heading text-heading font-bold">
			yesid<span class="text-primary">.</span>dev-design
		</p>
		<button
			type="button"
			class="tap-press rounded-md border border-border px-3 py-1 text-small text-muted-foreground hover:text-foreground"
			onclick={() => theme.toggle()}
		>
			toggle theme
		</button>
	</header>
	<main class="mx-auto max-w-5xl px-6 py-10">
		{@render children()}
	</main>
</div>
</SiteRoot>
