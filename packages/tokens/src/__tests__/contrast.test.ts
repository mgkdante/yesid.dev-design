import { readFileSync } from 'node:fs';
import { runContrastPairs, runIdentities, type ContrastPair, type Mode, type TokenIdentity } from '@yesid/gates';
import { describe, expect, it } from 'vitest';

const tokens = JSON.parse(readFileSync(new URL('../../tokens.json', import.meta.url), 'utf8')) as Record<string, unknown>;
const THEMES = ['dark', 'light'] as const;
const TEXT = ['foreground', 'muted-foreground', 'secondary-foreground', 'primary', 'accent-text', 'destructive', 'success'];
const SURFACES = ['background', 'card', 'popover', 'muted'];

const pair = (fg: [Mode, string], bg: [Mode, string], floor = 4.5): ContrastPair => [
	`${fg.join(' ')} on ${bg.join(' ')}`,
	fg,
	bg,
	floor,
];

const PAIRS: ContrastPair[] = [
	...THEMES.flatMap((theme) => {
		const on = (fg: string, bg: string, floor?: number) => pair([theme, fg], [theme, bg], floor);
		return [
			...TEXT.flatMap((fg) => SURFACES.map((bg) => on(fg, bg))),
			on('background', 'primary'),
			on('primary-hover', 'background'),
			on('destructive-foreground', 'destructive'),
			pair([theme, 'accent-foreground'], ['brand', 'accent']),
			...['primary', 'accent-text'].map((fg) => on(fg, 'accent-surface')),
			...['accent-text', 'secondary-foreground'].map((fg) => on(fg, 'terminal-chrome')),
			on('accent-text', 'manifesto'),
			...['terminal-ink', 'terminal-ink-muted'].flatMap((fg) => ['terminal', 'terminal-chrome'].map((bg) => on(fg, bg))),
			// Non-text contrast (WCAG 1.4.11).
			...['input', 'line-amber', 'signal-lunar'].flatMap((fg) => ['background', 'card'].map((bg) => on(fg, bg, 3))),
			on('signal-lunar', 'muted', 3),
		];
	}),
	...['background', 'card'].map((bg) => pair(['light', 'border-strong'], ['light', bg], 3)),
	pair(['brand', 'hazard-a'], ['brand', 'hazard-b'], 3),
	...['signage-text', 'reflective'].map((fg) => pair(['brand', fg], ['brand', 'signage-bg'])),
];

const IDENTITIES = THEMES.map((theme): TokenIdentity => [`${theme} terminal is the page background`, [theme, 'terminal'], [theme, 'background']]);

describe('token contrast (WCAG 2.2 AA)', () => {
	for (const { label, ratio, floor, pass } of runContrastPairs(tokens, PAIRS)) {
		it(`${label} is at least ${floor}:1`, () => {
			expect(pass, `${label} is ${ratio.toFixed(2)}:1`).toBe(true);
		});
	}
	for (const { label, a, b, pass } of runIdentities(tokens, IDENTITIES)) {
		it(label, () => {
			expect(pass, `${a} vs ${b}`).toBe(true);
		});
	}
});
