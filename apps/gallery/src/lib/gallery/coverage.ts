export const GALLERY_COVERAGE = {
	primitives: [
		'badge',
		'button',
		'card',
		'collapsible',
		'combobox',
		'resizable',
		'scroll-area',
		'separator',
		'sheet',
		'skeleton',
		'tabs',
		'toggle',
		'toggle-group',
	],
	brand: [
		'BlueprintShell',
		'ChevronToggle',
		'MetroStation',
		'SectionLabel',
		'StickyPanel',
		'StopLabel',
		'TerminalCursor',
		'TocBadge',
	],
	motion: [
		'boop',
		'magnetic',
		'cursorGlow',
		'sectionGlow',
		'cardParallax',
		'wordmarkHover',
		'pressBounce',
	],
	states: ['disabled', 'error', 'loading', 'overflow', 'localized-copy'],
	environments: ['dark', 'light', 'reduced-motion', 'desktop', 'mobile'],
} as const;

export type PrimitiveFamily = (typeof GALLERY_COVERAGE.primitives)[number];
export type BrandFamily = (typeof GALLERY_COVERAGE.brand)[number];
export type MotionFamily = (typeof GALLERY_COVERAGE.motion)[number];
