import {expect,test} from '@playwright/test';
import {GALLERY_THEMES,openGallery} from './gallery.js';

for(const theme of GALLERY_THEMES) test(`construction artwork reverses safely at its bottom target (${theme})`,async({page})=>{
	await page.emulateMedia({reducedMotion:'no-preference'});
	await openGallery(page,theme);
	const demo=page.locator('[data-gallery-family="brand:ConstructionProps"]');
	const floor=demo.locator('[data-slot="construction-props"]').first();
	await expect(floor).toHaveAttribute('data-state','hidden');
	const height=await page.evaluate(()=>document.documentElement.scrollHeight);
	for(const visible of [true,false,true,false,true]){
		if(visible)await demo.locator('[data-construction-end]').evaluate(el=>el.scrollIntoView({block:'end'}));
		else await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
		await expect(floor).toHaveAttribute('data-state',visible?'visible':'hidden');
		for(const art of await floor.locator('[data-construction-prop] > svg').all())await expect(art).toHaveCSS('opacity',visible?'1':'0');
		expect(await page.evaluate(()=>document.documentElement.scrollHeight)).toBe(height);
	}
	const artworks=await floor.locator('[data-construction-prop]').evaluateAll(els=>els.map(el=>({name:(el as HTMLElement).dataset.constructionProp,box:el.getBoundingClientRect().toJSON(),pointer:getComputedStyle(el).pointerEvents})));
	expect(artworks.map(art=>art.name).sort()).toEqual(['balise','barricade','helmet','sign','stop']);
	for(const art of artworks){expect(art.box.width).toBeGreaterThan(0);expect(art.box.height).toBeGreaterThan(0);expect(art.pointer).toBe('none');}
	for(let i=0;i<artworks.length;i++)for(let j=i+1;j<artworks.length;j++){
		const a=artworks[i].box,b=artworks[j].box;
		expect(Math.min(a.right,b.right)<=Math.max(a.left,b.left)||Math.min(a.bottom,b.bottom)<=Math.max(a.top,b.top)).toBe(true);
	}
	const stop=floor.locator('[data-construction-prop="stop"] svg');
	for(const label of ['ARRÊT','STOP']){
		const text=stop.getByText(label,{exact:true});await expect(text).toBeVisible();
		const box=(await text.boundingBox())!,sign=(await stop.boundingBox())!;
		expect(box.x>=sign.x&&box.y>=sign.y&&box.x+box.width<=sign.x+sign.width&&box.y+box.height<=sign.y+sign.height).toBe(true);
	}
	await page.emulateMedia({reducedMotion:'reduce'});
	for(const art of await floor.locator('[data-construction-prop] > svg').all())await expect(art).toHaveCSS('transition-duration','0s');
});
