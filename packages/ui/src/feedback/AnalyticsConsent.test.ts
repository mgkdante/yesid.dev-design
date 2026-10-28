import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { createAnalyticsConsentStore } from '@yesid/analytics/consent';
import { defineAnalyticsPreset } from '@yesid/analytics/config';
import { describe, expect, it } from 'vitest';
import AnalyticsConsent, { type AnalyticsConsentProps } from './AnalyticsConsent.svelte';

const preset = defineAnalyticsPreset({
	domain: 'metrics.example',
	events: [],
	storageKeys: { consent: 'c', preferencesOpen: 'p', denialSafety: 's', storageProbe: 'probe' },
});

function memoryStore() {
	const values = new Map<string, string>();
	const store = createAnalyticsConsentStore(preset, {
		hostname: () => preset.domain,
		probeDurableStorage: () => {},
		read: () => values.get('consent') ?? null,
		write: (value) => void values.set('consent', value),
		remove: () => void values.delete('consent'),
		readPreferencesMarker: () => values.get('marker') ?? null,
		writePreferencesMarker: (value) => void values.set('marker', value),
		removePreferencesMarker: () => void values.delete('marker'),
		readSafetyMarker: () => values.get('safety') ?? null,
		writeSafetyMarker: () => void values.set('safety', '1'),
		removeSafetyMarker: () => void values.delete('safety'),
		reload: () => {},
		listen: () => () => {},
	});
	return { store, values };
}

const copy = {
	title: 'Analytics',
	description: 'Count anonymous visits?',
	accept: 'Allow',
	decline: 'No thanks',
	settings: 'Analytics settings',
	privacy: 'Privacy',
};

function consent(props: Partial<AnalyticsConsentProps> = {}) {
	const { store, values } = memoryStore();
	render(AnalyticsConsent, {
		props: { store, copy, privacyHref: '/privacy', id: 'analytics-consent', ...props },
	});
	return { store, values };
}

describe('AnalyticsConsent', () => {
	it('asks once storage is ready, and a choice dismisses it and is stored', async () => {
		const { values } = consent();

		const rail = await screen.findByRole('region', { name: copy.title });
		expect(document.getElementById(rail.getAttribute('aria-describedby')!)?.textContent).toBe(
			copy.description,
		);
		expect(screen.getByRole('link', { name: copy.privacy }).getAttribute('href')).toBe('/privacy');

		await fireEvent.click(screen.getByRole('button', { name: copy.decline }));
		await waitFor(() => expect(screen.queryByRole('region')).toBeNull());
		expect(values.get('consent')).toBe('denied');
	});

	it('stays hidden when the product controls hide the banner or the caller holds it back', async () => {
		consent({ controls: { enabled: true, showBanner: false } });
		consent({ canShow: false });
		await Promise.resolve();

		expect(screen.queryByRole('region')).toBeNull();
	});

	it('reopens as settings with the current choice pressed and takes focus', async () => {
		const { store } = consent();
		await fireEvent.click(await screen.findByRole('button', { name: copy.accept }));

		store.openPreferences();

		const rail = await screen.findByRole('region', { name: copy.settings });
		await waitFor(() => expect(document.activeElement).toBe(rail));
		const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed');
		expect([pressed(copy.accept), pressed(copy.decline)]).toEqual(['true', 'false']);
	});
});
