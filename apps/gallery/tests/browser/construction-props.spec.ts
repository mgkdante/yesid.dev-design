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
		if(visible)await demo.locator('[data-construction-end]').evaluate(el=>{el.scrollIntoView({block:'center'});scrollBy(0,innerHeight*.05);});
		else await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
		await expect(floor).toHaveAttribute('data-state',visible?'visible':'hidden');
		for(const art of await floor.locator('[data-construction-prop] > svg').all())await expect(art).toHaveCSS('opacity',visible?'1':'0');
		expect(await page.evaluate(()=>document.documentElement.scrollHeight)).toBe(height);
	}
	await demo.locator('[data-construction-end]').evaluate(el=>scrollBy(0,el.getBoundingClientRect().top-innerHeight*.825));
	await expect.poll(()=>floor.getAttribute('data-progress').then(Number)).toBeCloseTo(.5,2);
	for(const art of await floor.locator('[data-construction-prop] > svg').all())await expect(art).toHaveCSS('transition-duration','0s');
	await demo.locator('[data-construction-end]').evaluate(el=>scrollBy(0,el.getBoundingClientRect().top-innerHeight*.45));
	await expect(floor).toHaveAttribute('data-state','visible');
	const artworks=await floor.locator('[data-construction-prop]').evaluateAll(els=>els.map(el=>{
		const svg=el.querySelector('svg')!,box=svg.getBBox(),matrix=svg.getScreenCTM()!;
		const points=[[box.x,box.y],[box.x+box.width,box.y+box.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(matrix));
		return {name:(el as HTMLElement).dataset.constructionProp,box:{left:points[0].x,top:points[0].y,right:points[1].x,bottom:points[1].y,width:points[1].x-points[0].x,height:points[1].y-points[0].y},pointer:getComputedStyle(el).pointerEvents};
	}));
	expect(artworks.map(art=>art.name).sort()).toEqual(['balise','barricade','helmet','sign']);
	for(const art of artworks){expect(art.box.width).toBeGreaterThan(0);expect(art.box.height).toBeGreaterThan(0);expect(art.pointer).toBe('none');}
	const frame=await floor.evaluate(el=>el.parentElement!.getBoundingClientRect().toJSON());
	for(const art of artworks)expect(art.box.left>=frame.left-1&&art.box.right<=frame.right+1&&art.box.top>=frame.top-1&&art.box.bottom<=frame.bottom+1).toBe(true);
	await page.emulateMedia({reducedMotion:'reduce'});
	await demo.locator('[data-construction-end]').evaluate(el=>scrollBy(0,el.getBoundingClientRect().top-innerHeight*.825));
	for(const art of await floor.locator('[data-construction-prop] > svg').all())await expect(art).toHaveCSS('transition-duration','0s');
	for(const art of await floor.locator('[data-construction-prop] > svg').all())await expect(art).toHaveCSS('transform','none');
});

test('construction artwork stays available without JavaScript',async({browser,baseURL})=>{
	const context=await browser.newContext({baseURL,javaScriptEnabled:false});
	const page=await context.newPage();
	try{
		await page.goto('/');
		const floor=page.locator('[data-gallery-family="brand:ConstructionProps"] [data-slot="construction-props"]');
		await expect(floor).toHaveAttribute('data-state','static');
		for(const art of await floor.locator('[data-construction-prop] > svg').all())await expect(art).toBeVisible();
	}finally{await context.close();}
});

test('around-fixture spaces phone artwork evenly around a centred fixture gap',async({page})=>{
	test.skip(page.viewportSize()!.width>=768,'phone layout');
	await openGallery(page);
	const floor=page.locator('[data-gallery-family="brand:ConstructionProps"] [data-slot="construction-props"]');
	const frame=await floor.evaluate(el=>el.parentElement!.getBoundingClientRect().toJSON());
	const row=await floor.locator('[data-construction-prop]').evaluateAll(els=>els.map(el=>({name:(el as HTMLElement).dataset.constructionProp,...el.getBoundingClientRect().toJSON()})).sort((a,b)=>a.left-b.left));
	expect(row.map(box=>box.name)).toEqual(['balise','sign','helmet','barricade']);
	const [outer,middle,end]=row.slice(1).map((box,i)=>box.left-row[i].right);
	expect(outer).toBeGreaterThan(1);
	expect(Math.abs(outer-end)).toBeLessThanOrEqual(1);
	expect(Math.abs(middle-(2*outer+40))).toBeLessThanOrEqual(1);
	expect(Math.abs((row[1].right+row[2].left)/2-(frame.left+frame.right)/2)).toBeLessThanOrEqual(1);
	for(const box of row)expect(box.left>=frame.left-1&&box.right<=frame.right+1).toBe(true);
});
