import { render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import CornerMeta from './CornerMeta.svelte';

const text = (value: string) => createRawSnippet(() => ({ render: () => `<span>${value}</span>` }));

describe('CornerMeta', () => {
	it('keeps its decorative notes away from assistive tech', () => {
		const { container } = render(CornerMeta, { props: { topLeft: text('LINE 24') } });

		expect(container.querySelector('[aria-hidden="true"]')?.textContent).toContain('LINE 24');
	});
});
