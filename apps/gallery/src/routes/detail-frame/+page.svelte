<script lang="ts">
	import type { TocEntry } from '@yesid/ui/brand';
	import { ArticleHeader, DetailFrame } from '@yesid/ui/layout';

	const sections = [
		{ id: 'signals', title: 'Signals' },
		{ id: 'timetables', title: 'Timetables' },
		{ id: 'platforms', title: 'Platforms' },
		{ id: 'handover', title: 'Handover' },
	];
	const entries: TocEntry[] = sections.map(({ id, title }) => ({ id, title, level: 2, children: [] }));
	const filler =
		'Sample copy for a long section, repeated so the page scrolls far enough to keep the side rails stuck below the navigation bar while the center column moves.';
</script>

<svelte:head>
	<title>yesid.dev-design — detail frame</title>
</svelte:head>

<div data-testid="fixture-nav" class="fixed inset-x-0 top-0 z-[60] h-[88px] border-b border-border bg-background"></div>

<div class="pt-[var(--chrome-offset)]" style="--chrome-offset: 88px">
	<DetailFrame toc={{ entries, selector: 'section[id]', openAria: 'Open contents', closeAria: 'Close contents' }}>
		{#snippet header()}
			<ArticleHeader
				title="Reading the line"
				highlight="line"
				category="Field notes"
				backHref="/"
				backLabel="All notes"
				meta={['12 min read', { text: 'May 2026', datetime: '2026-05', label: 'Published' }]}
				edgeLeft="REV 04"
				edgeRight="GRID 02"
				watermark="NOTES"
			>
				{#snippet controls()}
					<button type="button" class="rounded-md border border-border px-3 py-1 text-small">Share</button>
				{/snippet}
			</ArticleHeader>
		{/snippet}

		{#snippet left()}
			<nav aria-label="Sections">
				<ul class="grid gap-2 text-small">
					{#each sections as { id, title } (id)}
						<li><a href="#{id}">{title}</a></li>
					{/each}
				</ul>
			</nav>
		{/snippet}

		{#each sections as { id, title } (id)}
			<section {id} class="mb-10">
				<h2 class="mb-3 text-heading font-bold">{title}</h2>
				{#each [1, 2, 3, 4, 5, 6] as n (n)}
					<p class="mb-4 text-body">{filler}</p>
				{/each}
			</section>
		{/each}

		{#snippet right()}
			<p class="font-mono text-caption text-muted-foreground">Related: line 4 timetable, platform plan.</p>
		{/snippet}

		{#snippet after()}
			<div class="border-t border-border p-6 text-small">More notes follow this article.</div>
		{/snippet}
	</DetailFrame>
</div>
