import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CodeBlock from './CodeBlock.svelte';

const code = 'select 1';
const copy = { label: 'Copy', ariaLabel: 'Copy code', copied: 'Copied', failed: 'Copy failed' };
const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const writeText = vi.fn();

beforeEach(() => {
	writeText.mockReset().mockResolvedValue(undefined);
	Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
	if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard);
	else Reflect.deleteProperty(navigator, 'clipboard');
});

describe('CodeBlock', () => {
	it('shows the language and focusable plain code without a copy button', () => {
		render(CodeBlock, { props: { code, title: 'Query', language: 'SQL' } });
		expect(screen.queryByRole('button')).toBeNull();
		expect(screen.getByText('SQL')).toBeInTheDocument();
		const pre = screen.getByText(code).closest('pre')!;
		pre.focus();
		expect(document.activeElement).toBe(pre);
	});

	it('copies the source, confirms success and resets after two seconds', async () => {
		vi.useFakeTimers();
		render(CodeBlock, { props: { code, title: 'Query', copy } });
		const button = screen.getByRole('button', { name: 'Copy code' });
		await fireEvent.click(button);
		await tick();
		expect(writeText).toHaveBeenCalledExactlyOnceWith(code);
		expect(button.textContent?.trim()).toBe('✓');
		expect(screen.getByRole('status').textContent).toBe('Copied');
		vi.advanceTimersByTime(2000);
		await tick();
		expect(button.textContent?.trim()).toBe('Copy');
		expect(screen.getByRole('status').textContent).toBe('');
	});

	it('shows the supplied failure label when the clipboard rejects', async () => {
		writeText.mockRejectedValue(new Error('Clipboard denied'));
		render(CodeBlock, { props: { code, title: 'Query', copy } });
		const button = screen.getByRole('button', { name: 'Copy code' });
		await fireEvent.click(button);
		await tick();
		expect(button.textContent?.trim()).toBe('Copy failed');
		expect(screen.getByRole('status').textContent).toBe('Copy failed');
	});

	it('replaces the plain code with highlighted children', () => {
		render(CodeBlock, { props: {
			code, title: 'Query',
			children: createRawSnippet(() => ({ render: () => '<pre><code>highlighted</code></pre>' })),
		} });
		expect(screen.getByText('highlighted')).toBeInTheDocument();
		expect(screen.queryByText(code)).toBeNull();
	});
});
