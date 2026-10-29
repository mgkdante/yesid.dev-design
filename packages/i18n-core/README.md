# @yesid/i18n-core

Framework-free locale mechanics, configured by each product: routing (prefix parsing, path
localization and delocalization, URL-state preservation, locale-switch detection, route-ID
normalization), Intl formatting with relative time, and typed copy. Products own their locale
values, Intl tags, copy, exemptions, framework adapters and runtime flags.

## Interface

The root export exposes `createLocaleRouting`, `createIntl` and `createCopy` with their types.
Each app binds them once to its own locales:

```ts
export const intl = createIntl<Locale>({ en: 'en-CA', fr: 'fr-CA' });
export const defineCopy = createCopy<Locale, 'fr'>();

intl.number(locale, { maximumFractionDigits: 1 }).format(value);
intl.dateTime(locale, { dateStyle: 'medium' }).format(date);
intl.relativeTime(locale, -180); // "3 minutes ago", "il y a 3 minutes"
```

`number`, `dateTime`, `collator` and `plural` return Intl objects cached per locale and options, so a
component can ask for one on every render. `relativeTime` takes a signed offset in seconds
(negative is past), picks the largest whole unit, and reads anything under 5 seconds as Intl's own
"now". `defineCopy` returns its argument unchanged; at compile time every locale must have the
source locale's keys and function signatures.

The SvelteKit param matcher is `routing.isPrefixLocale`: `export const match = routing.isPrefixLocale`
in Kit 2, `locale: (param) => (routing.isPrefixLocale(param) ? param : undefined)` in Kit 3's
`defineParams`. Kit 3 imports `src/params.ts` natively with Node at build time, so that file must
not import this TypeScript package; keep its prefix list in a dependency-free module.

Locale context and `<html lang>` live in `@yesid/ui` (`createLocaleContext` and `SiteRoot`'s
`lang`), because they need Svelte. The exact interface is in
[`api-reports/i18n-core.api.md`](https://github.com/mgkdante/yesid.dev-design/blob/v0.29.0/api-reports/i18n-core.api.md).

## Rules

- The default locale cannot also be a prefixed locale; that configuration throws at construction.
- Only rooted, non-protocol-relative hrefs are localized.
- Exempt paths pass through unchanged.
- Search and hash preservation is the product's choice.
- Locale switching compares delocalized paths and resolved locales.
- `relativeTime` throws a RangeError for a non-finite offset, as Intl does.
- No framework, SvelteKit virtual module, browser state, filesystem or network dependency enters
  the package.

## Develop

```sh
bun run --cwd packages/i18n-core test
bun run --cwd packages/i18n-core check
```
