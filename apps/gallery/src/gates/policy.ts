import type { ForbiddenPattern } from '@yesid/gates';

export const GALLERY_BRAND_HEXES = ['#E07800', '#FFB627'] as const;

export const GALLERY_FORBIDDEN: readonly ForbiddenPattern[] = [
	{ pattern: /\bbg-bg-/, reason: 'bg-bg-* is not a token utility (use bg-background / bg-card)' },
	{ pattern: /\bborder-bg-/, reason: 'border-bg-* is not a token utility (use border-border-subtle)' },
	{ pattern: /\btext-text-/, reason: 'text-text-* is not a token utility (use text-secondary-foreground)' },
	{ pattern: /var\(--text-light\)/, reason: '--text-light is undefined (use var(--secondary-foreground))' },
	{
		pattern: /var\(--dim-foreground\)|var\(--light-foreground\)/,
		reason: 'aliases to undefined vars (archived in app.css)',
	},
];
