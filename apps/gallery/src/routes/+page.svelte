<script lang="ts">
	import BrandGallery from '$lib/gallery/BrandGallery.svelte';
	import MotionGallery from '$lib/gallery/MotionGallery.svelte';
	import PrimitiveGallery from '$lib/gallery/PrimitiveGallery.svelte';
	import TokenGallery from '$lib/gallery/TokenGallery.svelte';
</script>

<svelte:head>
	<title>yesid.dev-design — brand gallery</title>
</svelte:head>

<h1 class="font-heading text-display font-bold">Brand gallery</h1>
<p class="mt-2 max-w-prose text-body text-muted-foreground">
	A live reference for the public token, component, and motion contracts. Every scenario uses
	neutral caller-owned data and copy.
</p>

<TokenGallery />
<PrimitiveGallery />
<BrandGallery />
<MotionGallery />
