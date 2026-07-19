<script lang="ts">
	import { Badge } from '@yesid/ui/badge';
	import { Button } from '@yesid/ui/button';
	import * as Card from '@yesid/ui/card';
	import * as Collapsible from '@yesid/ui/collapsible';
	import { Combobox, type ComboboxOption } from '@yesid/ui/combobox';
	import {
		ResizableHandle,
		ResizablePane,
		ResizablePaneGroup,
	} from '@yesid/ui/resizable';
	import { ScrollArea } from '@yesid/ui/scroll-area';
	import { Separator } from '@yesid/ui/separator';
	import * as Sheet from '@yesid/ui/sheet';
	import { Skeleton } from '@yesid/ui/skeleton';
	import * as Tabs from '@yesid/ui/tabs';
	import { Toggle } from '@yesid/ui/toggle';
	import { ToggleGroup, ToggleGroupItem } from '@yesid/ui/toggle-group';

	let collapsibleOpen = $state(true);
	let comboboxValue = $state<string | null>('operations');
	let sheetOpen = $state(false);
	let togglePressed = $state(false);
	let toggleGroupValue = $state('summary');

	const comboboxOptions: readonly ComboboxOption[] = [
		{
			value: 'operations',
			label: 'Operations overview',
			sublabel: 'Current service indicators',
			glyph: '01',
			search: 'operations overview current service indicators',
		},
		{
			value: 'accessibility',
			label: 'Accessibilité universelle',
			sublabel: 'Parcours, ascenseurs et correspondances',
			glyph: '02',
			search: 'accessibilite universelle parcours ascenseurs correspondances',
		},
		{
			value: 'continuity',
			label: 'Continuidad del servicio durante interrupciones planificadas',
			sublabel: 'Información operativa multilingüe',
			glyph: '03',
			search: 'continuidad servicio interrupciones planificadas informacion operativa multilingue',
		},
	];

	function foldText(raw: string): string {
		return raw
			.normalize('NFD')
			.replace(/\p{Diacritic}/gu, '')
			.toLowerCase()
			.trim();
	}
</script>

<section class="mt-10" aria-labelledby="gallery-primitives">
	<h2 id="gallery-primitives" class="font-heading text-title font-semibold">UI primitives</h2>
	<p class="mt-1 text-small text-muted-foreground">
		Every public family rendered through its package subpath, including neutral operational
		states.
	</p>

	<div class="mt-4 grid gap-4 lg:grid-cols-2">
		<Card.Root data-gallery-family="primitive:card" interactive>
			<Card.Header>
				<Card.Title>Controls and status</Card.Title>
				<Card.Description>Element semantics, state, and caller-owned copy.</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-4">
				<div class="flex flex-wrap items-center gap-3" data-gallery-state="disabled">
					<div data-gallery-family="primitive:button">
						<Button size="cta-sm">Run check</Button>
						<Button class="ml-2" variant="outline" disabled>Unavailable</Button>
					</div>
					<div data-gallery-family="primitive:badge">
						<Badge class="text-operational-label" variant="tag">Configured vocabulary</Badge>
						<Badge class="ml-2" variant="destructive">Attention</Badge>
					</div>
					<div data-gallery-family="primitive:toggle">
						<Toggle bind:pressed={togglePressed} variant="outline">
							{togglePressed ? 'Pinned' : 'Pin'}
						</Toggle>
						<Toggle class="ml-2" disabled>Locked</Toggle>
					</div>
				</div>

				<div
					data-gallery-state="error"
					role="alert"
					class="rounded-md border border-destructive bg-destructive/10 p-3"
				>
					<p class="font-heading text-small font-semibold text-destructive">Update not applied</p>
					<p class="mt-1 text-caption text-muted-foreground">
						The submitted revision conflicts with a newer version. Reload before retrying.
					</p>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Tabs</Card.Title>
				<Card.Description>Horizontal navigation with an explicit disabled destination.</Card.Description>
			</Card.Header>
			<Card.Content data-gallery-family="primitive:tabs">
				<Tabs.Root value="summary">
					<Tabs.List variant="line">
						<Tabs.Trigger value="summary">Summary</Tabs.Trigger>
						<Tabs.Trigger value="details">Details</Tabs.Trigger>
						<Tabs.Trigger value="archive" disabled>Archive</Tabs.Trigger>
					</Tabs.List>
					<Tabs.Content value="summary" class="pt-4">Stable package defaults.</Tabs.Content>
					<Tabs.Content value="details" class="pt-4">Caller classes still compose.</Tabs.Content>
				</Tabs.Root>
			</Card.Content>
		</Card.Root>

		<Card.Root class="lg:col-span-2" data-gallery-family="primitive:combobox">
			<Card.Header>
				<Card.Title>Combobox</Card.Title>
				<Card.Description>Single-select typeahead with caller-owned multilingual copy.</Card.Description>
			</Card.Header>
			<Card.Content class="gallery-combobox-demo grid gap-3">
				<div data-gallery-state="localized-copy" lang="fr">
					<Combobox
						options={comboboxOptions}
						bind:value={comboboxValue}
						label="Choisir une vue opérationnelle"
						placeholder="Saisir un nom de vue"
						clearLabel="Effacer la vue sélectionnée"
						emptyLabel="Aucune vue correspondante"
						fold={foldText}
					/>
				</div>
				<p class="font-mono text-caption text-muted-foreground">
					Selected: {comboboxValue ?? 'none'}
				</p>
			</Card.Content>
		</Card.Root>

		<Card.Root data-gallery-family="primitive:collapsible">
			<Card.Header>
				<Card.Title>Collapsible</Card.Title>
				<Card.Description>Disclosure state with package-owned reduced-motion behavior.</Card.Description>
			</Card.Header>
			<Card.Content>
				<Collapsible.Root bind:open={collapsibleOpen}>
					<Collapsible.Trigger
						class="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-left"
					>
						<span>Maintenance window</span>
						<span aria-hidden="true">{collapsibleOpen ? '−' : '+'}</span>
					</Collapsible.Trigger>
					<Collapsible.Content class="pt-3 text-small text-muted-foreground">
						A neutral disclosure owns no persistence, route, or product policy.
					</Collapsible.Content>
				</Collapsible.Root>
			</Card.Content>
		</Card.Root>

		<Card.Root data-gallery-family="primitive:resizable">
			<Card.Header>
				<Card.Title>Resizable</Card.Title>
				<Card.Description>Keyboard- and pointer-adjustable horizontal panes.</Card.Description>
			</Card.Header>
			<Card.Content>
				<div class="h-32 overflow-hidden rounded-md border border-border">
					<ResizablePaneGroup direction="horizontal">
						<ResizablePane defaultSize={55} minSize={30}>
							<div class="flex h-full items-center justify-center bg-muted p-3">Overview</div>
						</ResizablePane>
						<ResizableHandle withHandle />
						<ResizablePane defaultSize={45} minSize={25}>
							<div class="flex h-full items-center justify-center bg-card p-3">Detail</div>
						</ResizablePane>
					</ResizablePaneGroup>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root data-gallery-family="primitive:scroll-area">
			<Card.Header>
				<Card.Title>ScrollArea</Card.Title>
				<Card.Description>Bounded content with deliberately overflowing copy.</Card.Description>
			</Card.Header>
			<Card.Content>
				<div data-gallery-state="overflow" aria-label="Scrollable operational notes">
					<ScrollArea class="h-36 rounded-md border border-border" orientation="vertical">
						<ul class="space-y-3 p-3 text-small">
							{#each comboboxOptions as option (option.value)}
								<li>
									<p class="font-medium">{option.label}</p>
									<p class="text-caption text-muted-foreground">{option.sublabel}</p>
								</li>
							{/each}
							<li>
								<p class="font-medium">Extended operational context</p>
								<p class="text-caption text-muted-foreground">
									This final entry ensures the viewport overflows without relying on a product fixture.
								</p>
							</li>
						</ul>
					</ScrollArea>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root data-gallery-family="primitive:separator">
			<Card.Header>
				<Card.Title>Separator</Card.Title>
				<Card.Description>Default, gradient, and hazard treatments.</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-3">
				<Separator />
				<Separator variant="gradient" label="PROCESS BOUNDARY" />
				<Separator variant="hazard" hazardSize="sm" />
			</Card.Content>
		</Card.Root>

		<Card.Root data-gallery-family="primitive:sheet">
			<Card.Header>
				<Card.Title>Sheet</Card.Title>
				<Card.Description>Localized dialog copy with focus-managed dismissal.</Card.Description>
			</Card.Header>
			<Card.Content>
				<Sheet.Root bind:open={sheetOpen}>
					<Sheet.Trigger
						class="rounded-md border border-border px-3 py-2 text-small hover:border-primary"
					>
						Open details
					</Sheet.Trigger>
					<Sheet.Content side="right" closeLabel="Fermer le panneau">
						<Sheet.Header class="border-b border-border p-4">
							<Sheet.Title>Operational detail</Sheet.Title>
							<Sheet.Description>
								A generic drawer demonstrates focus, dismissal, and long copy.
							</Sheet.Description>
						</Sheet.Header>
						<div class="overflow-y-auto p-4 text-small">
							Content remains readable when translated text expands beyond its source length.
						</div>
						<Sheet.Footer class="mt-auto border-t border-border p-4">
							<Sheet.Close class="rounded-md border border-border px-3 py-2">Done</Sheet.Close>
						</Sheet.Footer>
					</Sheet.Content>
				</Sheet.Root>
			</Card.Content>
		</Card.Root>

		<Card.Root data-gallery-family="primitive:skeleton">
			<Card.Header>
				<Card.Title>Loading and error idioms</Card.Title>
				<Card.Description>Accessible state belongs to the composition, not the decoration.</Card.Description>
			</Card.Header>
			<Card.Content>
				<div
					data-gallery-state="loading"
					role="status"
					aria-busy="true"
					aria-label="Loading operational summary"
					class="grid gap-2"
				>
					<Skeleton class="h-4 w-2/3" />
					<Skeleton class="h-4 w-full" />
					<Skeleton class="h-4 w-5/6" />
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root data-gallery-family="primitive:toggle-group">
			<Card.Header>
				<Card.Title>ToggleGroup</Card.Title>
				<Card.Description>One correlated single-selection value.</Card.Description>
			</Card.Header>
			<Card.Content>
				<ToggleGroup type="single" bind:value={toggleGroupValue} variant="outline" spacing={2}>
					<ToggleGroupItem value="summary">Summary</ToggleGroupItem>
					<ToggleGroupItem value="timeline">Timeline</ToggleGroupItem>
					<ToggleGroupItem value="map" disabled>Map</ToggleGroupItem>
				</ToggleGroup>
			</Card.Content>
		</Card.Root>
	</div>
</section>
