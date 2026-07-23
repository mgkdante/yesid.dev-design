import { describe, expect, it, vi } from 'vitest';
import {
	createAnalyticsClient,
	createPathnamePageviewTracker,
	sanitizeAnalyticsReferrer,
	sanitizeAnalyticsUrl,
} from './client';
import { defineAnalyticsPreset } from './config';
import { sendPlausibleEvent, type PlausibleTransport } from './plausible';

const ANALYTICS_EVENTS = [
	'event_alpha',
	'event_beta',
	'event_gamma',
	'event_delta',
] as const;
type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];
const PRESET = defineAnalyticsPreset({
	domain: 'metrics.example',
	events: ANALYTICS_EVENTS,
	storageKeys: {
		consent: 'test:analytics-consent:v1',
		preferencesOpen: 'test:analytics-preferences-open:v1',
		denialSafety: 'test:analytics-denial-safety:v1',
		storageProbe: 'test:analytics-storage-probe:v1',
	},
});

function createTransport(options?: {
	send?: PlausibleTransport['sendPlausibleEvent'];
}): PlausibleTransport {
	return {
		sendPlausibleEvent: options?.send ?? vi.fn(async () => true),
	};
}

function createClient(options?: {
	canTrack?: () => boolean;
	transport?: PlausibleTransport;
	loadTransport?: () => Promise<PlausibleTransport>;
	referrer?: string;
}) {
	const transport = options?.transport ?? createTransport();
	const loadTransport = vi.fn(
		options?.loadTransport ?? (async () => transport),
	);
	const client = createAnalyticsClient(PRESET, {
		loadTransport,
		canTrack: options?.canTrack ?? (() => true),
		getReferrer: () => options?.referrer ?? '',
	});

	return { client, loadTransport, transport };
}

describe('sanitizeAnalyticsUrl', () => {
	it('preserves localized paths and removes the hash', () => {
		const url = new URL('https://metrics.example/fr/services/data-engineering#contact');

		expect(sanitizeAnalyticsUrl(url)).toBe(
			'https://metrics.example/fr/services/data-engineering',
		);
	});

	it('keeps only non-empty acquisition values in canonical key order', () => {
		const url = new URL(
			'https://metrics.example/es/work/example' +
				'?session_id=secret' +
				'&utm_term=rail' +
				'&utm_source=google' +
				'&utm_source=' +
				'&ref=partner' +
				'&source=newsletter' +
				'&utm_medium=cpc' +
				'&utm_campaign=summer' +
				'&utm_content=hero' +
				'&utm_term=montreal' +
				'&project=private' +
				'#internal-state',
		);

		expect(sanitizeAnalyticsUrl(url)).toBe(
			'https://metrics.example/es/work/example' +
				'?utm_source=google' +
				'&utm_medium=cpc' +
				'&utm_campaign=summer' +
				'&utm_content=hero' +
				'&utm_term=rail' +
				'&utm_term=montreal' +
				'&ref=partner' +
				'&source=newsletter',
		);
	});

	it('drops PII-shaped and unbounded acquisition values', () => {
		const url = new URL(
			'https://metrics.example/contact' +
				'?utm_source=linkedin' +
				'&utm_content=user@example.com' +
				'&utm_term=5145551234' +
				'&utm_campaign=514-555-1234' +
				'&ref=https%3A%2F%2Fexample.com%2Fprivate' +
				'&source=' + 'a'.repeat(65),
		);

		expect(sanitizeAnalyticsUrl(url)).toBe(
			'https://metrics.example/contact?utm_source=linkedin',
		);
	});
});

describe('sanitizeAnalyticsReferrer', () => {
	it('keeps only the HTTP origin and drops path, query, credentials, and invalid schemes', () => {
		expect(
			sanitizeAnalyticsReferrer(
				'https://user:secret@www.google.com/search?q=user@example.com#private',
			),
		).toBe('https://www.google.com/');
		expect(sanitizeAnalyticsReferrer('mailto:user@example.com')).toBeUndefined();
		expect(sanitizeAnalyticsReferrer('not a URL')).toBeUndefined();
		expect(sanitizeAnalyticsReferrer('')).toBeUndefined();
	});
});

describe('createPathnamePageviewTracker', () => {
	it('deduplicates successful pageviews by pathname while allowing a changed pathname', async () => {
		const send = vi.fn(async (_url: URL) => true);
		const track = createPathnamePageviewTracker(send);

		expect(await track(new URL('https://metrics.example/fr/work?utm_source=one'))).toBe(true);
		expect(
			await track(new URL('https://metrics.example/fr/work?utm_source=two#details')),
		).toBe(false);
		expect(await track(new URL('https://metrics.example/fr/contact?utm_source=two'))).toBe(true);

		expect(send).toHaveBeenCalledTimes(2);
		expect(send.mock.calls.map(([url]) => url.pathname)).toEqual(['/fr/work', '/fr/contact']);
	});

	it('keeps a pathname retryable until its send succeeds', async () => {
		let succeeds = false;
		const send = vi.fn(async () => succeeds);
		const track = createPathnamePageviewTracker(send);
		const url = new URL('https://metrics.example/contact?ref=portfolio');

		expect(await track(url)).toBe(false);

		succeeds = true;
		expect(await track(new URL('https://metrics.example/contact?ref=footer#form'))).toBe(true);
		expect(send).toHaveBeenCalledTimes(2);
	});

	it('serializes concurrent pageviews in navigation order', async () => {
		let resolveFirst!: (sent: boolean) => void;
		const firstSend = new Promise<boolean>((resolve) => {
			resolveFirst = resolve;
		});
		const send = vi.fn((url: URL) =>
			url.pathname === '/projects' ? firstSend : Promise.resolve(true),
		);
		const track = createPathnamePageviewTracker(send);

		const projects = track(new URL('https://metrics.example/projects'));
		const contact = track(new URL('https://metrics.example/contact'));

		expect(send.mock.calls.map(([url]) => url.pathname)).toEqual(['/projects']);
		resolveFirst(true);

		await expect(projects).resolves.toBe(true);
		await expect(contact).resolves.toBe(true);
		expect(send.mock.calls.map(([url]) => url.pathname)).toEqual([
			'/projects',
			'/contact',
		]);
	});

	it('preserves A to B to A order when B is still pending', async () => {
		let resolveContact!: (sent: boolean) => void;
		const pendingContact = new Promise<boolean>((resolve) => {
			resolveContact = resolve;
		});
		const send = vi.fn((url: URL) =>
			url.pathname === '/contact' ? pendingContact : Promise.resolve(true),
		);
		const track = createPathnamePageviewTracker(send);
		const projectsUrl = new URL('https://metrics.example/projects');

		await expect(track(projectsUrl)).resolves.toBe(true);
		const contact = track(new URL('https://metrics.example/contact'));
		const projectsAgain = track(new URL('https://metrics.example/projects?ref=contact'));

		expect(send.mock.calls.map(([url]) => url.pathname)).toEqual([
			'/projects',
			'/contact',
		]);
		resolveContact(true);

		await expect(contact).resolves.toBe(true);
		await expect(projectsAgain).resolves.toBe(true);
		expect(send.mock.calls.map(([url]) => url.pathname)).toEqual([
			'/projects',
			'/contact',
			'/projects',
		]);
	});

	it('preserves A to B to A order when the first A is still pending', async () => {
		let resolveFirstProjects!: (sent: boolean) => void;
		const pendingFirstProjects = new Promise<boolean>((resolve) => {
			resolveFirstProjects = resolve;
		});
		let firstProjects = true;
		const send = vi.fn((url: URL) => {
			if (url.pathname === '/projects' && firstProjects) {
				firstProjects = false;
				return pendingFirstProjects;
			}
			return Promise.resolve(true);
		});
		const track = createPathnamePageviewTracker(send);

		const first = track(new URL('https://metrics.example/projects'));
		const second = track(new URL('https://metrics.example/contact'));
		const third = track(new URL('https://metrics.example/projects?ref=contact'));

		expect(send.mock.calls.map(([url]) => url.pathname)).toEqual(['/projects']);
		resolveFirstProjects(true);

		await expect(first).resolves.toBe(true);
		await expect(second).resolves.toBe(true);
		await expect(third).resolves.toBe(true);
		expect(send.mock.calls.map(([url]) => url.pathname)).toEqual([
			'/projects',
			'/contact',
			'/projects',
		]);
	});
});

describe('createAnalyticsClient', () => {
	it('keeps event names consumer-supplied and typed', () => {
		expect(ANALYTICS_EVENTS).toEqual([
			'event_alpha',
			'event_beta',
			'event_gamma',
			'event_delta',
		]);
	});

	it('enables only the exact production hostname', async () => {
		const { client, loadTransport, transport } = createClient();

		await client.trackEvent('event_beta', new URL('https://metrics.example/contact'));

		expect(loadTransport).toHaveBeenCalledOnce();
		expect(transport.sendPlausibleEvent).toHaveBeenCalledWith({
			name: 'event_beta',
			url: 'https://metrics.example/contact',
			domain: 'metrics.example',
		});
	});

	it.each([
		'https://www.metrics.example/contact',
		'https://dev.metrics.example/contact',
		'https://preview.example/contact',
		'http://localhost:5173/contact',
		'http://127.0.0.1:5173/contact',
		'http://[::1]:5173/contact',
	])('does not load the transport on disabled hostname %s', async (href) => {
		const { client, loadTransport } = createClient();

		await client.trackEvent('event_beta', new URL(href));

		expect(loadTransport).not.toHaveBeenCalled();
	});

	it('does not load before consent and can track the same pathname after consent', async () => {
		let consent = false;
		const { client, loadTransport, transport } = createClient({
			canTrack: () => consent,
		});
		const url = new URL('https://metrics.example/fr/contact');

		await client.trackPageview(url);
		expect(loadTransport).not.toHaveBeenCalled();

		consent = true;
		await client.trackPageview(url);

		expect(loadTransport).toHaveBeenCalledOnce();
		expect(transport.sendPlausibleEvent).toHaveBeenCalledWith({
			name: 'pageview',
			url: 'https://metrics.example/fr/contact',
			domain: 'metrics.example',
		});
	});

	it('blocks typed events before consent and after withdrawal', async () => {
		let consent = false;
		const { client, loadTransport, transport } = createClient({
			canTrack: () => consent,
		});
		const url = new URL(
			'https://metrics.example/projects/example?token=private&utm_source=portfolio',
		);

		await client.trackEvent('event_gamma', url);
		expect(loadTransport).not.toHaveBeenCalled();

		consent = true;
		await client.trackEvent('event_gamma', url);
		expect(transport.sendPlausibleEvent).toHaveBeenCalledWith({
			name: 'event_gamma',
			url: 'https://metrics.example/projects/example?utm_source=portfolio',
			domain: 'metrics.example',
		});

		consent = false;
		await client.trackEvent('event_delta', url);
		expect(transport.sendPlausibleEvent).toHaveBeenCalledTimes(1);
	});

	it('loads one controlled transport with no autonomous tracker surface', async () => {
		const send = vi.fn<PlausibleTransport['sendPlausibleEvent']>(async () => true);
		const transport = createTransport({ send });
		const { client, loadTransport } = createClient({ transport });

		await Promise.all([
			client.trackEvent('event_alpha', new URL('https://metrics.example/contact')),
			client.trackEvent('event_beta', new URL('https://metrics.example/contact')),
		]);

		expect(loadTransport).toHaveBeenCalledOnce();
		expect(send).toHaveBeenCalledTimes(2);
		expect(Object.keys(transport)).toEqual(['sendPlausibleEvent']);
	});

	it('sends sanitized pageviews and the typed custom events without properties', async () => {
		const send = vi.fn<PlausibleTransport['sendPlausibleEvent']>(async () => true);
		const transport = createTransport({ send });
		const { client } = createClient({
			transport,
			referrer: 'https://user:secret@www.google.com/search?q=user@example.com',
		});
		const eventNames: AnalyticsEventName[] = [...ANALYTICS_EVENTS];

		await client.trackPageview(
			new URL('https://metrics.example/fr/work/example?email=private&utm_source=portfolio#details'),
		);
		for (const eventName of eventNames) {
			await client.trackEvent(
				eventName,
				new URL('https://metrics.example/contact?token=private&ref=calendar#form'),
			);
		}

		expect(send.mock.calls.map(([payload]) => payload)).toEqual([
			{
				name: 'pageview',
				url: 'https://metrics.example/fr/work/example?utm_source=portfolio',
				domain: 'metrics.example',
				referrer: 'https://www.google.com/',
			},
			...eventNames.map((name) => ({
				name,
				url: 'https://metrics.example/contact?ref=calendar',
				domain: 'metrics.example',
				referrer: 'https://www.google.com/',
			})),
		]);
		for (const [payload] of send.mock.calls) {
			expect(payload).not.toHaveProperty('props');
		}
	});

	it('rechecks consent after a pending import before sending', async () => {
		let consent = true;
		let resolveTransport!: (transport: PlausibleTransport) => void;
		const pendingTransport = new Promise<PlausibleTransport>((resolve) => {
			resolveTransport = resolve;
		});
		const send = vi.fn<PlausibleTransport['sendPlausibleEvent']>(async () => true);
		const transport = createTransport({ send });
		const { client, loadTransport } = createClient({
			canTrack: () => consent,
			loadTransport: () => pendingTransport,
		});

		const request = client.trackEvent(
			'event_alpha',
			new URL('https://metrics.example/contact'),
		);
		expect(loadTransport).toHaveBeenCalledOnce();

		consent = false;
		resolveTransport(transport);
		await request;

		expect(send).not.toHaveBeenCalled();
	});

	it('retries a pageview canceled by consent changing during a pending import', async () => {
		let consent = true;
		let resolveTransport!: (transport: PlausibleTransport) => void;
		const pendingTransport = new Promise<PlausibleTransport>((resolve) => {
			resolveTransport = resolve;
		});
		const send = vi.fn<PlausibleTransport['sendPlausibleEvent']>(async () => true);
		const transport = createTransport({ send });
		const { client, loadTransport } = createClient({
			canTrack: () => consent,
			loadTransport: () => pendingTransport,
		});
		const firstUrl = new URL('https://metrics.example/projects?utm_source=portfolio');

		const firstRequest = client.trackPageview(firstUrl);
		expect(loadTransport).toHaveBeenCalledOnce();

		consent = false;
		resolveTransport(transport);
		await expect(firstRequest).resolves.toBe(false);
		expect(send).not.toHaveBeenCalled();

		consent = true;
		await expect(
			client.trackPageview(new URL('https://metrics.example/projects?ref=preferences')),
		).resolves.toBe(true);
		expect(loadTransport).toHaveBeenCalledOnce();
		expect(send).toHaveBeenCalledOnce();
		expect(send).toHaveBeenCalledWith({
			name: 'pageview',
			url: 'https://metrics.example/projects?ref=preferences',
			domain: 'metrics.example',
		});
	});

	it('keeps a pageview retryable after the controlled send fails', async () => {
		let fails = true;
		const send = vi.fn<PlausibleTransport['sendPlausibleEvent']>(async () => {
			if (fails) return false;
			return true;
		});
		const transport = createTransport({ send });
		const { client } = createClient({ transport });

		await expect(
			client.trackPageview(new URL('https://metrics.example/contact?ref=first')),
		).resolves.toBe(false);

		fails = false;
		await expect(
			client.trackPageview(new URL('https://metrics.example/contact?ref=retry')),
		).resolves.toBe(true);
		expect(send).toHaveBeenCalledTimes(2);
	});

	it('lets the next pathname proceed after a provider request stalls', async () => {
		const fetcher = vi.fn(async () => new Promise<Response>(() => {}));
		const transport: PlausibleTransport = {
			sendPlausibleEvent: (payload) => sendPlausibleEvent(payload, fetcher, 5),
		};
		const { client } = createClient({ transport });

		const outcome = await Promise.race([
			Promise.all([
				client.trackPageview(new URL('https://metrics.example/projects')),
				client.trackPageview(new URL('https://metrics.example/contact')),
			]),
			new Promise<'hung'>((resolve) => setTimeout(() => resolve('hung'), 100)),
		]);

		expect(outcome).toEqual([false, false]);
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it('caches an import failure without throwing or retrying', async () => {
		const loadTransport = vi.fn(async (): Promise<PlausibleTransport> => {
			throw new Error('import failed');
		});
		const client = createAnalyticsClient(PRESET, {
			loadTransport,
			canTrack: () => true,
			getReferrer: () => '',
		});
		const url = new URL('https://metrics.example/contact');

		await expect(client.trackEvent('event_beta', url)).resolves.toBeUndefined();
		await expect(client.trackEvent('event_beta', url)).resolves.toBeUndefined();

		expect(loadTransport).toHaveBeenCalledOnce();
	});

	it('omits the referrer when reading it fails', async () => {
		const send = vi.fn<PlausibleTransport['sendPlausibleEvent']>(async () => true);
		const transport = createTransport({ send });
		const loadTransport = vi.fn(async () => transport);
		const client = createAnalyticsClient(PRESET, {
			loadTransport,
			canTrack: () => true,
			getReferrer: () => {
				throw new Error('referrer blocked');
			},
		});
		const url = new URL('https://metrics.example/contact');

		await client.trackEvent('event_beta', url);

		expect(loadTransport).toHaveBeenCalledOnce();
		expect(send).toHaveBeenCalledWith({
			name: 'event_beta',
			url: 'https://metrics.example/contact',
			domain: 'metrics.example',
		});
	});

	it('swallows transport send failures', async () => {
		const send = vi.fn<PlausibleTransport['sendPlausibleEvent']>(async () => {
			throw new Error('track failed');
		});
		const transport = createTransport({ send });
		const { client } = createClient({ transport });

		await expect(
			client.trackEvent('event_beta', new URL('https://metrics.example/contact')),
		).resolves.toBeUndefined();
	});
});
