import { describe, expect, it } from 'vitest';
import { getAnalyticsPolicy, normalizeAnalyticsControls } from './policy';
import type { AnalyticsConsentChoice, AnalyticsConsentState } from './consent.svelte';

describe('analytics control normalization', () => {
	it.each([
		['legacy missing controls', undefined, undefined, true, true],
		['explicit defaults', true, true, true, true],
		['explicit hidden mode', true, false, true, false],
		['explicit global disable', false, true, false, true],
		['explicit disabled hidden mode', false, false, false, false],
		['disabled with a missing banner control', false, undefined, false, true],
		['disabled with a malformed banner control', false, 'false', false, true],
		['hidden with a missing enabled control', undefined, false, true, true],
		['hidden with a malformed enabled control', 'true', false, true, true],
		['malformed false strings', 'false', 'false', true, true],
	] as const)(
		'normalizes %s safely',
		(_label, enabled, showBanner, expectedEnabled, expectedShowBanner) => {
			expect(normalizeAnalyticsControls({ enabled, showBanner })).toEqual({
				enabled: expectedEnabled,
				showBanner: expectedShowBanner,
			});
		},
	);
});

describe('analytics policy', () => {
	const operationalCases = [
		['banner', 'unknown', false, true, false, true],
		['banner', 'unknown', true, true, false, true],
		['banner', 'granted', false, true, true, false],
		['banner', 'granted', true, true, false, true],
		['banner', 'denied', false, true, false, false],
		['banner', 'denied', true, true, false, true],
		['hidden', 'unknown', false, false, true, false],
		['hidden', 'unknown', true, false, false, true],
		['hidden', 'granted', false, false, true, false],
		['hidden', 'granted', true, false, false, true],
		['hidden', 'denied', false, false, false, false],
		['hidden', 'denied', true, false, false, true],
	] as const;

	it.each(operationalCases)(
		'derives enabled %s mode with choice=%s and preferencesOpen=%s',
		(_mode, choice, preferencesOpen, showBanner, canTrack, showPrompt) => {
			expect(
				getAnalyticsPolicy(
					{ enabled: true, showBanner },
					{ choice, ready: true, available: true, preferencesOpen },
				),
			).toEqual({
				enabled: true,
				showBanner,
				canTrack,
				showPrompt,
				showPreferences: true,
			});
		},
	);

	const gatedConsentStates = (gate: 'disabled' | 'not-ready' | 'unavailable') =>
		([true, false] as const).flatMap((showBanner) =>
			(['unknown', 'granted', 'denied'] as const).flatMap((choice) =>
				([false, true] as const).map(
					(preferencesOpen) => [gate, showBanner, choice, preferencesOpen] as const,
				),
			),
		);

	it.each([
		...gatedConsentStates('disabled'),
		...gatedConsentStates('not-ready'),
		...gatedConsentStates('unavailable'),
	])(
		'gates %s analytics with showBanner=%s, choice=%s, and preferencesOpen=%s',
		(gate, showBanner, choice, preferencesOpen) => {
			const controls = { enabled: gate !== 'disabled', showBanner };
			const state: AnalyticsConsentState = {
				choice,
				ready: gate !== 'not-ready',
				available: gate !== 'unavailable',
				preferencesOpen,
			};

			expect(getAnalyticsPolicy(controls, state)).toEqual({
				enabled: gate !== 'disabled',
				showBanner,
				canTrack: false,
				showPrompt: false,
				showPreferences: false,
			});
		},
	);

	it('prevents malformed controls from activating hidden mode', () => {
		expect(
			getAnalyticsPolicy(
				{ enabled: undefined, showBanner: false },
				{
					choice: 'unknown',
					ready: true,
					available: true,
					preferencesOpen: false,
				},
			),
		).toEqual({
			enabled: true,
			showBanner: true,
			canTrack: false,
			showPrompt: true,
			showPreferences: true,
		});
	});

	it('keeps a saved grant dormant while disabled and resumes it without mutating consent', () => {
		const consent: AnalyticsConsentState = {
			choice: 'granted',
			ready: true,
			available: true,
			preferencesOpen: false,
		};

		expect(getAnalyticsPolicy({ enabled: false, showBanner: false }, consent).canTrack).toBe(false);
		expect(getAnalyticsPolicy({ enabled: true, showBanner: false }, consent).canTrack).toBe(true);
		expect(consent).toEqual({
			choice: 'granted',
			ready: true,
			available: true,
			preferencesOpen: false,
		});
	});

	it('keeps the exhaustive choice type in sync with the policy cases', () => {
		const choices = new Set<AnalyticsConsentChoice>(operationalCases.map((entry) => entry[1]));

		expect(choices).toEqual(new Set(['unknown', 'granted', 'denied']));
	});
});
