import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	MAX_VITALS_SAMPLES,
	parseVitalsBeacon,
	parseVitalsSample,
	type VitalsMetric,
	type VitalsSample,
	type WebVitalsModule,
} from './vitals';

const valid: VitalsSample = {
	name: 'LCP',
	value: 1234.5,
	id: 'v3-1718900000000-1234567890123',
	rating: 'good',
	navType: 'navigate',
	path: '/lines/11',
	conn: '4g',
};

describe('parseVitalsSample', () => {
	it('accepts a well-formed sample and drops an absent conn', () => {
		expect(parseVitalsSample(valid)).toEqual(valid);
		const { conn: _conn, ...rest } = valid;
		expect(parseVitalsSample(rest)).toEqual(rest);
	});

	it.each([
		['an unknown metric', { name: 'FID' }],
		['an unknown rating', { rating: 'meh' }],
		['an unknown navigation type', { navType: 'teleport' }],
		['a non-finite value', { value: Number.NaN }],
		['a negative value', { value: -1 }],
		['a string value', { value: '5' }],
		['a relative path', { path: 'route/11' }],
		['an oversized path', { path: `/${'x'.repeat(300)}` }],
		['an empty id', { id: '' }],
		['an oversized id', { id: 'x'.repeat(200) }],
	])('rejects %s', (_case, patch) => {
		expect(parseVitalsSample({ ...valid, ...patch })).toBeNull();
	});

	it('rejects non-objects', () => {
		for (const input of [null, 'LCP', 42]) expect(parseVitalsSample(input)).toBeNull();
	});
});

describe('parseVitalsBeacon', () => {
	it('keeps the valid samples of a well-formed beacon', () => {
		expect(parseVitalsBeacon({ samples: [valid, { name: 'FID' }, 7] })).toEqual([valid]);
	});

	it('rejects a malformed, empty or oversized beacon', () => {
		const many = Array.from({ length: MAX_VITALS_SAMPLES + 1 }, (_, i) => ({ ...valid, id: `${i}` }));
		for (const input of [null, {}, { samples: 'nope' }, { samples: [] }, { samples: many }]) {
			expect(parseVitalsBeacon(input)).toBeNull();
		}
	});
});

type Report = (metric: VitalsMetric) => void;

function fakeWebVitals() {
	const reports: Report[] = [];
	const register = (report: Report) => {
		reports.push(report);
	};
	const module: WebVitalsModule = {
		onCLS: register,
		onFCP: register,
		onINP: register,
		onLCP: register,
		onTTFB: register,
	};
	const emit = (metric: Partial<VitalsMetric>) => {
		for (const report of reports) {
			report({ name: 'LCP', value: 1, id: 'm-1', rating: 'good', navigationType: 'navigate', ...metric });
		}
	};
	return { module, emit, registered: () => reports.length };
}

function browser({ sendBeacon }: { sendBeacon?: (url: string, body: Blob) => boolean } = {}) {
	const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
	const win = Object.assign(new EventTarget(), { location: { pathname: '/lines/11' } });
	const fetch = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
	vi.stubGlobal('document', doc);
	vi.stubGlobal('window', win);
	vi.stubGlobal('navigator', { sendBeacon, connection: { effectiveType: '4g' } });
	vi.stubGlobal('fetch', fetch);
	const hide = () => {
		doc.visibilityState = 'hidden';
		doc.dispatchEvent(new Event('visibilitychange'));
	};
	return { hide, pagehide: () => win.dispatchEvent(new Event('pagehide')), fetch };
}

async function freshStartVitals() {
	vi.resetModules();
	return (await import('./vitals')).startVitals;
}

async function beaconSamples(body: Blob | string): Promise<VitalsSample[]> {
	const text = typeof body === 'string' ? body : await body.text();
	return parseVitalsBeacon(JSON.parse(text)) ?? [];
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('startVitals', () => {
	it('does nothing without a browser', async () => {
		const startVitals = await freshStartVitals();
		const load = vi.fn();
		startVitals({ endpoint: '/api/vitals', load });
		expect(load).not.toHaveBeenCalled();
	});

	it('starts once and sends one beacon of parseable samples when the page hides', async () => {
		const sendBeacon = vi.fn((_url: string, _body: Blob) => true);
		const page = browser({ sendBeacon });
		const vitals = fakeWebVitals();
		const startVitals = await freshStartVitals();

		startVitals({ endpoint: '/api/vitals', load: async () => vitals.module });
		startVitals({ endpoint: '/api/vitals', load: async () => vitals.module });
		await vi.waitFor(() => expect(vitals.registered()).toBe(5));

		vitals.emit({ name: 'LCP', id: 'lcp-1', value: 900 });
		vitals.emit({ name: 'LCP', id: 'lcp-1', value: 1200 });
		page.hide();
		page.pagehide();

		expect(sendBeacon).toHaveBeenCalledOnce();
		const [url, body] = sendBeacon.mock.calls[0]!;
		expect(url).toBe('/api/vitals');
		const samples = await beaconSamples(body);
		expect(samples.filter((sample) => sample.id === 'lcp-1')).toEqual([
			expect.objectContaining({ value: 1200, path: '/lines/11', conn: '4g' }),
		]);
		expect(page.fetch).not.toHaveBeenCalled();
	});

	it(`keeps at most ${MAX_VITALS_SAMPLES} samples`, async () => {
		const sendBeacon = vi.fn((_url: string, _body: Blob) => true);
		const page = browser({ sendBeacon });
		const vitals = fakeWebVitals();
		const startVitals = await freshStartVitals();

		startVitals({ endpoint: '/api/vitals', load: async () => vitals.module });
		await vi.waitFor(() => expect(vitals.registered()).toBe(5));
		for (let i = 0; i <= MAX_VITALS_SAMPLES; i += 1) vitals.emit({ id: `id-${i}` });
		page.hide();

		const ids = new Set((await beaconSamples(sendBeacon.mock.calls[0]![1])).map((s) => s.id));
		expect(ids.size).toBe(MAX_VITALS_SAMPLES);
	});

	it('falls back to a keepalive fetch when the beacon is refused', async () => {
		const page = browser({ sendBeacon: () => false });
		const vitals = fakeWebVitals();
		const startVitals = await freshStartVitals();

		startVitals({ endpoint: '/api/vitals', load: async () => vitals.module });
		await vi.waitFor(() => expect(vitals.registered()).toBe(5));
		vitals.emit({});
		page.hide();

		expect(page.fetch).toHaveBeenCalledWith(
			'/api/vitals',
			expect.objectContaining({ method: 'POST', keepalive: true }),
		);
	});

	it('stays quiet when the loader throws', async () => {
		const page = browser({ sendBeacon: vi.fn(() => true) });
		const startVitals = await freshStartVitals();

		const load = (): Promise<WebVitalsModule> => {
			throw new Error('offline');
		};
		const dispose = startVitals({ endpoint: '/api/vitals', load });
		await new Promise((resolve) => setTimeout(resolve));
		page.hide();

		expect(page.fetch).not.toHaveBeenCalled();
		expect(() => dispose()).not.toThrow();
	});
});
