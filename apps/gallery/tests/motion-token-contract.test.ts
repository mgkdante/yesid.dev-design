import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { duration, durationSec, ease } from '@yesid/motion';
import { describe, expect, it } from 'vitest';

const REPOSITORY_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

interface ScalarToken {
	$value: string | number;
}

interface MotionTokens {
	duration: Record<string, ScalarToken>;
	ease: Record<string, ScalarToken>;
	color: { brand: { 'primary-rgb': ScalarToken } };
}

const canonical = JSON.parse(
	readFileSync(join(REPOSITORY_ROOT, 'packages/tokens/tokens.json'), 'utf8'),
) as MotionTokens;
const css = readFileSync(join(REPOSITORY_ROOT, 'packages/tokens/tokens.css'), 'utf8');

function cssValue(name: string): string | undefined {
	return css.match(new RegExp(`--${name}:\\s*([^;]+);`, 'u'))?.[1]?.trim();
}

function durationMilliseconds(value: string | number): number {
	const match = String(value).match(/^(\d+(?:\.\d+)?)(ms|s)$/u);
	if (!match?.[1] || !match[2]) throw new Error(`Unsupported duration token ${String(value)}`);
	return Number(match[1]) * (match[2] === 's' ? 1_000 : 1);
}

function camelCase(value: string): string {
	return value.replace(/-([a-z])/gu, (_, letter: string) => letter.toUpperCase());
}

describe('canonical token to runtime motion contract', () => {
	it('belongs at the Gallery integration boundary instead of reaching across packages', () => {
		expect(existsSync(join(REPOSITORY_ROOT, 'packages/motion/src/tokens.test.ts'))).toBe(false);
	});

	it('derives every duration runtime and CSS value from tokens.json', () => {
		const runtime = duration as Readonly<Record<string, number>>;
		expect(Object.keys(runtime).sort()).toEqual(Object.keys(canonical.duration).sort());

		for (const [name, token] of Object.entries(canonical.duration)) {
			const milliseconds = durationMilliseconds(token.$value);
			expect(runtime[name], `duration.${name}`).toBe(milliseconds);
			expect(durationSec(name as keyof typeof duration), `durationSec(${name})`).toBe(
				milliseconds / 1_000,
			);
			expect(cssValue(`duration-${name}`), `--duration-${name}`).toBe(String(token.$value));
		}
	});

	it('derives every easing runtime and CSS value from tokens.json', () => {
		const runtime = ease as Readonly<Record<string, string>>;
		const canonicalRuntimeKeys = Object.keys(canonical.ease).map(camelCase);
		expect(Object.keys(runtime).sort()).toEqual(canonicalRuntimeKeys.sort());

		for (const [name, token] of Object.entries(canonical.ease)) {
			const value = String(token.$value);
			expect(runtime[camelCase(name)], `ease.${camelCase(name)}`).toBe(value);
			expect(cssValue(`ease-${name}`), `--ease-${name}`).toBe(value);
		}
	});

	it('keeps required direct runtime variables in the generated CSS artifact', () => {
		expect(cssValue('duration-instant')).toBe(String(canonical.duration.instant?.$value));
		expect(cssValue('duration-slow')).toBe(String(canonical.duration.slow?.$value));
		expect(cssValue('ease-bounce')).toBe(String(canonical.ease.bounce?.$value));
		expect(cssValue('primary-rgb')).toBe(String(canonical.color.brand['primary-rgb'].$value));
	});
});
