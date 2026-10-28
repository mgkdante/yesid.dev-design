import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock('@yesid/motion/stores/reducedMotion', () => ({ isPrefersReducedMotion: () => motion.reduced }));

// The clock is a module singleton; each test gets a fresh one.
async function loadClock() {
	vi.resetModules();
	return (await import('./clock.svelte.js')).clock;
}

beforeEach(() => {
	vi.useFakeTimers({ now: Date.parse('2026-06-15T12:00:00Z') });
	motion.reduced = false;
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.clearAllTimers();
	vi.useRealTimers();
});

describe('clock', () => {
	it('ticks every second while subscribed and stops when the last subscriber lets go', async () => {
		const clock = await loadClock();
		const release = clock.subscribe();
		const start = clock.now;
		vi.advanceTimersByTime(3_000);
		expect(clock.now - start).toBe(3_000);
		release();
		vi.advanceTimersByTime(5_000);
		expect(clock.now - start).toBe(3_000);
	});

	it('ticks every 30 seconds under reduced motion', async () => {
		motion.reduced = true;
		const clock = await loadClock();
		clock.subscribe();
		const start = clock.now;
		vi.advanceTimersByTime(29_000);
		expect(clock.now).toBe(start);
		vi.advanceTimersByTime(1_000);
		expect(clock.now - start).toBe(30_000);
	});

	it('pauses in a hidden tab and catches up when it shows again', async () => {
		const clock = await loadClock();
		clock.subscribe();
		const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
		document.dispatchEvent(new Event('visibilitychange'));
		const paused = clock.now;
		vi.advanceTimersByTime(5_000);
		expect(clock.now).toBe(paused);
		hidden.mockReturnValue(false);
		document.dispatchEvent(new Event('visibilitychange'));
		expect(clock.now - paused).toBe(5_000);
	});

	it('reads server time from the last finite server time noted', async () => {
		const clock = await loadClock();
		expect(clock.serverNow).toBe(clock.now);
		clock.noteServerEpochMs(Date.now() + 9 * 60_000);
		expect(clock.serverNow).toBe(clock.now + 9 * 60_000);
		clock.noteServerEpochMs(Number.NaN);
		clock.noteServerEpochMs(Number.POSITIVE_INFINITY);
		expect(clock.serverNow).toBe(clock.now + 9 * 60_000);
	});

	it('never steps the continuous read back by less than 2 s, and follows a larger jump', async () => {
		const clock = await loadClock();
		clock.noteServerEpochMs(Date.now() + 1_000);
		const ahead = clock.serverNowContinuousMs();
		clock.noteServerEpochMs(Date.now());
		expect(clock.serverNowContinuousMs()).toBe(ahead);
		vi.advanceTimersByTime(1_500);
		expect(clock.serverNowContinuousMs()).toBe(Date.now());
		clock.noteServerEpochMs(Date.now() - 5_000);
		expect(clock.serverNowContinuousMs()).toBe(Date.now() - 5_000);
	});
});
