// @vitest-environment node
import { expect, it } from 'vitest';

it('imports without a window, where desktop reads false', async () => {
	const { desktop } = await import('./index.js');
	expect(desktop.current).toBe(false);
});
