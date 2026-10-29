import type { Page, Project } from '@playwright/test';

/**
 * The standard projects. Untagged tests run at phone, tablet and desktop; tests tagged `@motion`
 * run once with reduced motion, and tests tagged `@theme` run once per theme.
 */
export declare function yesidProjects(baseURL: string): Project[];

/**
 * Fails on any serious or critical axe violation of WCAG 2.2 AA or axe best practice. Blueprint art
 * (`.blueprint-bg`, decorative and aria-hidden) is exempt from the contrast rule only.
 */
export declare function expectAccessible(
	page: Page,
	options?: { include?: string; exclude?: readonly string[] },
): Promise<void>;
