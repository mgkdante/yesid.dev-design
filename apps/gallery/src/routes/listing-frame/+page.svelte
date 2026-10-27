<script lang="ts">
	import {
		BlueprintShell,
		FilterGroup,
		FilterSection,
		FilterSummary,
		SearchInput,
	} from '@yesid/ui/brand';
	import { ListingFrame } from '@yesid/ui/layout';

	const modes = [
		{ key: 'travaux', label: 'Travaux' },
		{ key: 'recherches', label: 'Recherches' },
	];
	const years = [
		{ key: '2025', label: '2025' },
		{ key: '2026', label: '2026' },
	];
	const entries = [
		{ title: 'Étude de capacité', mode: 'recherches', year: '2025' },
		{ title: 'Refonte du tableau de bord', mode: 'travaux', year: '2026' },
		{ title: 'Audit des horaires', mode: 'recherches', year: '2026' },
	];

	let query = $state('');
	let mode = $state<string | null>(null);
	let year = $state<string | null>(null);
	const shown = $derived(
		entries.filter(
			(entry) =>
				(!mode || entry.mode === mode) &&
				(!year || entry.year === year) &&
				entry.title.toLowerCase().includes(query.toLowerCase()),
		),
	);

	function clearFilters(): void {
		query = '';
		mode = null;
		year = null;
	}
</script>

<svelte:head>
	<title>yesid.dev-design — listing frame</title>
</svelte:head>

{#snippet hero()}
	<svg class="size-full" viewBox="0 0 320 140" preserveAspectRatio="none" aria-hidden="true">
		<path d="M20 112L92 30l58 54 62-62 88 90" fill="none" stroke="currentColor" />
	</svg>
{/snippet}

{#snippet details()}{/snippet}

<ListingFrame
	heading="Catalogue"
	edgeTitle="Un catalogue de travaux et de recherches"
	subtitle="Travaux et recherches"
	description="Exemple de page de liste avec filtres, recherche et résultats."
	filterLabel="Filtres"
	filterPersistKey="gallery-listing-filters"
>
	{#snippet blueprint()}
		<BlueprintShell {hero} {details} labels={['GRID 02', 'AXIS 17', 'REV 04']} />
	{/snippet}

	{#snippet aside()}
		<dl aria-label="Totaux du catalogue" class="grid grid-cols-2 gap-4 text-small">
			<div>
				<dt class="text-muted-foreground">Travaux</dt>
				<dd class="font-mono">12</dd>
			</div>
			<div>
				<dt class="text-muted-foreground">Recherches</dt>
				<dd class="font-mono">7</dd>
			</div>
		</dl>
	{/snippet}

	{#snippet search()}
		<SearchInput bind:value={query} label="Rechercher" placeholder="Rechercher" />
	{/snippet}

	{#snippet filters()}
		<FilterSection>
			<FilterGroup
				label="Type"
				items={modes}
				activeKey={mode}
				allLabel="Tous"
				onSelect={(key) => (mode = key)}
			/>
		</FilterSection>
		<FilterSection>
			<FilterGroup
				label="Année"
				items={years}
				activeKey={year}
				allLabel="Toutes"
				onSelect={(key) => (year = key)}
			/>
		</FilterSection>
	{/snippet}

	<FilterSummary
		count={shown.length}
		countLabel={{ singular: '{count} résultat', plural: '{count} résultats' }}
		locale="fr"
		clearLabel="Effacer les filtres"
		onClear={clearFilters}
	/>
	<ul class="grid gap-2">
		{#each shown as entry (entry.title)}
			<li class="rounded-md border border-border p-3 text-small">{entry.title}</li>
		{/each}
	</ul>
</ListingFrame>
