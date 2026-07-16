<script lang="ts">
	import tokens from '@yesid/tokens/tokens.json';
	import { boop, magnetic, cursorGlow, pressBounce } from '@yesid/motion/actions';
	import { duration, ease } from '@yesid/motion/tokens';
	import { Badge } from '@yesid/ui/badge';
	import { Button } from '@yesid/ui/button';
	import * as Card from '@yesid/ui/card';
	import * as Tabs from '@yesid/ui/tabs';
	import { Toggle } from '@yesid/ui/toggle';

	type TokenLeaf = { $value: unknown; $type?: string; $description?: string };
	type TokenGroup = Record<string, unknown>;

	function leaves(group: TokenGroup): Array<{ name: string; value: string }> {
		const out: Array<{ name: string; value: string }> = [];
		for (const [k, v] of Object.entries(group)) {
			if (k.startsWith('$') || v === null || typeof v !== 'object') continue;
			const node = v as TokenLeaf & TokenGroup;
			if ('$value' in node) {
				const raw = node.$value;
				out.push({
					name: k,
					value:
						typeof raw === 'object' && raw !== null
							? `clamp(${(raw as { min: string }).min}, …, ${(raw as { max: string }).max})`
							: String(raw),
				});
			}
		}
		return out;
	}

	const tree = tokens as unknown as TokenGroup;
	const color = tree.color as TokenGroup;
	const brand = leaves(color.brand as TokenGroup);
	const dark = leaves(color.dark as TokenGroup);
	const light = leaves(color.light as TokenGroup);
	const textScale = leaves(tree.text as TokenGroup);
	const radii = leaves(tree.radius as TokenGroup);
	const spaces = leaves(tree.space as TokenGroup);
	let galleryTogglePressed = $state(false);
</script>

<svelte:head>
	<title>yesid.dev-design — brand gallery</title>
</svelte:head>

<h1 class="font-heading text-display font-bold">Brand gallery</h1>
<p class="mt-2 max-w-prose text-body text-muted-foreground">
	Rendered live from <code class="font-mono text-mono">@yesid/tokens/tokens.json</code> — the
	single source of truth. Parity anchor: yesid.dev @
	<code class="font-mono text-mono">2bdb611d</code>.
</p>

<section class="mt-10">
	<h2 class="font-heading text-title font-semibold">Four-color infrastructure doctrine</h2>
	<p class="mt-1 text-small text-muted-foreground">
		Orange = the only clickable hue · yellow = wayfinding surface, never body text · white =
		reflective, theme-invariant · black = signage ground.
	</p>
	<div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
		{#each brand as t (t.name)}
			<div
				class="rounded-lg border border-border-subtle bg-card p-3"
				use:cursorGlow={{ intensity: 0.08 }}
			>
				<div
					class="h-12 rounded-md border border-border-subtle"
					style="background: {t.value.startsWith('#') ? t.value : `var(--${t.name})`}"
				></div>
				<p class="mt-2 font-mono text-mono">{t.name}</p>
				<p class="text-caption text-muted-foreground">{t.value}</p>
			</div>
		{/each}
	</div>
</section>

<section class="mt-10">
	<h2 class="font-heading text-title font-semibold">UI primitives</h2>
	<p class="mt-1 text-small text-muted-foreground">
		Rendered from <code class="font-mono text-mono">@yesid/ui</code> as a third consumer.
	</p>
	<div class="mt-4 grid gap-4 lg:grid-cols-2">
		<Card.Root interactive>
			<Card.Header>
				<Card.Title>Composable brand controls</Card.Title>
				<Card.Description>Shared geometry, tokens, and interaction behavior.</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-wrap items-center gap-3">
				<Button size="cta-sm">Primary action</Button>
				<Badge variant="tag">Ready</Badge>
				<Toggle bind:pressed={galleryTogglePressed} variant="outline">
					{galleryTogglePressed ? 'Pinned' : 'Pin'}
				</Toggle>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Tabs</Card.Title>
				<Card.Description>bits-ui behavior with the shared visual contract.</Card.Description>
			</Card.Header>
			<Card.Content>
				<Tabs.Root value="overview">
					<Tabs.List variant="line">
						<Tabs.Trigger value="overview">Overview</Tabs.Trigger>
						<Tabs.Trigger value="details">Details</Tabs.Trigger>
					</Tabs.List>
					<Tabs.Content value="overview" class="pt-4">Package-owned defaults.</Tabs.Content>
					<Tabs.Content value="details" class="pt-4">Caller classes still compose.</Tabs.Content>
				</Tabs.Root>
			</Card.Content>
		</Card.Root>
	</div>
</section>

<section class="mt-10 grid gap-8 md:grid-cols-2">
	<div>
		<h2 class="font-heading text-heading font-semibold">Dark semantics ({dark.length})</h2>
		<ul class="mt-3 space-y-1">
			{#each dark as t (t.name)}
				<li class="flex items-center gap-2 font-mono text-caption">
					<span
						class="inline-block size-4 shrink-0 rounded-sm border border-border-subtle"
						style="background: {t.value}"
					></span>
					<span>--{t.name}</span>
					<span class="ml-auto text-muted-foreground">{t.value}</span>
				</li>
			{/each}
		</ul>
	</div>
	<div>
		<h2 class="font-heading text-heading font-semibold">Light semantics ({light.length})</h2>
		<ul class="mt-3 space-y-1">
			{#each light as t (t.name)}
				<li class="flex items-center gap-2 font-mono text-caption">
					<span
						class="inline-block size-4 shrink-0 rounded-sm border border-border-subtle"
						style="background: {t.value}"
					></span>
					<span>--{t.name}</span>
					<span class="ml-auto text-muted-foreground">{t.value}</span>
				</li>
			{/each}
		</ul>
	</div>
</section>

<section class="mt-10">
	<h2 class="font-heading text-title font-semibold">Type scale</h2>
	<ul class="mt-3 space-y-1">
		{#each textScale as t (t.name)}
			<li class="flex items-baseline gap-3">
				<span class="w-40 shrink-0 font-mono text-caption text-muted-foreground">
					--text-{t.name}
				</span>
				<span style="font-size: var(--text-{t.name})">Aa</span>
				<span class="text-caption text-muted-foreground">{t.value}</span>
			</li>
		{/each}
	</ul>
</section>

<section class="mt-10 grid gap-8 md:grid-cols-2">
	<div>
		<h2 class="font-heading text-heading font-semibold">Radii</h2>
		<div class="mt-3 flex flex-wrap items-end gap-3">
			{#each radii as t (t.name)}
				<div class="text-center">
					<div
						class="size-16 border border-border bg-muted"
						style="border-radius: var(--radius-{t.name})"
					></div>
					<p class="mt-1 font-mono text-caption">{t.name} · {t.value}</p>
				</div>
			{/each}
		</div>
	</div>
	<div>
		<h2 class="font-heading text-heading font-semibold">Fluid space</h2>
		<ul class="mt-3 space-y-1">
			{#each spaces as t (t.name)}
				<li class="font-mono text-caption">--space-{t.name}: {t.value}</li>
			{/each}
		</ul>
	</div>
</section>

<section class="mt-10">
	<h2 class="font-heading text-title font-semibold">Motion vocabulary</h2>
	<p class="mt-1 text-small text-muted-foreground">
		Durations {Object.entries(duration)
			.map(([k, v]) => `${k} ${v}ms`)
			.join(' · ')} — easings {Object.keys(ease).join(', ')}.
	</p>
	<div class="mt-4 flex flex-wrap gap-3">
		<button
			type="button"
			class="rounded-md bg-primary px-4 py-2 text-primary-foreground"
			use:boop={{ scale: 1.05 }}
		>
			boop
		</button>
		<button
			type="button"
			class="rounded-md border border-border-strong px-4 py-2"
			use:magnetic={{ strength: 4, radius: 60 }}
		>
			magnetic
		</button>
		<button type="button" class="tap-press rounded-md bg-signage-bg px-4 py-2 text-signage-text" use:pressBounce>
			pressBounce (touch)
		</button>
		<div class="rounded-lg border border-border-subtle bg-card px-6 py-4" use:cursorGlow>
			cursorGlow surface
		</div>
	</div>
</section>
