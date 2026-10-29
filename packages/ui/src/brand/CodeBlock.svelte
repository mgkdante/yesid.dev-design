<!--
  Source code in a TerminalPanel: the language as its tag and an optional copy button. `children`
  is the app's `<pre>`, usually wrapping `@yesid/seo-kit/highlight` markup; without it the code
  shows as plain text.
-->
<script lang="ts" module>
	import type { Snippet } from 'svelte';

	export interface CodeBlockCopyLabels {
		label: string;
		ariaLabel: string;
		/** Announced after a successful copy. */
		copied?: string;
		/** Shown and announced when the clipboard refuses the copy. */
		failed: string;
	}

	export interface CodeBlockProps {
		/** The source. The copy button copies it. */
		code: string;
		title: string;
		language?: string;
		/** Shows a copy button with these labels. */
		copy?: CodeBlockCopyLabels;
		children?: Snippet;
		class?: string;
	}
</script>

<script lang="ts">
	import { tick } from 'svelte';
	import { cn } from '../cn/index.js';
	import TerminalPanel from './TerminalPanel.svelte';

	let { code, title, language, copy, children, class: className }: CodeBlockProps = $props();

	let copyState = $state<'idle' | 'copied' | 'failed'>('idle');
	let resetTimer: ReturnType<typeof setTimeout> | undefined;
	const status = $derived(copyState === 'copied' ? copy?.copied : copyState === 'failed' ? copy?.failed : '');

	async function copyCode() {
		// Empty the status first so a repeated copy is announced again.
		clearTimeout(resetTimer);
		copyState = 'idle';
		await tick();
		try {
			await navigator.clipboard.writeText(code);
			copyState = 'copied';
		} catch {
			copyState = 'failed';
		}
		resetTimer = setTimeout(() => (copyState = 'idle'), 2000);
	}

	$effect(() => () => clearTimeout(resetTimer));
</script>

{#snippet copyButton()}
	<button type="button" class="terminal-code-copy" onclick={copyCode} aria-label={copy?.ariaLabel}>
		{copyState === 'copied' ? '✓' : copyState === 'failed' ? copy?.failed : copy?.label}
	</button>
	<span class="sr-only" role="status">{status}</span>
{/snippet}

<TerminalPanel
	{title}
	tag={language}
	actions={copy ? copyButton : undefined}
	noPadding
	class={cn('terminal-code', className)}
	data-code-language={language}
>
	<div class="terminal-code-body">
		{#if children}
			{@render children()}
		{:else}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<pre tabindex="0"><code>{code}</code></pre>
		{/if}
	</div>
</TerminalPanel>
