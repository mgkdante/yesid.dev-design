import {cleanup,render,screen} from '@testing-library/svelte';
import {afterEach,expect,it} from 'vitest';
import ConstructionFloodlight from './ConstructionFloodlight.svelte';
afterEach(cleanup);
it('keeps the original fixture decorative and unlit by default, with optional original illumination',async()=>{
	const view=render(ConstructionFloodlight);
	const fixture=view.container.querySelector('[data-slot="construction-floodlight"]')!;
	expect(fixture.getAttribute('data-lit')).toBe('false');
	expect(fixture.querySelector('[data-lamp-glow]')?.getAttribute('opacity')).toBe('0');
	expect(screen.queryByRole('img')).toBeNull();
	expect(view.container.querySelector('button,a,[tabindex]')).toBeNull();
	await view.rerender({lit:true});
	expect(fixture.getAttribute('data-lit')).toBe('true');
	expect(Number(fixture.querySelector('[data-lamp-glow]')?.getAttribute('opacity'))).toBeGreaterThan(0);
});
