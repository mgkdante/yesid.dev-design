<script lang="ts">
	import tokens from '@yesid/tokens/tokens.json';

	type TokenLeaf = { $value: unknown; $type?: string; $description?: string };
	type TokenGroup = Record<string, unknown>;

	function leaves(group: TokenGroup): Array<{ name: string; value: string }> {
		const out: Array<{ name: string; value: string }> = [];
		for (const [name, value] of Object.entries(group)) {
			if (name.startsWith('$') || value === null || typeof value !== 'object') continue;
			const node = value as TokenLeaf & TokenGroup;
			if (!('$value' in node)) continue;
			const raw = node.$value;
			out.push({
				name,
				value:
					typeof raw === 'object' && raw !== null
						? `clamp(${(raw as { min: string }).min}, …, ${(raw as { max: string }).max})`
						: String(raw),
			});
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
</script>

<section class="mt-10" aria-labelledby="gallery-colors">
	<h2 id="gallery-colors" class="font-heading text-title font-semibold">
		Four-color infrastructure doctrine
	</h2>
	<p class="mt-1 text-small text-muted-foreground">
		Orange marks interaction, yellow marks wayfinding, white reflects, and black structures.
	</p>
	<div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
		{#each brand as token (token.name)}
			<div class="rounded-lg border border-border-subtle bg-card p-3">
				<div
					class="h-12 rounded-md border border-border-subtle"
					style="background: {token.value.startsWith('#') ? token.value : `var(--${token.name})`}"
				></div>
				<p class="mt-2 font-mono text-mono">{token.name}</p>
				<p class="text-caption text-muted-foreground">{token.value}</p>
			</div>
		{/each}
	</div>
</section>

<section class="mt-10 grid gap-8 md:grid-cols-2" aria-label="Theme semantics">
	{#each [
		{ name: 'Dark', tokens: dark },
		{ name: 'Light', tokens: light },
	] as mode (mode.name)}
		<div>
			<h2 class="font-heading text-heading font-semibold">
				{mode.name} semantics ({mode.tokens.length})
			</h2>
			<ul class="mt-3 space-y-1">
				{#each mode.tokens as token (token.name)}
					<li class="flex min-w-0 items-center gap-2 font-mono text-caption">
						<span
							class="inline-block size-4 shrink-0 rounded-sm border border-border-subtle"
							style="background: {token.value}"
						></span>
						<span class="min-w-0 truncate">--{token.name}</span>
						<span class="ml-auto max-w-1/2 truncate text-muted-foreground">{token.value}</span>
					</li>
				{/each}
			</ul>
		</div>
	{/each}
</section>

<section class="mt-10" aria-labelledby="gallery-type-scale">
	<h2 id="gallery-type-scale" class="font-heading text-title font-semibold">Type scale</h2>
	<ul class="mt-3 space-y-1">
		{#each textScale as token (token.name)}
			<li class="flex min-w-0 items-baseline gap-3">
				<span class="w-40 shrink-0 font-mono text-caption text-muted-foreground">
					--text-{token.name}
				</span>
				<span style="font-size: var(--text-{token.name})">Aa</span>
				<span class="min-w-0 truncate text-caption text-muted-foreground">{token.value}</span>
			</li>
		{/each}
	</ul>
</section>

<section class="mt-10 grid gap-8 md:grid-cols-2" aria-label="Shape and spacing tokens">
	<div>
		<h2 class="font-heading text-heading font-semibold">Radii</h2>
		<div class="mt-3 flex flex-wrap items-end gap-3">
			{#each radii as token (token.name)}
				<div class="text-center">
					<div
						class="size-16 border border-border bg-muted"
						style="border-radius: var(--radius-{token.name})"
					></div>
					<p class="mt-1 font-mono text-caption">{token.name} · {token.value}</p>
				</div>
			{/each}
		</div>
	</div>
	<div>
		<h2 class="font-heading text-heading font-semibold">Fluid space</h2>
		<ul class="mt-3 space-y-1">
			{#each spaces as token (token.name)}
				<li class="font-mono text-caption">--space-{token.name}: {token.value}</li>
			{/each}
		</ul>
	</div>
</section>
