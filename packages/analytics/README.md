# @yesid/analytics

Cookieless Plausible measurement and web-vitals collection. `createAnalytics` wraps the official
[`@plausible-analytics/tracker`](https://www.npmjs.com/package/@plausible-analytics/tracker):
it captures pageviews, including client-side navigation, and returns a `trackEvent` typed to the
product's events. The product supplies the domain, event names and privacy policy.

## Interface

The root export and the `./config`, `./client` and `./vitals` subpaths are public. The exact
interface is in
[`api-reports/analytics.api.md`](https://github.com/mgkdante/yesid.dev-design/blob/v0.30.1/api-reports/analytics.api.md).

## Measurement

In the root layout:

```ts
import { createAnalytics, defineAnalyticsPreset } from '@yesid/analytics';
const preset = defineAnalyticsPreset({ events: ['signup_click'] });
onMount(() => {
	const analytics = createAnalytics(preset, { domain: PUBLIC_PLAUSIBLE_DOMAIN });
	analytics.trackEvent('signup_click');
});
```

It sends nothing unless `domain` is set and the page is served from that host or a subdomain,
so local, preview and fork deployments stay silent. Call it once per page load in the browser
(it throws if the tracker is started twice). Each request carries only the page path, bounded
campaign tags (`utm_*`, `ref`, `source`) and the referrer's origin. Nothing is written to cookies
or browser storage. The product's CSP needs `connect-src https://plausible.io`.

## Web vitals

`./vitals` holds the beacon schema (`parseVitalsBeacon`, `parseVitalsSample` and their limits) for
the receiving endpoint, and `startVitals({ endpoint, load })` for the page. `load` returns the
`web-vitals` module (`() => import('web-vitals')`), so the package adds no dependency. The
collector starts once per page, keeps up to 12 samples, and sends one beacon when the page is
hidden, through `sendBeacon` or a keepalive `fetch`. It never throws. Products own whether it
runs and where the samples go.

## Rules

- No domain, a foreign host or no browser location sends nothing and never starts the tracker.
- URLs and referrers are reduced before they leave the browser. A URL that can't be reduced drops
  the event instead of throwing into navigation.
- No cookies or storage writes; the tracker only reads its own `plausible_ignore` opt-out.
- Only pageviews, engagement and the preset's custom events are sent, never custom properties or
  revenue.
- Delivery is fire-and-forget. Products own any monitoring of it.

## Develop

```sh
bun run --cwd packages/analytics test
bun run --cwd packages/analytics check
```
