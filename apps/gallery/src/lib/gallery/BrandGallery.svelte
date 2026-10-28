<script lang="ts">
	import { Badge } from '@yesid/ui/badge';
	import * as Card from '@yesid/ui/card';
	import {
		BlueprintShell,
		ChevronToggle,
		CollapsibleSection,
		CornerMarks,
		ErrorIllustration,
		FilterGroup,
		FilterSection,
		FilterSummary,
		LanguageToggle,
		MetricDisplay,
		MetroStation,
		QuietModeButton,
		SearchInput,
		SectionHeading,
		SectionIcon,
		SectionLabel,
		StatusDot,
		StickyPanel,
		StopLabel,
		TerminalCursor,
		ThemeToggle,
		TocBadge,
		TocNav,
		TocPill,
		Wordmark,
		type SectionIconName,
		type StatusDotColor,
		type TocEntry,
	} from '@yesid/ui/brand';

	let chevronOpen = $state(false);
	let quietModeEnabled = $state(false);
	let quietModeRemembered = $state(false);
	let filterMode = $state<string | null>('tram');
	let searchText = $state('');
	const modeItems = [
		{ key: 'bus', label: 'Bus' },
		{ key: 'tram', label: 'Tram' },
		{ key: 'metro', label: 'Metro' },
	];
	const blueprintLabels: [string, string, string] = ['GRID 02', 'AXIS 17', 'REV 04'];
	const tocEntries: TocEntry[] = [
		{ id: 'overview', title: 'Overview', level: 2, badge: { kind: 'number', value: 1 }, children: [] },
		{
			id: 'method',
			title: 'Method',
			level: 2,
			badge: { kind: 'number', value: 2 },
			children: [{ id: 'sampling', title: 'Sampling', level: 3, children: [] }],
		},
		{ id: 'results', title: 'Results', level: 2, badge: { kind: 'number', value: 3 }, children: [] },
	];
	const statusColors = 'orange green caution stop lunar early on_time late severe unknown'.split(
		' ',
	) as StatusDotColor[];
	const iconNames = 'toc image eye layers chart grid list arrow briefcase github'.split(
		' ',
	) as SectionIconName[];
	const quietModeCopy = {
		collapse: 'Collapse all',
		expand: 'Expand all',
		collapseTitle: 'Collapse every section',
		expandTitle: 'Expand every section',
		remember: 'Always start collapsed',
		forget: "Don't start collapsed",
	};
</script>

{#snippet blueprintHero()}
	<svg class="size-full" viewBox="0 0 320 140" preserveAspectRatio="none" aria-hidden="true">
		<path d="M20 112L92 30l58 54 62-62 88 90" fill="none" stroke="currentColor" />
		<circle cx="92" cy="30" r="12" fill="none" stroke="currentColor" />
		<text x="112" y="48" fill="currentColor" font-family="JetBrains Mono" font-size="10">
			REF-02
		</text>
	</svg>
{/snippet}

{#snippet blueprintDetails()}
	<svg
		class="edge-detail top-[18%] right-[8%] h-20 w-28"
		viewBox="0 0 112 80"
		aria-hidden="true"
	>
		<rect x="8" y="8" width="96" height="64" fill="none" stroke="currentColor" />
		<path d="M8 40h96M56 8v64" fill="none" stroke="currentColor" />
	</svg>
{/snippet}

{#snippet noReading()}
	<span class="text-small text-muted-foreground">No reading yet</span>
{/snippet}

{#snippet medianNote()}
	<span class="font-mono text-caption text-muted-foreground">7-day median</span>
{/snippet}

{#snippet customRoundel(stationNo: string)}
	<Badge
		variant="number"
		class="station-number-badge"
		style="background-color: var(--signage-bg); color: var(--signage-text);"
		aria-hidden="true"
	>
		{stationNo}
	</Badge>
{/snippet}

<section class="mt-10" aria-labelledby="gallery-brand-components">
	<h2 id="gallery-brand-components" class="font-heading text-title font-semibold">
		Brand components
	</h2>
	<p class="mt-1 text-small text-muted-foreground">
		Package defaults beside neutral caller configuration, without product-owned policy.
	</p>

	<div class="mt-4 grid gap-4 lg:grid-cols-2">
		<Card.Root class="overflow-hidden lg:col-span-2" data-gallery-family="brand:BlueprintShell">
			<Card.Header>
				<Card.Title>BlueprintShell</Card.Title>
				<Card.Description>Normalized SVG text beside source-preserved typography.</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-3 md:grid-cols-2">
				<div>
					<SectionLabel text="NORMALIZED TEXT" variant="metric" />
					<div class="relative mt-2 h-40 overflow-hidden rounded-md border border-border bg-muted">
						<BlueprintShell
							hero={blueprintHero}
							details={blueprintDetails}
							labels={blueprintLabels}
						/>
					</div>
				</div>
				<div>
					<SectionLabel text="SOURCE TYPOGRAPHY" variant="metric" />
					<div class="relative mt-2 h-40 overflow-hidden rounded-md border border-border bg-muted">
						<BlueprintShell
							hero={blueprintHero}
							details={blueprintDetails}
							labels={blueprintLabels}
							normalizeTextFont={false}
						/>
					</div>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>ChevronToggle and SectionLabel</Card.Title>
				<Card.Description>Decorative direction plus caller-owned label copy.</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div data-gallery-family="brand:ChevronToggle">
					<button
						type="button"
						class="tap-press flex items-center gap-2 rounded-md border border-border px-3 py-2 text-small"
						aria-expanded={chevronOpen}
						onclick={() => (chevronOpen = !chevronOpen)}
					>
						<ChevronToggle open={chevronOpen} />
						{chevronOpen ? 'Collapse details' : 'Expand details'}
					</button>
				</div>
				<div class="grid gap-2" data-gallery-family="brand:SectionLabel">
					<SectionLabel text="SECTION LABEL" />
					<SectionLabel text="STATION LABEL" variant="station" />
					<SectionLabel text="METRIC LABEL" variant="metric" />
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root data-gallery-family="brand:StopLabel">
			<Card.Header>
				<Card.Title>StopLabel</Card.Title>
				<Card.Description>Localized copy is explicit input, never inferred.</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-4">
				<div lang="fr">
					<SectionLabel text="FRANÇAIS" variant="metric" />
					<StopLabel class="mt-2" stop="52001" label="Correspondance centrale" />
				</div>
				<div lang="es">
					<SectionLabel text="ESPAÑOL" variant="metric" />
					<StopLabel class="mt-2" stop="03" label="INTERCAMBIO CENTRAL" prefix="PARADA" />
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root data-gallery-family="brand:MetroStation">
			<Card.Header>
				<Card.Title>MetroStation</Card.Title>
				<Card.Description>Self-contained and caller-supplied roundels.</Card.Description>
			</Card.Header>
			<Card.Content class="grid grid-cols-2 gap-6 text-center">
				<div class="flex flex-col items-center gap-2">
					<SectionLabel text="DEFAULT" variant="metric" />
					<MetroStation index={3} showLine class="h-24" />
				</div>
				<div class="flex flex-col items-center gap-2">
					<SectionLabel text="CUSTOM ROUNDEL" variant="metric" />
					<MetroStation index={3} showLine roundel={customRoundel} class="h-24" />
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root data-gallery-family="brand:StickyPanel">
			<Card.Header>
				<Card.Title>StickyPanel</Card.Title>
				<Card.Description>Sticky surface-3 panel that chains wheel scrolling to the page.</Card.Description>
			</Card.Header>
			<Card.Content>
				<StickyPanel top="1rem">
					<SectionLabel text="STICKY PANEL" variant="metric" />
					<p class="mt-2 text-small">Keyboard-scrollable, sticky below its top offset.</p>
				</StickyPanel>
			</Card.Content>
		</Card.Root>

		<Card.Root data-gallery-family="brand:ThemeToggle">
			<Card.Header>
				<Card.Title>ThemeToggle</Card.Title>
				<Card.Description>Signal-lamp switch bound to the shared theme; the caller supplies the label.</Card.Description>
			</Card.Header>
			<Card.Content>
				<ThemeToggle label="Dark theme" />
			</Card.Content>
		</Card.Root>
		<Card.Root data-gallery-family="brand:Wordmark">
			<Card.Header>
				<Card.Title>Wordmark</Card.Title>
				<Card.Description>Name plus accent dot; hover runs the letter effects unless animate is off.</Card.Description>
			</Card.Header>
			<Card.Content class="flex items-center gap-6">
				<Wordmark href="/" class="text-2xl" />
				<Wordmark href="/" text="transit" animate={false} class="text-2xl" />
			</Card.Content>
		</Card.Root>

		<Card.Root data-gallery-family="brand:LanguageToggle">
			<Card.Header>
				<Card.Title>LanguageToggle</Card.Title>
				<Card.Description>Signpost with one board per locale; links to the next one through the caller's href.</Card.Description>
			</Card.Header>
			<Card.Content class="flex items-center gap-6">
				<LanguageToggle locale="en" locales={['en', 'fr']} href={(next) => `/?lang=${next}`} label="Language" />
				<LanguageToggle locale="fr" locales={['en', 'fr', 'es']} href={(next) => `/?lang=${next}`} label="Langue" />
			</Card.Content>
		</Card.Root>

		<Card.Root data-gallery-family="brand:QuietModeButton">
			<Card.Header>
				<Card.Title>QuietModeButton</Card.Title>
				<Card.Description>Caller-owned copy and state with an explicit active effect.</Card.Description>
			</Card.Header>
			<Card.Content>
				<QuietModeButton
					copy={quietModeCopy}
					enabled={quietModeEnabled}
					remembered={quietModeRemembered}
					onToggle={() => (quietModeEnabled = !quietModeEnabled)}
					onRememberToggle={() => (quietModeRemembered = !quietModeRemembered)}
					activeEffect="glow"
				/>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>TocBadge and TerminalCursor</Card.Title>
				<Card.Description>TOC marks and a reduced-motion-aware terminal blink.</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-5">
				<div class="flex items-center gap-4" data-gallery-family="brand:TocBadge">
					<TocBadge badge={{ kind: 'number', value: 3 }} />
					<TocBadge badge={{ kind: 'icon', name: 'chart' }} />
					<span class="text-small text-muted-foreground">number · icon</span>
				</div>
				<div data-gallery-family="brand:TerminalCursor">
					<p class="font-mono text-mono">SYSTEM READY<TerminalCursor /></p>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root data-gallery-family="brand:CollapsibleSection">
			<Card.Header>
				<Card.Title>CollapsibleSection</Card.Title>
				<Card.Description>Toggle header with an index badge; follows quiet mode by default.</Card.Description>
			</Card.Header>
			<Card.Content>
				<CollapsibleSection title="Service notes" subtitle="Weekday timetable" index={0}>
					<p class="text-small">Trains run every six minutes between 06:00 and 22:00.</p>
				</CollapsibleSection>
			</Card.Content>
		</Card.Root>

		<Card.Root data-gallery-family="brand:TocNav">
			<Card.Header>
				<Card.Title>TocNav</Card.Title>
				<Card.Description>Desktop contents list; the page owns the active id.</Card.Description>
			</Card.Header>
			<Card.Content>
				<TocNav
					entries={tocEntries}
					activeId="method"
					heading="Contents"
					onNavigate={() => undefined}
				/>
			</Card.Content>
		</Card.Root>

		<Card.Root data-gallery-family="brand:TocPill">
			<Card.Header>
				<Card.Title>TocPill</Card.Title>
				<Card.Description>Mobile contents pill, fixed to the viewport bottom below 1024px.</Card.Description>
			</Card.Header>
			<Card.Content>
				<!-- The transform makes this box the pill's containing block, so it stays in the card. -->
				<div class="relative h-24" style="transform: translateZ(0)">
					<TocPill
						entries={tocEntries}
						activeId="method"
						openAria="open contents"
						closeAria="close contents"
					/>
				</div>
				<p class="text-small text-muted-foreground">Hidden at the desktop breakpoint.</p>
			</Card.Content>
		</Card.Root>

		<Card.Root data-gallery-family="brand:CornerMarks">
			<Card.Header>
				<Card.Title>CornerMarks</Card.Title>
				<Card.Description>Corner ticks over a positioned parent, in two arm lengths.</Card.Description>
			</Card.Header>
			<Card.Content class="grid grid-cols-2 gap-4">
				<div class="relative h-24 rounded-md bg-muted"><CornerMarks /></div>
				<div class="relative h-24 rounded-md bg-muted"><CornerMarks size="md" opacity={0.7} /></div>
			</Card.Content>
		</Card.Root>

		<Card.Root data-gallery-family="brand:ErrorIllustration">
			<Card.Header>
				<Card.Title>ErrorIllustration</Card.Title>
				<Card.Description>Station scene with a hazard-striped sign for error pages.</Card.Description>
			</Card.Header>
			<Card.Content>
				<ErrorIllustration code="404" signLabel="STATION" />
			</Card.Content>
		</Card.Root>

		<Card.Root data-gallery-family="brand:StatusDot">
			<Card.Header>
				<Card.Title>StatusDot</Card.Title>
				<Card.Description>Signal aspects and data statuses.</Card.Description>
			</Card.Header>
			<Card.Content class="grid grid-cols-2 gap-2">
				{#each statusColors as color (color)}
					<span class="flex items-center gap-2 font-mono text-caption">
						<StatusDot {color} size="md" label={color} />
						{color}
					</span>
				{/each}
			</Card.Content>
		</Card.Root>

		<Card.Root data-gallery-family="brand:MetricDisplay">
			<Card.Header>
				<Card.Title>MetricDisplay</Card.Title>
				<Card.Description>Caller-supplied absence text and label extras.</Card.Description>
			</Card.Header>
			<Card.Content class="grid grid-cols-3 gap-4">
				<MetricDisplay value="94.2%" label="On time" sublabel="Line 1" />
				<MetricDisplay value={null} label="Delay" absent={noReading} />
				<MetricDisplay value="3 min" label="Headway" info={medianNote} labelBelow />
			</Card.Content>
		</Card.Root>

		<Card.Root data-gallery-family="brand:SectionHeading">
			<Card.Header>
				<Card.Title>SectionHeading</Card.Title>
				<Card.Description>Numbered display heading beside the mono overline style.</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-4">
				<SectionHeading
					level={3}
					number={2}
					heading="Service reliability"
					headingAccent="by line"
					subheading="Rolling 30 days"
				/>
				<SectionHeading level={3} overline="NETWORK STATUS" />
			</Card.Content>
		</Card.Root>

		<Card.Root data-gallery-family="brand:SectionIcon">
			<Card.Header>
				<Card.Title>SectionIcon</Card.Title>
				<Card.Description>The closed icon set that TocBadge also draws from.</Card.Description>
			</Card.Header>
			<Card.Content class="grid grid-cols-2 gap-2 sm:grid-cols-3">
				{#each iconNames as name (name)}
					<span class="flex items-center gap-2 font-mono text-caption">
						<SectionIcon {name} />
						{name}
					</span>
				{/each}
			</Card.Content>
		</Card.Root>

		<Card.Root data-gallery-family="brand:FilterGroup">
			<Card.Header>
				<Card.Title>FilterGroup</Card.Title>
				<Card.Description>Single-choice filter with an All reset; collapsible.</Card.Description>
			</Card.Header>
			<Card.Content>
				<FilterGroup
					label="Mode"
					items={modeItems}
					activeKey={filterMode}
					allLabel="All modes"
					collapsible
					onSelect={(key) => (filterMode = key)}
				/>
			</Card.Content>
		</Card.Root>

		<Card.Root data-gallery-family="brand:FilterSection">
			<Card.Header>
				<Card.Title>FilterSection</Card.Title>
				<Card.Description>One block of a filter panel, set off by a dashed rule.</Card.Description>
			</Card.Header>
			<Card.Content>
				<FilterSection><p class="text-small">Mode</p></FilterSection>
				<FilterSection><p class="text-small">Line</p></FilterSection>
			</Card.Content>
		</Card.Root>

		<Card.Root data-gallery-family="brand:FilterSummary">
			<Card.Header>
				<Card.Title>FilterSummary</Card.Title>
				<Card.Description>Result count with caller-supplied plural templates and a clear control.</Card.Description>
			</Card.Header>
			<Card.Content>
				<FilterSummary
					count={3}
					countLabel={{ singular: '{count} route', plural: '{count} routes' }}
					locale="en"
					clearLabel="Clear filters"
					onClear={() => (filterMode = null)}
				/>
			</Card.Content>
		</Card.Root>

		<Card.Root data-gallery-family="brand:SearchInput">
			<Card.Header>
				<Card.Title>SearchInput</Card.Title>
				<Card.Description>Bindable text field named by its label, not its placeholder.</Card.Description>
			</Card.Header>
			<Card.Content>
				<SearchInput bind:value={searchText} label="Search routes" placeholder="Search routes" />
			</Card.Content>
		</Card.Root>
	</div>
</section>
