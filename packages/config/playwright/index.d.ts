import type { Page, Project } from '@playwright/test';

/**
 * The standard projects. Untagged tests run at phone, tablet and desktop; tests tagged `@motion`
 * run once with reduced motion, and tests tagged `@theme` run once per theme.
 */
export declare function yesidProjects(baseURL: string): Project[];

/**
 * Fails on any serious or critical axe violation of WCAG 2.2 AA or axe best practice, including a name that
 * leaves out its visible text (WCAG 2.5.3). Blueprint art (`.blueprint-bg`, decorative and aria-hidden) is exempt
 * from the contrast rule only.
 */
export declare function expectAccessible(
	page: Page,
	options?: { include?: string; exclude?: readonly string[] },
): Promise<void>;

/**
 * Fails when a visible control is smaller than `--size-tap-min` in either dimension. A control that is the only one in
 * its list item or table row needs WCAG's 24px; a link inside a sentence is exempt, as is anything inside `exclude`.
 */
export declare function expectTapTargets(page: Page, options?: { exclude?: readonly string[] }): Promise<void>;

/** Fails when the page, or an element matching one of the `scrollers` selectors, scrolls sideways. */
export declare function expectNoHorizontalOverflow(page: Page, scrollers?: readonly string[]): Promise<void>;
