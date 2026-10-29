import AxeBuilder from '@axe-core/playwright';

const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const tablet = { viewport: { width: 768, height: 1024 }, hasTouch: true };
const desktop = { viewport: { width: 1440, height: 900 } };
const variant = /@(?:motion|theme)\b/;
const rules = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

/**
 * The standard projects. Untagged tests run at phone, tablet and desktop; tests tagged `@motion`
 * run once with reduced motion, and tests tagged `@theme` run once per theme.
 */
export function yesidProjects(baseURL) {
	const theme = (value) => ({
		cookies: [],
		origins: [{ origin: new URL(baseURL).origin, localStorage: [{ name: 'theme', value }] }],
	});
	return [
		{ name: 'phone', grepInvert: variant, use: phone },
		{ name: 'tablet', grepInvert: variant, use: tablet },
		{ name: 'desktop', grepInvert: variant, use: desktop },
		{ name: 'reduced-motion', grep: /@motion\b/, use: { ...phone, contextOptions: { reducedMotion: 'reduce' } } },
		{ name: 'light', grep: /@theme\b/, use: { ...desktop, storageState: theme('light') } },
		{ name: 'dark', grep: /@theme\b/, use: { ...desktop, storageState: theme('dark') } },
	];
}

/**
 * Fails on any serious or critical axe violation of WCAG 2.2 AA or axe best practice, including a name that
 * leaves out its visible text (WCAG 2.5.3). Blueprint art (`.blueprint-bg`, decorative and aria-hidden) is exempt
 * from the contrast rule only.
 */
export async function expectAccessible(page, { include, exclude = [] } = {}) {
	const scoped = () => {
		const builder = new AxeBuilder({ page });
		if (include) builder.include(include);
		for (const selector of exclude) builder.exclude(selector);
		return builder;
	};
	// `options` replaces the option object, so it comes before `withTags`. Label in name is an axe experimental rule.
	const main = await scoped()
		.options({ rules: { 'color-contrast': { enabled: false }, 'label-content-name-mismatch': { enabled: true } } })
		.withTags(rules)
		.analyze();
	const contrast = await scoped().withRules(['color-contrast']).exclude('.blueprint-bg').analyze();
	const blocking = [...main.violations, ...contrast.violations]
		.filter(({ impact }) => impact === 'serious' || impact === 'critical')
		.map(({ id, impact, help, nodes }) => `${id} (${impact}) ${help}: ${nodes.map(({ target }) => target.join(' ')).join(', ')}`);
	if (blocking.length > 0) {
		throw new Error(`${blocking.length} serious or critical axe violation(s) on ${page.url()}\n${blocking.join('\n')}`);
	}
}

const controls =
	'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"]';

/**
 * Fails when a visible control is smaller than `--size-tap-min` in either dimension. A control that is the only one in
 * its list item or table row needs WCAG's 24px; a link inside a sentence is exempt, as is anything inside `exclude`.
 */
export async function expectTapTargets(page, { exclude = [] } = {}) {
	const small = await page.evaluate(
		({ controls, exclude }) => {
			const probe = document.body.appendChild(document.createElement('div'));
			probe.style.inlineSize = 'var(--size-tap-min)';
			const standalone = probe.getBoundingClientRect().width;
			probe.remove();
			if (!standalone) throw new Error('--size-tap-min is not defined');
			const inSentence = (el) => {
				if (el.localName !== 'a' || getComputedStyle(el).display !== 'inline' || el.closest('nav, [role="navigation"]')) return false;
				let block = el.parentElement;
				while (block && getComputedStyle(block).display.startsWith('inline')) block = block.parentElement;
				if (!block) return false;
				const prose = block.cloneNode(true);
				for (const control of prose.querySelectorAll(controls)) control.remove();
				return prose.textContent.trim() !== '';
			};
			const denseRow = (el) => {
				const row = el.closest('li, tr, [role="listitem"], [role="row"]');
				return Boolean(row) && [...row.querySelectorAll(controls)].every((control) => control === el);
			};
			return [...document.querySelectorAll(controls)].flatMap((el) => {
				if (exclude.some((selector) => el.closest(selector)) || el.closest('[inert], [aria-hidden="true"]')) return [];
				if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return [];
				if (getComputedStyle(el).pointerEvents === 'none' || inSentence(el)) return [];
				const { width, height } = el.getBoundingClientRect();
				const min = denseRow(el) ? 24 : standalone;
				// Boxes of 1px or less are visually hidden, such as an input under its label.
				if (width <= 1 || height <= 1 || (width + 0.5 >= min && height + 0.5 >= min)) return [];
				const name = (el.getAttribute('aria-label') ?? el.textContent).replace(/\s+/g, ' ').trim().slice(0, 40);
				return [`${el.localName} "${name}" ${Math.round(width)}x${Math.round(height)} (needs ${min})`];
			});
		},
		{ controls, exclude },
	);
	if (small.length > 0) {
		throw new Error(`${small.length} tap target(s) below the minimum on ${page.url()}\n${small.join('\n')}`);
	}
}

/** Fails when the page, or an element matching one of the `scrollers` selectors, scrolls sideways. */
export async function expectNoHorizontalOverflow(page, scrollers = []) {
	const wide = await page.evaluate(
		(scrollers) =>
			[document.documentElement, ...scrollers.flatMap((selector) => [...document.querySelectorAll(selector)])]
				.filter((el) => el.scrollWidth > el.clientWidth)
				.map((el) => `${el.localName}${el.id ? `#${el.id}` : ''} is ${el.scrollWidth}px in ${el.clientWidth}px`),
		scrollers,
	);
	if (wide.length > 0) throw new Error(`Horizontal overflow on ${page.url()}: ${wide.join(', ')}`);
}
