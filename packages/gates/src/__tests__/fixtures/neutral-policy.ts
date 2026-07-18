import type { ForbiddenPattern } from '../../engines/styleRegressions.js';
import type { ContrastPair, TokenIdentity } from '../../engines/contrastPairs.js';

export const FROZEN_FORBIDDEN: readonly ForbiddenPattern[] = [
	{ pattern: /\bbg-legacy\b/, reason: 'legacy surface utility is forbidden' },
];

export const FROZEN_BRAND_HEXES = ['#123ABC', '#FEDCBA'] as const;

export const FROZEN_TOKENS = {
	color: {
		dark: {
			ink: { $value: '#F5F5F5' },
			canvas: { $value: '#111111' },
			surface: { $value: '#222222' },
		},
		light: {
			ink: { $value: '#111111' },
			canvas: { $value: '#F5F5F5' },
		},
		brand: {
			signal: { $value: '#0055AA' },
			surface: { $value: '#222222' },
		},
	},
} as const;

export const FROZEN_CONTRAST_PAIRS: readonly ContrastPair[] = [
	['dark ink/canvas', ['dark', 'ink'], ['dark', 'canvas'], 4.5],
	['light ink/canvas', ['light', 'ink'], ['light', 'canvas'], 4.5],
	['brand signal/light canvas', ['brand', 'signal'], ['light', 'canvas'], 4.5],
];

export const FROZEN_IDENTITIES: readonly TokenIdentity[] = [
	['shared structural surface', ['dark', 'surface'], ['brand', 'surface']],
];
