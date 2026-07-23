import { describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { getAnalyticsPolicy } from './policy';
import { defineAnalyticsPreset } from './config';
import {
	createAnalyticsConsentStore,
	probeDurableAnalyticsStorage,
	type AnalyticsConsentChoice,
} from './consent.svelte';

const PRESET = defineAnalyticsPreset({
	domain: 'metrics.example',
	events: ['event_alpha', 'event_beta'] as const,
	storageKeys: {
		consent: 'test:analytics-consent:v1',
		preferencesOpen: 'test:analytics-preferences-open:v1',
		denialSafety: 'test:analytics-denial-safety:v1',
		storageProbe: 'test:analytics-storage-probe:v1',
	},
});
const ANALYTICS_CONSENT_KEY = PRESET.storageKeys.consent;
const ANALYTICS_PREFERENCES_OPEN_KEY = PRESET.storageKeys.preferencesOpen;
const ANALYTICS_DENIAL_SAFETY_KEY = PRESET.storageKeys.denialSafety;
const ANALYTICS_STORAGE_PROBE_KEY = PRESET.storageKeys.storageProbe;

interface HarnessOptions {
	hostname?: string;
	stored?: string | null;
	marker?: string | null;
	safetyMarker?: string | null;
	probeThrows?: boolean;
	readThrows?: boolean;
	writeThrows?: boolean;
	writeFailures?: number;
	removeThrows?: boolean;
	markerReadThrows?: boolean;
	markerWriteThrows?: boolean;
	markerRemoveThrows?: boolean;
	safetyReadThrows?: boolean;
	safetyWriteThrows?: boolean;
	safetyRemoveThrows?: boolean;
	reloadThrows?: boolean;
	listenThrows?: boolean;
}

function createHarness({
	hostname = 'metrics.example',
	stored = null,
	marker = null,
	safetyMarker = null,
	probeThrows = false,
	readThrows = false,
	writeThrows = false,
	writeFailures = 0,
	removeThrows = false,
	markerReadThrows = false,
	markerWriteThrows = false,
	markerRemoveThrows = false,
	safetyReadThrows = false,
	safetyWriteThrows = markerWriteThrows,
	safetyRemoveThrows = false,
	reloadThrows = false,
	listenThrows = false,
}: HarnessOptions = {}) {
	let value = stored;
	let markerValue = marker;
	let safetyMarkerValue = safetyMarker;
	let remainingWriteFailures = writeFailures;
	let activeProbeThrows = probeThrows;
	let activeWriteThrows = writeThrows;
	let activeRemoveThrows = removeThrows;
	let activeMarkerWriteThrows = markerWriteThrows;
	let activeSafetyWriteThrows = safetyWriteThrows;
	const listeners = new Set<(next: string | null) => void>();
	const probeDurableStorage = vi.fn(() => {
		if (activeProbeThrows) throw new Error('durable storage probe blocked');
	});
	const reload = vi.fn(() => {
		if (reloadThrows) throw new Error('reload blocked');
	});
	const read = vi.fn(() => {
		if (readThrows) throw new Error('read blocked');
		return value;
	});
	const write = vi.fn((next: AnalyticsConsentChoice) => {
		if (activeWriteThrows || remainingWriteFailures > 0) {
			remainingWriteFailures -= 1;
			throw new Error('write blocked');
		}
		value = next;
	});
	const remove = vi.fn(() => {
		if (activeRemoveThrows) throw new Error('remove blocked');
		value = null;
	});
	const readPreferencesMarker = vi.fn(() => {
		if (markerReadThrows) throw new Error('session read blocked');
		return markerValue;
	});
	const writePreferencesMarker = vi.fn((choice: AnalyticsConsentChoice = 'unknown') => {
		if (activeMarkerWriteThrows) throw new Error('session write blocked');
		markerValue = choice;
	});
	const removePreferencesMarker = vi.fn(() => {
		if (markerRemoveThrows) throw new Error('session remove blocked');
		markerValue = null;
	});
	const readSafetyMarker = vi.fn(() => {
		if (safetyReadThrows) throw new Error('safety read blocked');
		return safetyMarkerValue;
	});
	const writeSafetyMarker = vi.fn(() => {
		if (activeSafetyWriteThrows) throw new Error('safety write blocked');
		safetyMarkerValue = '1';
	});
	const removeSafetyMarker = vi.fn(() => {
		if (safetyRemoveThrows) throw new Error('safety remove blocked');
		safetyMarkerValue = null;
	});
	const listen = vi.fn((listener: (next: string | null) => void) => {
		if (listenThrows) throw new Error('storage listener blocked');
		listeners.add(listener);
		return () => listeners.delete(listener);
	});
	const dependencies = {
		hostname: () => hostname,
		probeDurableStorage,
		read,
		write,
		remove,
		readPreferencesMarker,
		writePreferencesMarker,
		removePreferencesMarker,
		readSafetyMarker,
		writeSafetyMarker,
		removeSafetyMarker,
		reload,
		listen,
	};
	const store = createAnalyticsConsentStore(PRESET, dependencies);

	return {
		store,
		probeDurableStorage,
		read,
		write,
		remove,
		readPreferencesMarker,
		writePreferencesMarker,
		removePreferencesMarker,
		readSafetyMarker,
		writeSafetyMarker,
		removeSafetyMarker,
		reload,
		listen,
		stored: () => value,
		marker: () => markerValue,
		safetyMarker: () => safetyMarkerValue,
		emitStoredChange: (next: string | null) => {
			value = next;
			for (const listener of listeners) listener(next);
		},
		setFailures: ({
			probe,
			write,
			remove,
			markerWrite,
			safetyWrite,
		}: Partial<{
			probe: boolean;
			write: boolean;
			remove: boolean;
			markerWrite: boolean;
			safetyWrite: boolean;
		}>) => {
			if (probe !== undefined) activeProbeThrows = probe;
			if (write !== undefined) activeWriteThrows = write;
			if (remove !== undefined) activeRemoveThrows = remove;
			if (markerWrite !== undefined) activeMarkerWriteThrows = markerWrite;
			if (safetyWrite !== undefined) activeSafetyWriteThrows = safetyWrite;
		},
		freshStore: () => createAnalyticsConsentStore(PRESET, dependencies),
	};
}

describe('analytics consent state', () => {
	it('probes healthy durable storage before reading choices without changing consent', () => {
		const harness = createHarness({ stored: 'granted' });

		harness.store.init();

		expect(harness.probeDurableStorage).toHaveBeenCalledOnce();
		expect(harness.read).toHaveBeenCalledOnce();
		expect(harness.probeDurableStorage.mock.invocationCallOrder[0]).toBeLessThan(
			harness.read.mock.invocationCallOrder[0]!,
		);
		expect(harness.stored()).toBe('granted');
		expect(get(harness.store)).toEqual({
			choice: 'granted',
			ready: true,
			available: true,
			preferencesOpen: false,
		});
	});

	it('fails unavailable without reading choices when the durable storage probe fails', () => {
		const harness = createHarness({ stored: 'granted', marker: '1', probeThrows: true });

		harness.store.init();

		expect(harness.probeDurableStorage).toHaveBeenCalledOnce();
		expect(harness.read).not.toHaveBeenCalled();
		expect(harness.readPreferencesMarker).not.toHaveBeenCalled();
		expect(get(harness.store)).toEqual({
			choice: 'unknown',
			ready: true,
			available: false,
			preferencesOpen: false,
		});
	});

	it('clears a pending preferences marker when storage failure makes the rail unrenderable', () => {
		const harness = createHarness({ stored: 'granted', marker: 'granted', probeThrows: true });

		harness.store.init();

		expect(harness.removePreferencesMarker).toHaveBeenCalledOnce();
		expect(harness.marker()).toBeNull();
		expect(get(harness.store)).toEqual({
			choice: 'unknown',
			ready: true,
			available: false,
			preferencesOpen: false,
		});
	});

	it.each([null, '', 'yes', 'GRANTED'])('fails closed for missing or invalid storage value %j', (stored) => {
		const { store } = createHarness({ stored });

		expect(store.init()).toBeTypeOf('function');
		expect(get(store)).toEqual({
			choice: 'unknown',
			ready: true,
			available: true,
			preferencesOpen: false,
		});
	});

	it.each(['granted', 'denied'] as const)('persists and commits a %s choice', (choice) => {
		const harness = createHarness({ marker: '1' });
		harness.store.init();
		harness.removePreferencesMarker.mockClear();

		harness.store[choice === 'granted' ? 'grant' : 'deny']();

		expect(harness.write).toHaveBeenCalledOnce();
		expect(harness.write).toHaveBeenCalledWith(choice);
		expect(harness.stored()).toBe(choice);
		expect(harness.removePreferencesMarker).toHaveBeenCalledOnce();
		expect(harness.marker()).toBeNull();
		expect(get(harness.store)).toEqual({
			choice,
			ready: true,
			available: true,
			preferencesOpen: false,
		});
	});

	it.each(['granted', 'denied'] as const)('restores a durable %s choice', (choice) => {
		const { store } = createHarness({ stored: choice });

		store.init();

		expect(get(store)).toEqual({
			choice,
			ready: true,
			available: true,
			preferencesOpen: false,
		});
	});

	it('synchronizes a denial across initialized tabs and unsubscribes on teardown', () => {
		const harness = createHarness({ stored: 'granted' });
		const firstTab = harness.store;
		const secondTab = harness.freshStore();
		const stopFirst = firstTab.init();
		const stopSecond = secondTab.init();

		expect(get(firstTab).choice).toBe('granted');
		expect(get(secondTab).choice).toBe('granted');
		expect(harness.listen).toHaveBeenCalledTimes(2);

		firstTab.deny();
		expect(get(firstTab).choice).toBe('denied');
		expect(get(secondTab).choice).toBe('granted');

		harness.emitStoredChange('denied');
		expect(get(secondTab)).toMatchObject({
			choice: 'denied',
			available: true,
			preferencesOpen: false,
		});

		stopSecond();
		harness.emitStoredChange('granted');
		expect(get(secondTab).choice).toBe('denied');
		stopFirst();
	});

	it.each([null, '', 'unexpected'])(
		'persists a denial after an external removal or invalid durable value %j',
		(next) => {
			const harness = createHarness({ stored: 'granted' });
			harness.store.init();

			harness.emitStoredChange(next);

			expect(harness.write).toHaveBeenCalledWith('denied');
			expect(harness.stored()).toBe('denied');
			expect(get(harness.store)).toMatchObject({
				choice: 'denied',
				available: true,
			});

			const freshStore = harness.freshStore();
			freshStore.init();
			expect(get(freshStore)).toMatchObject({
				choice: 'denied',
				available: true,
			});
		},
	);

	it('updates the visible choice without closing preferences when another tab grants consent', () => {
		const harness = createHarness({ stored: 'denied' });
		harness.store.init();
		harness.store.openPreferences();

		harness.emitStoredChange('granted');

		expect(get(harness.store)).toMatchObject({
			choice: 'granted',
			available: true,
			preferencesOpen: true,
		});
	});

	it('shows denial without closing preferences when another tab removes consent', () => {
		const harness = createHarness({ stored: 'granted' });
		harness.store.init();
		harness.store.openPreferences();

		harness.emitStoredChange(null);

		expect(get(harness.store)).toMatchObject({
			choice: 'denied',
			available: true,
			preferencesOpen: true,
		});
	});

	it('uses the denial safety marker when an external removal cannot persist denial', () => {
		const harness = createHarness({ stored: 'granted' });
		harness.store.init();
		harness.setFailures({ write: true });

		harness.emitStoredChange(null);

		expect(harness.marker()).toBeNull();
		expect(harness.safetyMarker()).toBe('1');
		expect(get(harness.store)).toMatchObject({
			choice: 'denied',
			available: true,
		});

		const freshStore = harness.freshStore();
		freshStore.init();
		expect(get(freshStore)).toMatchObject({
			choice: 'denied',
			available: true,
			preferencesOpen: false,
		});
	});

	it('fails unavailable when cross-tab synchronization cannot be installed', () => {
		const harness = createHarness({ stored: 'granted', listenThrows: true });

		harness.store.init();

		expect(get(harness.store)).toEqual({
			choice: 'unknown',
			ready: true,
			available: false,
			preferencesOpen: false,
		});
	});

	it('keeps and normalizes a renderable marker until the restored preferences close', () => {
		const harness = createHarness({ stored: 'denied', marker: '1' });

		harness.store.init();

		expect(harness.removePreferencesMarker).not.toHaveBeenCalled();
		expect(harness.writePreferencesMarker).toHaveBeenCalledWith('denied');
		expect(harness.marker()).toBe('denied');
		expect(get(harness.store)).toEqual({
			choice: 'denied',
			ready: true,
			available: true,
			preferencesOpen: true,
		});

		harness.store.deny();
		expect(harness.removePreferencesMarker).toHaveBeenCalledOnce();
		expect(harness.marker()).toBeNull();
	});

	it.each(['', '0', 'true', 'yes'])('clears non-matching session marker value %j', (marker) => {
		const harness = createHarness({ stored: 'denied', marker });

		harness.store.init();

		expect(harness.removePreferencesMarker).toHaveBeenCalledOnce();
		expect(harness.marker()).toBeNull();
		expect(get(harness.store)).toEqual({
			choice: 'denied',
			ready: true,
			available: true,
			preferencesOpen: false,
		});
	});

	it('preserves a granted choice while opening preferences across the requested reload', () => {
		const harness = createHarness({ stored: 'granted' });
		harness.store.init();

		harness.store.openPreferences();

		expect(harness.writePreferencesMarker).toHaveBeenCalledOnce();
		expect(harness.writePreferencesMarker).toHaveBeenCalledWith('granted');
		expect(harness.remove).toHaveBeenCalledOnce();
		expect(harness.stored()).toBeNull();
		expect(harness.marker()).toBe('granted');
		expect(get(harness.store)).toEqual({
			choice: 'granted',
			ready: true,
			available: true,
			preferencesOpen: true,
		});
		expect(harness.reload).toHaveBeenCalledOnce();

		const freshStore = harness.freshStore();
		freshStore.init();
		expect(get(freshStore)).toEqual({
			choice: 'granted',
			ready: true,
			available: true,
			preferencesOpen: true,
		});
		expect(harness.marker()).toBe('granted');

		const secondReload = harness.freshStore();
		secondReload.init();
		expect(get(secondReload)).toEqual({
			choice: 'granted',
			ready: true,
			available: true,
			preferencesOpen: true,
		});
		expect(harness.marker()).toBe('granted');
	});

	it('keeps a prior denial fail-closed across consecutive reloads in hidden-banner mode', () => {
		const harness = createHarness({ stored: null, marker: 'denied' });

		const firstReload = harness.freshStore();
		firstReload.init();
		const secondReload = harness.freshStore();
		secondReload.init();

		expect(harness.marker()).toBe('denied');
		expect(get(secondReload)).toEqual({
			choice: 'denied',
			ready: true,
			available: true,
			preferencesOpen: true,
		});
		expect(
			getAnalyticsPolicy({ enabled: true, showBanner: false }, get(secondReload)).canTrack,
		).toBe(false);
	});

	it('updates the open marker when another tab changes the visible choice', () => {
		const harness = createHarness({ stored: 'denied' });
		harness.store.init();
		harness.store.openPreferences();

		harness.emitStoredChange('granted');

		expect(harness.marker()).toBe('granted');
		const reloadedStore = harness.freshStore();
		reloadedStore.init();
		expect(get(reloadedStore)).toMatchObject({
			choice: 'granted',
			available: true,
			preferencesOpen: true,
		});
	});

	it('requests focus for marker restoration and every explicit preferences open', () => {
		const harness = createHarness({ stored: 'denied', marker: 'denied' });

		expect(get(harness.store.preferencesFocusRequests)).toBe(0);
		harness.store.init();
		expect(get(harness.store.preferencesFocusRequests)).toBe(1);

		harness.store.openPreferences();
		expect(get(harness.store.preferencesFocusRequests)).toBe(2);
		harness.store.openPreferences();
		expect(get(harness.store.preferencesFocusRequests)).toBe(3);
	});

	it.each(['denied', 'unknown'] as const)('opens preferences from a %s choice without reloading', (choice) => {
		const harness = createHarness({ stored: choice === 'denied' ? 'denied' : null });
		harness.store.init();

		harness.store.openPreferences();

		expect(harness.writePreferencesMarker).toHaveBeenCalledOnce();
		expect(harness.writePreferencesMarker).toHaveBeenCalledWith(choice);
		expect(harness.remove).toHaveBeenCalledOnce();
		expect(harness.marker()).toBe(choice);
		expect(get(harness.store)).toEqual({
			choice,
			ready: true,
			available: true,
			preferencesOpen: true,
		});
		expect(harness.reload).not.toHaveBeenCalled();
	});

	it('fails unavailable when durable storage cannot be read', () => {
		const harness = createHarness({ stored: 'granted', marker: '1', readThrows: true });

		expect(() => harness.store.init()).not.toThrow();
		expect(get(harness.store)).toEqual({
			choice: 'unknown',
			ready: true,
			available: false,
			preferencesOpen: false,
		});
		expect(harness.readPreferencesMarker).not.toHaveBeenCalled();
	});

	it('fails unavailable when the preferences marker cannot be read', () => {
		const harness = createHarness({ stored: 'granted', markerReadThrows: true });

		expect(() => harness.store.init()).not.toThrow();
		expect(get(harness.store)).toEqual({
			choice: 'unknown',
			ready: true,
			available: false,
			preferencesOpen: false,
		});
	});

	it('keeps a failed grant write in memory only and a fresh load is unknown', () => {
		const harness = createHarness({ writeThrows: true });
		harness.store.init();

		expect(() => harness.store.grant()).not.toThrow();
		expect(get(harness.store)).toEqual({
			choice: 'granted',
			ready: true,
			available: true,
			preferencesOpen: false,
		});
		expect(harness.stored()).toBeNull();

		const freshStore = harness.freshStore();
		freshStore.init();
		expect(get(freshStore)).toEqual({
			choice: 'unknown',
			ready: true,
			available: true,
			preferencesOpen: false,
		});
	});

	it('keeps the safety marker when a denial and its retry cannot be written', () => {
		const harness = createHarness({ stored: 'granted', marker: '1', writeThrows: true });
		harness.store.init();
		harness.removePreferencesMarker.mockClear();

		expect(() => harness.store.deny()).not.toThrow();

		expect(harness.write).toHaveBeenCalledTimes(2);
		expect(harness.write).toHaveBeenNthCalledWith(1, 'denied');
		expect(harness.write).toHaveBeenNthCalledWith(2, 'denied');
		expect(harness.writeSafetyMarker).toHaveBeenCalledOnce();
		expect(harness.remove).toHaveBeenCalledOnce();
		expect(harness.removePreferencesMarker).toHaveBeenCalledOnce();
		expect(harness.stored()).toBeNull();
		expect(harness.marker()).toBeNull();
		expect(harness.safetyMarker()).toBe('1');
		expect(get(harness.store)).toEqual({
			choice: 'denied',
			ready: true,
			available: true,
			preferencesOpen: false,
		});

		const freshStore = harness.freshStore();
		freshStore.init();
		expect(get(freshStore)).toEqual({
			choice: 'denied',
			ready: true,
			available: true,
			preferencesOpen: false,
		});
	});

	it('retries denial after removing a stale grant and clears the marker only after success', () => {
		const harness = createHarness({ stored: 'granted', marker: '1', writeFailures: 1 });
		harness.store.init();
		harness.removePreferencesMarker.mockClear();

		harness.store.deny();

		expect(harness.write).toHaveBeenCalledTimes(2);
		expect(harness.remove).toHaveBeenCalledOnce();
		expect(harness.stored()).toBe('denied');
		expect(harness.removePreferencesMarker).toHaveBeenCalledOnce();
		expect(harness.marker()).toBeNull();
		expect(harness.safetyMarker()).toBeNull();
		expect(get(harness.store)).toEqual({
			choice: 'denied',
			ready: true,
			available: true,
			preferencesOpen: false,
		});

		const freshStore = harness.freshStore();
		freshStore.init();
		expect(get(freshStore)).toEqual({
			choice: 'denied',
			ready: true,
			available: true,
			preferencesOpen: false,
		});
	});

	it('uses the marker when a stale grant cannot be removed after denial persistence fails', () => {
		const harness = createHarness({ stored: 'granted', writeThrows: true, removeThrows: true });
		harness.store.init();

		harness.store.deny();

		expect(harness.write).toHaveBeenCalledOnce();
		expect(harness.writeSafetyMarker).toHaveBeenCalledOnce();
		expect(harness.remove).toHaveBeenCalledOnce();
		expect(harness.stored()).toBe('granted');
		expect(harness.marker()).toBeNull();
		expect(harness.safetyMarker()).toBe('1');
		expect(get(harness.store)).toEqual({
			choice: 'denied',
			ready: true,
			available: true,
			preferencesOpen: false,
		});

		const freshStore = harness.freshStore();
		freshStore.init();
		expect(get(freshStore)).toEqual({
			choice: 'denied',
			ready: true,
			available: true,
			preferencesOpen: false,
		});
	});

	it('moves failed-denial safety off the preferences marker before closing', () => {
		const harness = createHarness({ stored: 'granted', writeThrows: true, removeThrows: true });
		harness.store.init();

		harness.store.deny();

		expect(harness.writeSafetyMarker).toHaveBeenCalledOnce();
		expect(harness.safetyMarker()).toBe('1');
		expect(harness.removePreferencesMarker).toHaveBeenCalledOnce();
		expect(harness.marker()).toBeNull();
		expect(get(harness.store)).toMatchObject({
			choice: 'denied',
			available: true,
			preferencesOpen: false,
		});
	});

	it('restores denial safety without reopening preferences or restoring a stale grant', () => {
		const harness = createHarness({ stored: 'granted', safetyMarker: '1' });

		harness.store.init();

		expect(harness.safetyMarker()).toBe('1');
		expect(get(harness.store)).toEqual({
			choice: 'denied',
			ready: true,
			available: true,
			preferencesOpen: false,
		});
	});

	it('falls unavailable when denial, marker, and stale-grant removal all fail', () => {
		const harness = createHarness({
			stored: 'granted',
			writeThrows: true,
			removeThrows: true,
			markerWriteThrows: true,
		});
		harness.store.init();

		harness.store.deny();

		expect(harness.stored()).toBe('granted');
		expect(harness.marker()).toBeNull();
		expect(harness.removePreferencesMarker).toHaveBeenCalledOnce();
		expect(get(harness.store)).toEqual({
			choice: 'denied',
			ready: true,
			available: false,
			preferencesOpen: false,
		});

		harness.store.init();
		expect(get(harness.store)).toEqual({
			choice: 'denied',
			ready: true,
			available: false,
			preferencesOpen: false,
		});

		// If every persistence channel fails and a later fresh runtime becomes healthy with the
		// untouched grant but no denial record, no software can infer the missing choice. This test
		// intentionally claims only the in-memory unavailable state while persistence is impossible.
	});

	it('falls unavailable when only stale-grant removal succeeds after all safety writes fail', () => {
		const harness = createHarness({
			stored: 'granted',
			writeThrows: true,
			markerWriteThrows: true,
		});
		harness.store.init();

		harness.store.deny();

		expect(harness.write).toHaveBeenCalledTimes(2);
		expect(harness.stored()).toBeNull();
		expect(harness.marker()).toBeNull();
		expect(get(harness.store)).toEqual({
			choice: 'denied',
			ready: true,
			available: false,
			preferencesOpen: false,
		});
	});

	it('uses a durable retry when the safety marker cannot be written', () => {
		const harness = createHarness({
			stored: 'granted',
			writeFailures: 1,
			markerWriteThrows: true,
		});
		harness.store.init();

		harness.store.deny();

		expect(harness.write).toHaveBeenCalledTimes(2);
		expect(harness.stored()).toBe('denied');
		expect(harness.marker()).toBeNull();
		expect(get(harness.store)).toEqual({
			choice: 'denied',
			ready: true,
			available: true,
			preferencesOpen: false,
		});

		const freshStore = harness.freshStore();
		freshStore.init();
		expect(get(freshStore).choice).toBe('denied');
	});

	it('keeps a fresh store unavailable when all denial channels and durable health fail after init', () => {
		const harness = createHarness({ stored: 'granted' });
		harness.store.init();
		expect(get(harness.store).choice).toBe('granted');

		harness.setFailures({ probe: true, write: true, remove: true, markerWrite: true });
		harness.store.deny();

		const freshStore = harness.freshStore();
		freshStore.init();

		expect(harness.probeDurableStorage).toHaveBeenCalledTimes(2);
		expect(harness.read).toHaveBeenCalledOnce();
		expect(harness.readPreferencesMarker).toHaveBeenCalledOnce();
		expect(harness.stored()).toBe('granted');
		expect(get(freshStore)).toEqual({
			choice: 'unknown',
			ready: true,
			available: false,
			preferencesOpen: false,
		});
	});

	it('keeps a fresh store unavailable while writes and durable health fail after grant removal', () => {
		const harness = createHarness({ stored: 'granted' });
		harness.store.init();
		expect(get(harness.store).choice).toBe('granted');

		harness.setFailures({ probe: true, write: true, remove: false, markerWrite: true });
		harness.store.deny();
		expect(harness.stored()).toBeNull();

		const freshStore = harness.freshStore();
		freshStore.init();

		expect(harness.probeDurableStorage).toHaveBeenCalledTimes(2);
		expect(harness.read).toHaveBeenCalledOnce();
		expect(harness.readPreferencesMarker).toHaveBeenCalledOnce();
		expect(get(freshStore)).toEqual({
			choice: 'unknown',
			ready: true,
			available: false,
			preferencesOpen: false,
		});
	});

	it('replaces a surviving grant with denied before reloading when removal fails', () => {
		const harness = createHarness({ stored: 'granted', removeThrows: true });
		harness.store.init();

		expect(() => harness.store.openPreferences()).not.toThrow();

		expect(harness.remove).toHaveBeenCalledOnce();
		expect(harness.write).toHaveBeenCalledOnce();
		expect(harness.write).toHaveBeenCalledWith('denied');
		expect(harness.stored()).toBe('denied');
		expect(harness.marker()).toBe('granted');
		expect(get(harness.store)).toEqual({
			choice: 'granted',
			ready: true,
			available: true,
			preferencesOpen: true,
		});
		expect(harness.reload).toHaveBeenCalledOnce();

		const freshStore = harness.freshStore();
		freshStore.init();
		expect(get(freshStore)).toEqual({
			choice: 'granted',
			ready: true,
			available: true,
			preferencesOpen: true,
		});
	});

	it('does not reload when removal and denied fallback both fail', () => {
		const harness = createHarness({
			stored: 'granted',
			removeThrows: true,
			writeThrows: true,
		});
		harness.store.init();

		expect(() => harness.store.openPreferences()).not.toThrow();

		expect(harness.remove).toHaveBeenCalledOnce();
		expect(harness.write).toHaveBeenCalledOnce();
		expect(harness.write).toHaveBeenCalledWith('denied');
		expect(harness.stored()).toBe('granted');
		expect(harness.marker()).toBe('granted');
		expect(harness.safetyMarker()).toBe('1');
		expect(get(harness.store)).toEqual({
			choice: 'granted',
			ready: true,
			available: true,
			preferencesOpen: true,
		});
		expect(harness.reload).not.toHaveBeenCalled();
	});

	it('persists denial and does not reload a prior grant when the session marker write fails', () => {
		const harness = createHarness({ stored: 'granted', markerWriteThrows: true });
		harness.store.init();

		expect(() => harness.store.openPreferences()).not.toThrow();

		expect(harness.remove).toHaveBeenCalledOnce();
		expect(harness.write).toHaveBeenCalledWith('denied');
		expect(harness.stored()).toBe('denied');
		expect(harness.marker()).toBeNull();
		expect(get(harness.store)).toEqual({
			choice: 'granted',
			ready: true,
			available: true,
			preferencesOpen: true,
		});
		expect(harness.reload).not.toHaveBeenCalled();

		const freshStore = harness.freshStore();
		freshStore.init();
		expect(get(freshStore)).toEqual({
			choice: 'denied',
			ready: true,
			available: true,
			preferencesOpen: false,
		});
	});

	it('keeps an operational click visible when preferences cannot write either safety signal', () => {
		const harness = createHarness({
			stored: 'granted',
			writeThrows: true,
			markerWriteThrows: true,
		});
		harness.store.init();

		harness.store.openPreferences();

		expect(harness.stored()).toBeNull();
		expect(get(harness.store)).toEqual({
			choice: 'granted',
			ready: true,
			available: true,
			preferencesOpen: true,
		});
		expect(get(harness.store.preferencesFocusRequests)).toBe(1);
		expect(harness.reload).not.toHaveBeenCalled();
	});

	it('recovers from transient open failures after a later grant persists', () => {
		const harness = createHarness({
			stored: 'granted',
			writeThrows: true,
			markerWriteThrows: true,
		});
		harness.store.init();
		harness.store.openPreferences();
		harness.setFailures({ write: false, markerWrite: false, safetyWrite: false });

		harness.store.grant();
		harness.store.init();

		expect(harness.stored()).toBe('granted');
		expect(get(harness.store)).toEqual({
			choice: 'granted',
			ready: true,
			available: true,
			preferencesOpen: false,
		});
	});

	it('recovers from transient open failures when a repeated open persists its marker', () => {
		const harness = createHarness({
			stored: 'granted',
			writeThrows: true,
			markerWriteThrows: true,
		});
		harness.store.init();
		harness.store.openPreferences();
		harness.setFailures({ markerWrite: false });

		harness.store.openPreferences();
		harness.store.init();

		expect(harness.marker()).toBe('granted');
		expect(get(harness.store)).toEqual({
			choice: 'granted',
			ready: true,
			available: true,
			preferencesOpen: true,
		});
	});

	it('keeps preferences open when a requested reload throws', () => {
		const harness = createHarness({ stored: 'granted', reloadThrows: true });
		harness.store.init();

		expect(() => harness.store.openPreferences()).not.toThrow();

		expect(get(harness.store)).toEqual({
			choice: 'granted',
			ready: true,
			available: true,
			preferencesOpen: true,
		});
		expect(harness.reload).toHaveBeenCalledOnce();
	});

	it.each(['granted', 'denied'] as const)(
		'closes preferences after %s even when marker cleanup fails',
		(choice) => {
			const harness = createHarness({ marker: '1', markerRemoveThrows: true });
			harness.store.init();

			expect(() => harness.store[choice === 'granted' ? 'grant' : 'deny']()).not.toThrow();

			expect(harness.stored()).toBe(choice);
			expect(harness.marker()).toBe('unknown');
			expect(get(harness.store)).toEqual({
				choice,
				ready: true,
				available: true,
				preferencesOpen: false,
			});
		},
	);

	it.each(['dev.metrics.example', 'localhost', 'slice-35.vercel.app', 'www.metrics.example', 'METRICS.EXAMPLE'])(
		'remains unavailable and unknown on non-production hostname %s',
		(hostname) => {
			const harness = createHarness({ hostname, stored: 'granted', marker: '1' });

			harness.store.init();

			expect(get(harness.store)).toEqual({
				choice: 'unknown',
				ready: true,
				available: false,
				preferencesOpen: false,
			});
			expect(harness.probeDurableStorage).not.toHaveBeenCalled();
			expect(harness.read).not.toHaveBeenCalled();
			expect(harness.readPreferencesMarker).not.toHaveBeenCalled();
		},
	);

	it('uses exact versioned durable and session keys', () => {
		expect(ANALYTICS_CONSENT_KEY).toBe('test:analytics-consent:v1');
		expect(ANALYTICS_PREFERENCES_OPEN_KEY).toBe('test:analytics-preferences-open:v1');
		expect(ANALYTICS_DENIAL_SAFETY_KEY).toBe('test:analytics-denial-safety:v1');
	});

	it('uses a separate exact key to set/remove-test browser durable storage', () => {
		const storage = {
			setItem: vi.fn(),
			removeItem: vi.fn(),
		};

		expect(ANALYTICS_STORAGE_PROBE_KEY).toBe('test:analytics-storage-probe:v1');
		probeDurableAnalyticsStorage(storage, ANALYTICS_STORAGE_PROBE_KEY);

		expect(storage.setItem).toHaveBeenCalledOnce();
		expect(storage.setItem).toHaveBeenCalledWith('test:analytics-storage-probe:v1', '1');
		expect(storage.removeItem).toHaveBeenCalledOnce();
		expect(storage.removeItem).toHaveBeenCalledWith('test:analytics-storage-probe:v1');
		expect(storage.setItem).not.toHaveBeenCalledWith(ANALYTICS_CONSENT_KEY, expect.anything());
	});
});
