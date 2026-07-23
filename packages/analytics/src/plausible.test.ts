import { describe, expect, it, vi } from 'vitest';
import {
	PLAUSIBLE_ENDPOINT,
	sendPlausibleEvent,
	type PlausibleEventPayload,
	type PlausibleFetch,
} from './plausible';

describe('controlled Plausible Events API transport', () => {
	it('sends one official payload without installing autonomous browser listeners', async () => {
		const payload: PlausibleEventPayload = {
			name: 'pageview',
			url: 'https://metrics.example/projects?utm_source=portfolio',
			domain: 'metrics.example',
			referrer: 'https://www.google.com/',
		};
		const response = new Response('{}', { status: 202 });
		const fetcher = vi.fn(async () => response);

		await expect(sendPlausibleEvent(payload, fetcher)).resolves.toBe(true);

		expect(PLAUSIBLE_ENDPOINT).toBe('https://plausible.io/api/event');
		expect(fetcher).toHaveBeenCalledOnce();
		expect(fetcher).toHaveBeenCalledWith(PLAUSIBLE_ENDPOINT, {
			method: 'POST',
			headers: { 'Content-Type': 'text/plain' },
			body: JSON.stringify(payload),
			keepalive: true,
			credentials: 'omit',
			signal: expect.any(AbortSignal),
		});
	});

	it('soft-fails on network and non-success responses', async () => {
		const payload: PlausibleEventPayload = {
			name: 'event_alpha',
			url: 'https://metrics.example/contact',
			domain: 'metrics.example',
		};

		await expect(
			sendPlausibleEvent(payload, vi.fn(async () => new Response('', { status: 503 }))),
		).resolves.toBe(false);
		await expect(
			sendPlausibleEvent(payload, vi.fn(async () => Promise.reject(new Error('offline')))),
		).resolves.toBe(false);
	});

	it('aborts and resolves false when the provider never settles', async () => {
		const payload: PlausibleEventPayload = {
			name: 'pageview',
			url: 'https://metrics.example/projects',
			domain: 'metrics.example',
		};
		const fetcher = vi.fn<PlausibleFetch>(
			async () => new Promise<Response>(() => {}),
		);

		const outcome = await Promise.race([
			sendPlausibleEvent(payload, fetcher, 5),
			new Promise<'hung'>((resolve) => setTimeout(() => resolve('hung'), 100)),
		]);

		expect(outcome).toBe(false);
		expect(fetcher).toHaveBeenCalledOnce();
		const request = fetcher.mock.calls[0]?.[1];
		expect(request?.signal).toBeInstanceOf(AbortSignal);
		expect(request?.signal?.aborted).toBe(true);
	});
});
