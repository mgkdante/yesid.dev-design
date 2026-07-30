<script lang="ts">
	import { FooterGroup, FooterLink } from '../index.js';

	let anchorRef = $state<HTMLAnchorElement | null>(null);
	let buttonRef = $state<HTMLButtonElement | null>(null);
	let buttonClicks = $state(0);
</script>

<FooterGroup
	label="Explore"
	class="fixture-footer-group"
	data-slot="custom-footer-group"
	data-testid="footer-group"
>
	<FooterLink
		bind:ref={anchorRef}
		href="/work"
		target="_blank"
		rel="noopener noreferrer"
		class="fixture-footer-link"
		data-testid="footer-anchor"
	>
		Work
	</FooterLink>
	<FooterLink
		bind:ref={buttonRef}
		type="submit"
		aria-controls="analytics-consent"
		aria-expanded="false"
		data-slot="custom-footer-link"
		data-testid="footer-button"
		onclick={() => {
			buttonClicks += 1;
		}}
	>
		Preferences
	</FooterLink>
	<FooterLink href={null} data-testid="nullable-footer-button">Nullable</FooterLink>
</FooterGroup>

<output data-testid="anchor-ref">{anchorRef?.tagName ?? ''}</output>
<output data-testid="button-ref">{buttonRef?.tagName ?? ''}</output>
<output data-testid="button-clicks">{buttonClicks}</output>
