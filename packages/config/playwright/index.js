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
 * Fails on any serious or critical axe violation of WCAG 2.2 AA or axe best practice. Blueprint art
 * (`.blueprint-bg`, decorative and aria-hidden) is exempt from the contrast rule only.
 */
export async function expectAccessible(page, { include, exclude = [] } = {}) {
	const scoped = () => {
		const builder = new AxeBuilder({ page });
		if (include) builder.include(include);
		for (const selector of exclude) builder.exclude(selector);
		return builder;
	};
	const main = await scoped().withTags(rules).disableRules(['color-contrast']).analyze();
	const contrast = await scoped().withRules(['color-contrast']).exclude('.blueprint-bg').analyze();
	const blocking = [...main.violations, ...contrast.violations]
		.filter(({ impact }) => impact === 'serious' || impact === 'critical')
		.map(({ id, impact, help, nodes }) => `${id} (${impact}) ${help}: ${nodes.map(({ target }) => target.join(' ')).join(', ')}`);
	if (blocking.length > 0) {
		throw new Error(`${blocking.length} serious or critical axe violation(s) on ${page.url()}\n${blocking.join('\n')}`);
	}
}
