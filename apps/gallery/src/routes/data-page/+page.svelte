<script lang="ts">
	import { createRawSnippet } from 'svelte';
	import { Badge } from '@yesid/ui/badge';
	import { CornerMeta, SegmentedChoice, ToggleChip } from '@yesid/ui/brand';
	import * as Card from '@yesid/ui/card';
	import { StateNotice } from '@yesid/ui/feedback';
	import {
		Breadcrumb,
		ControlsRail,
		DashboardGrid,
		DetailFrame,
		Masthead,
		Surface,
		SurfaceRail,
	} from '@yesid/ui/layout';
	import { DataTable, type DataTableColumn } from '@yesid/ui/table';
	import { copy, hourTable, statuses, stopRows, stopTable, trail, type Status, type StopRow } from './fixture';

	interface HourRow {
		id: string;
		counts: number[];
	}

	const grains = [
		{ key: 'day', label: 'Day' },
		{ key: 'week', label: 'Week' },
		{ key: 'month', label: 'Month', disabled: true },
	];
	let grain = $state('week');
	let shown = $state<Set<Status>>(new Set());
	const rows = $derived(shown.size === 0 ? stopRows : stopRows.filter((row) => shown.has(row.status)));

	function toggleStatus(status: Status): void {
		const next = new Set(shown);
		if (!next.delete(status)) next.add(status);
		shown = next;
	}

	const hourRows: HourRow[] = [
		{ id: '24 East', counts: [4, 6, 8, 7, 5, 4, 4, 5] },
		{ id: '24 West', counts: [3, 6, 7, 7, 5, 4, 3, 4] },
	];
	const hourColumns = hourTable.hours.map((hour, i) => ({
		key: hour,
		header: `${hour}h`,
		numeric: true,
		cell: createRawSnippet<[HourRow]>((row) => ({ render: () => `<span>${row().counts[i]}</span>` })),
	}));
</script>

<svelte:head>
	<title>yesid.dev-design — data page</title>
</svelte:head>

{#snippet stopCell(row: StopRow)}{row.stop}{/snippet}
{#snippet waitCell(row: StopRow)}{row.wait}{/snippet}
{#snippet headwayCell(row: StopRow)}{row.headway}{/snippet}
{#snippet routeCell(row: HourRow)}{row.id}{/snippet}

{#snippet cornerMeta()}
	{#snippet topLeft()}LINE 24{/snippet}
	{#snippet topRight()}STM{/snippet}
	<CornerMeta crosshair {topLeft} {topRight} />
{/snippet}

{#snippet railBody()}
	<label class="grid gap-1 text-small">
		{copy.search}
		<input type="search" class="rounded-md border border-border bg-card px-3 py-2" />
	</label>
	<SegmentedChoice options={grains} value={grain} label={copy.grain} onSelect={(key) => (grain = key)} />
	<a href="#waits" class="text-small text-primary">{stopTable.caption}</a>
{/snippet}

{#snippet rail()}
	<SurfaceRail
		rail={railBody}
		label={copy.rail.label}
		summary={grain.toUpperCase()}
		openAria={copy.rail.open}
		closeAria={copy.rail.close}
	/>
{/snippet}

<Surface>
	<Breadcrumb items={trail} label={copy.breadcrumb} />
	<Masthead
		kicker="Line 24"
		heading="Waits along line 24"
		lede="Every new data-page part from @yesid/ui in one place."
		{cornerMeta}
	/>

	<DetailFrame {rail}>
		<div class="grid gap-8">
			<ControlsRail label={copy.filters}>
				{#each statuses as status (status.key)}
					<ToggleChip pressed={shown.has(status.key)} onclick={() => toggleStatus(status.key)}>
						{status.label}
					</ToggleChip>
				{/each}
				<StateNotice title="Live" body="updated 08:40" presentation="pill" tone="positive" />
			</ControlsRail>

			<DashboardGrid label={copy.summary} minTile="12rem" gutter={false}>
				{#each ['Median wait', 'Worst stop', 'Trips counted'] as label, i (label)}
					<Card.Root>
						<Card.Header><Card.Title>{label}</Card.Title></Card.Header>
						<Card.Content><Badge variant="tag">{['7 min', 'Peel', '412'][i]}</Badge></Card.Content>
					</Card.Root>
				{/each}
			</DashboardGrid>

			<section id="waits" class="grid gap-3">
				{#if rows.length === 0}
					<StateNotice title={copy.noMatch} role="status" aria-live="polite" presentation="silo" />
				{:else}
					<DataTable
						{rows}
						columns={[
							{ key: 'stop', header: stopTable.headers.stop, rowHeader: true, cell: stopCell },
							{ key: 'wait', header: stopTable.headers.wait, numeric: true, cell: waitCell },
							{ key: 'headway', header: stopTable.headers.headway, numeric: true, cell: headwayCell },
						] satisfies DataTableColumn<StopRow>[]}
						key={(row) => row.id}
						caption={stopTable.caption}
						responsive={{ mode: 'stack', at: 'tablet' }}
						frame="card"
					/>
				{/if}
				<p class="text-small text-muted-foreground">
					Headway on the night route: <StateNotice title="n/a" body="no feed" presentation="row" />
				</p>
			</section>

			<DataTable
				rows={hourRows}
				columns={[
					{ key: 'route', header: 'Route', rowHeader: true, cell: routeCell },
					...hourColumns,
				]}
				key={(row) => row.id}
				caption={hourTable.caption}
				responsive={{ mode: 'scroll', minWidth: hourTable.minWidth }}
				frame="card"
				headerBand="terminal"
			/>
		</div>
	</DetailFrame>
</Surface>
