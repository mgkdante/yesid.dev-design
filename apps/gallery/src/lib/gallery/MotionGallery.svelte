<script lang="ts">
	import {
		boop,
		cardParallax,
		cursorGlow,
		magnetic,
		pressBounce,
		sectionGlow,
		wordmarkHover,
	} from '@yesid/motion/actions';
	import { duration, ease } from '@yesid/motion/tokens';

	let wordmarkDot = $state<HTMLSpanElement | null>(null);
</script>

<section class="mt-10" aria-labelledby="gallery-motion">
	<h2 id="gallery-motion" class="font-heading text-title font-semibold">Motion vocabulary</h2>
	<p class="mt-1 text-small text-muted-foreground">
		Durations {Object.entries(duration)
			.map(([name, value]) => `${name} ${value}ms`)
			.join(' · ')} · easings {Object.keys(ease).join(', ')}.
	</p>

	<div class="mt-4 grid gap-4 md:grid-cols-2">
		<div
			data-gallery-family="motion:boop"
			class="rounded-lg border border-border-subtle bg-card p-4"
		>
			<p class="mb-3 font-mono text-caption text-muted-foreground">boop</p>
			<button
				type="button"
				class="rounded-md bg-primary px-4 py-2 text-primary-foreground"
				use:boop={{ scale: 1.05, rotation: 2 }}
			>
				Hover response
			</button>
		</div>

		<div
			data-gallery-family="motion:magnetic"
			class="rounded-lg border border-border-subtle bg-card p-4"
		>
			<p class="mb-3 font-mono text-caption text-muted-foreground">magnetic</p>
			<button
				type="button"
				class="rounded-md border border-border-strong px-4 py-2"
				use:magnetic={{ strength: 4, radius: 60 }}
			>
				Cursor pull
			</button>
		</div>

		<div
			data-gallery-family="motion:pressBounce"
			class="rounded-lg border border-border-subtle bg-card p-4"
		>
			<p class="mb-3 font-mono text-caption text-muted-foreground">pressBounce</p>
			<button
				type="button"
				class="tap-press rounded-md bg-signage-bg px-4 py-2 text-signage-text"
				use:pressBounce
			>
				Touch response
			</button>
		</div>

		<div
			data-gallery-family="motion:cursorGlow"
			class="rounded-lg border border-border-subtle bg-card p-4"
		>
			<p class="mb-3 font-mono text-caption text-muted-foreground">cursorGlow</p>
			<div
				class="rounded-md border border-border px-5 py-4"
				role="img"
				aria-label="Pointer-following glow surface"
				use:cursorGlow={{ intensity: 0.08 }}
			>
				Pointer-following light
			</div>
		</div>

		<div
			data-gallery-family="motion:sectionGlow"
			class="section-glow-demo rounded-lg border border-border-subtle bg-card p-4"
			role="img"
			aria-label="Section glow demonstration"
			use:sectionGlow
		>
			<div>
				<p class="font-mono text-caption text-muted-foreground">sectionGlow</p>
				<p class="mt-3 text-small">Alpha-only light tracks across the section surface.</p>
			</div>
		</div>

		<div
			data-gallery-family="motion:cardParallax"
			class="rounded-lg border border-border-subtle bg-card p-4"
			use:cardParallax
		>
			<div class="parallax-content">
				<p class="font-mono text-caption text-muted-foreground">cardParallax</p>
				<p class="mt-3 text-small">The inner content moves within a four-pixel bound.</p>
			</div>
		</div>

		<div
			data-gallery-family="motion:wordmarkHover"
			class="rounded-lg border border-border-subtle bg-card p-4 md:col-span-2"
		>
			<p class="mb-3 font-mono text-caption text-muted-foreground">wordmarkHover</p>
			<button
				type="button"
				class="inline-flex items-baseline rounded-md px-2 py-1 font-heading text-heading font-bold focus-visible:outline-2 focus-visible:outline-primary"
				aria-label="Animate the sample wordmark"
			>
				{#if wordmarkDot}
					<span use:wordmarkHover={{ dotEl: wordmarkDot }}>signal</span>
				{:else}
					<span>signal</span>
				{/if}
				<span bind:this={wordmarkDot} class="text-primary" aria-hidden="true">.</span>
			</button>
		</div>
	</div>
</section>

<style>
	.section-glow-demo {
		position: relative;
		isolation: isolate;
		overflow: hidden;
	}

	.section-glow-demo::before {
		position: absolute;
		inset: 0;
		z-index: -1;
		content: '';
		background: radial-gradient(
			circle at var(--glow-x, 50%) var(--glow-y, 50%),
			color-mix(in srgb, var(--primary) 14%, transparent),
			transparent 68%
		);
		opacity: var(--glow-opacity, 0);
		transition: opacity var(--duration-normal) var(--ease-out);
	}

	.parallax-content {
		transform: translate(var(--parallax-x, 0), var(--parallax-y, 0));
		transition: transform var(--duration-fast) var(--ease-out);
	}

	@media (prefers-reduced-motion: reduce) {
		.section-glow-demo::before,
		.parallax-content {
			transition: none;
		}
	}
</style>
