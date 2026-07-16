# @yesid/ui wave-1 parity notes

Transit is the package baseline for wave 1. Its current primitive behavior and classes were ported as-is, with only package import-path changes. Differences found in yesid.dev were recorded here; no yesid.dev behavior was merged into the package and no consumer conditional was added.

Comparison snapshot:

- Transit: `transit/apps/web/src/lib/components/ui/`
- yesid.dev: `yesid.dev/apps/web/src/lib/components/ui/`
- Families reviewed: badge, button, card, collapsible, resizable, scroll-area, separator, tabs, toggle, toggle-group, sheet, skeleton, line-combobox

Both consumers currently use `bits-ui ^2.16.3`, `clsx ^2.1.1`, `svelte ^5.54.0`, `tailwind-merge ^3.5.0`, `tailwind-variants ^3.2.2`, and `paneforge ^1.0.2`. Transit also supplies `@lucide/svelte ^1.18.0` for Sheet and `@yesid/motion` for Button.

## Adoption matrix

| Family | yesid.dev status | Adoption work for zero visual/behavior change | Existing evidence or conflict |
| --- | --- | --- | --- |
| Badge | Same public surface, different merge config and type classes | Preserve yesid.dev's smaller type where required through consumer classes or a local adapter | No co-located primitive test |
| Button | Same core surface; yesid.dev adds `conversion` and lacks press motion | Keep the marketing-only conversion behavior outside the shared package; decide deliberately whether yesid.dev adopts `pressBounce` | yesid.dev has 12 co-located tests and source guards; two tests require `conversion` |
| Card | yesid.dev exports Root only and uses a bevel plus hover shadow | Keep the bevel/shadow in a yesid.dev wrapper or consumer style; adopt Transit subparts separately | Hard conflict: yesid.dev requires the bevel while Transit tests forbid any Card shadow or edge highlight |
| Collapsible | Root/Trigger match; Content behavior differs | Verify forced mounting, extra DOM, inert state, and transition behavior before replacing yesid.dev Content | Transit consumer test source-locks the animation contract |
| Resizable | Same API, different interaction chrome | Preserve yesid.dev's neutral handle and large grip radius locally if exact appearance is required | No co-located primitive test |
| Scroll Area | Same API and effective styling | Remove or retain yesid.dev's inert marker hook only if a consumer selector starts using it | No co-located primitive test |
| Separator | Same API; content-width token and label typography differ | Alias/override the width token and preserve yesid.dev label styling where required | yesid.dev source guards lock hazard tokens and stripe thickness |
| Tabs | Same exports and variants; active-state implementation and geometry differ | Package fixes the dead bits-ui v2 selector; visually compare rail height, padding, shadow, underline position, and type | Package ports Transit's two co-located selector tests |
| Toggle | Same API; type, foreground, invalid state, and merge config differ | Preserve yesid.dev invalid-state styling and type/color choices locally if still required | No co-located primitive test |
| Toggle Group | Family-local implementation matches | Review only inherited Toggle styling | No co-located primitive test |
| Sheet | Missing from yesid.dev | New surface for yesid.dev; no legacy behavior to preserve | No co-located primitive test |
| Skeleton | Missing from yesid.dev | New surface for yesid.dev; no legacy behavior to preserve | No co-located primitive test |
| Line Combobox | Missing from yesid.dev | Ported internally for parity, but withheld from the package export map until it has a third-consumer-safe public name | No co-located primitive test |

## Detailed family differences

### Badge

Public surface matches: `Badge`, `badgeVariants`, `BadgeVariant`, and `BadgeSize`. Both implementations render an anchor when `href` is present and a span otherwise. Variants (`default`, `secondary`, `destructive`, `outline`, `ghost`, `link`, `tag`, `tag-active`, `number`), sizes (`default`, `xs`, `sm`), attributes, and defaults match.

Differences:

- Transit passes the base `twMergeConfig` to `tv`; yesid.dev uses the default `tailwind-variants` merge vocabulary.
- Transit `default` and `sm` use `text-caption`; yesid.dev uses `text-xs`.
- Transit `number` uses `text-micro`; yesid.dev uses literal `text-[0.75rem]`.
- Transit and yesid.dev currently define `--text-caption` as `0.8125rem`. Transit defines `--text-micro` as `0.75rem`, while yesid.dev defines it as `0.6875rem`; adopting the class without the corresponding token baseline would shrink yesid.dev's number badge.

### Button

Common public surface matches: `Root`, `Button`, `buttonVariants`, `ButtonProps`, `ButtonVariant`, and `ButtonSize`. Button/anchor branching, disabled-link handling, default `type="button"`, forwarded props, variants other than `conversion`, sizes, and defaults match.

Differences:

- Transit base type is `text-control`; yesid.dev uses `text-sm`.
- Transit `xs` uses `text-caption`; yesid.dev uses `text-xs`.
- Transit `cta-sm` uses `text-control`; yesid.dev uses `text-small`. Both named yesid.dev tokens currently resolve to `0.9375rem`, but the vocabulary class is different.
- yesid.dev alone exports the `conversion` variant: `bg-accent text-signage-bg`, accent hover, and a conversion-only CTA lift/glow compound variant. Transit intentionally omits this marketing conversion behavior.
- Transit applies `use:pressBounce` from `@yesid/motion` to both anchors and buttons. yesid.dev does not.

Test/adoption conflict:

- yesid.dev's `button.test.ts` has 12 tests through `ButtonTest.svelte`; two require the conversion signage pair and conversion CTA lift.
- `yesid.dev/apps/web/src/tests/style-regressions.test.ts` also requires the conversion variant in source and checks its consumers.
- Transit has no co-located Button test. The package must not add `conversion` merely to satisfy yesid.dev tests; yesid.dev needs a local wrapper/variant or an explicit product-level redesign.

### Card

yesid.dev exports only `Root` and `Card`. Transit additionally exports both short and prefixed names for `Content`, `Description`, `Footer`, `Header`, `Title`, and `Action`.

Transit subpart behavior/classes have no yesid.dev counterpart:

- Content: horizontal padding `px-4`, reduced to `px-3` for a small Card.
- Description: `text-small text-muted-foreground` paragraph.
- Footer: muted half-surface, top border, responsive Card padding, flex row.
- Header: container grid with Action and Description-aware tracks, responsive Card padding, and optional border-bottom padding.
- Title: heading font, `text-body`, snug leading, reduced to `text-small` in a small Card.
- Action: second grid column, spans two rows, aligned top-right.

Root differences:

- Transit adds `interactive?: boolean`, default `false`, and emits `data-interactive="true"` only when enabled.
- Transit interactive Cards rise one pixel on hover; reduced motion removes the transform.
- Transit uses `text-small`; yesid.dev uses `text-sm`.
- yesid.dev always draws an inset `edge-highlight` bevel and adds `shadow-section` on every hover.
- Transit has no bevel or outer shadow. Hover only firms the four-sided border; movement is opt-in through `interactive`.

This is a hard test conflict, not a merge candidate:

- `yesid.dev/apps/web/src/tests/style-regressions.test.ts` requires `inset 0 1px 0 var(--edge-highlight)`.
- `transit/apps/web/src/tests/card-frame-consistency.test.ts` forbids `box-shadow` and `var(--edge-highlight)` in Card.
- `transit/apps/web/src/tests/data-surface-no-glow.test.ts` also forbids shared Card glow tokens.
- `yesid.dev/apps/web/src/tests/surface-spec.test.ts` reads the local Card source directly and will need a wrapper-aware assertion or an updated source target during adoption.

### Collapsible

`Root`, `Collapsible`, `Trigger`, `Content`, their prefixed aliases, `open` binding, and Root/Trigger defaults match.

Content differences:

- yesid.dev is a transparent self-closing `bits-ui` Content wrapper.
- Transit defaults `forceMount` to `true` so close animation can finish.
- Transit uses the bits-ui child snippet to add an outer grid wrapper and inner overflow-clipping wrapper.
- Closed Transit content receives `inert` and `aria-hidden="true"`.
- Transit animates `grid-template-rows: 0fr` to `1fr` and opacity with `--duration-slow` and `--ease-default`.
- Transit disables that transition under `prefers-reduced-motion: reduce`.

`transit/apps/web/src/lib/components/shared/CollapsibleSection.test.ts` source-locks the grid, opacity, timing, and reduced-motion behavior. yesid.dev adoption must account for the extra DOM and forced-mounted closed content rather than treating this as an import-only visual substitution.

### Resizable

Exports and API match: PaneGroup, Pane, Handle, their prefixed aliases, `withHandle=false`, pane-group instance binding, direction handling, and forwarded props.

Differences:

- Transit Handle adds color transitions, primary hover/focus background, primary focus ring, and `data-[active=pointer]:bg-primary` drag feedback.
- yesid.dev Handle remains neutral `bg-border`, uses `ring-ring`, and has no primary hover or pointer-active state.
- Transit uses `focus-visible:outline-none`; yesid.dev uses `focus-visible:outline-hidden`.
- Transit grip uses `rounded-sm`; yesid.dev uses `rounded-lg`.
- yesid.dev includes `cn-resizable-handle` and `cn-resizable-panel-group` marker classes; Transit does not. No selector elsewhere in yesid.dev currently defines either marker, so they have no current visual effect.

### Scroll Area

Exports and behavior match: Root/ScrollArea, Scrollbar/ScrollAreaScrollbar, viewport ref binding, `vertical` default, `horizontal`/`both` modes, caller scrollbar classes, Thumb, Corner, and forwarded props.

Differences are non-visual today:

- yesid.dev adds a `cn-scroll-area-viewport` marker class; Transit does not. No other yesid.dev source defines it.
- yesid.dev uses `border-t-transparent`/`border-l-transparent`; Transit uses the equivalent arbitrary-value forms `border-t-[transparent]`/`border-l-[transparent]`.
- Remaining changes are class ordering and comments.

### Separator

Exports and API match: `Separator`, `SeparatorVariant`, `HazardSize`; variants `default`, `hazard`, `gradient`; default variant, `hazardSize="md"`, `hazardAngle=-45`, orientation handling, label option, stripe periods, band thickness, animated gradient, data attributes, and reduced-motion fallback.

Differences:

- Transit gradient default `maxWidth` is `var(--width-content)`; yesid.dev uses `var(--container-content)`. yesid.dev must provide the Transit token/alias or pass its old value explicitly to avoid a width change.
- A Transit labeled hazard uses `label-station shrink-0`; yesid.dev uses only `shrink-0`.
- A Transit gradient label uses `label-station mt-2`; yesid.dev owns `mt-2 font-mono text-xs tracking-[3px] text-primary md:text-sm` directly.
- Hazard colors, stripe widths, heights, and animation behavior otherwise match.

yesid.dev source guards lock the hazard tokens and `sm/md/lg` band thickness. Those assertions read the old local source path and need retargeting or wrapper-aware checks during adoption.

### Tabs

Public surface matches: Root/Tabs, Content/TabsContent, List/TabsList, Trigger/TabsTrigger, `tabsListVariants`, and `TabsListVariant`. Root binding/defaults and the `default`/`line` List variants match.

Content difference:

- Transit uses `text-small`; yesid.dev uses `text-sm`.

List differences:

- Transit passes base `twMergeConfig` to `tv`; yesid.dev uses the default merge vocabulary.
- yesid.dev forces horizontal height `h-8`; Transit has no fixed rail height.
- Transit default rail is `bg-card shadow-card`; yesid.dev is `bg-card` plus inert marker `cn-tabs-list-variant-default`.
- Transit line rail adds `p-0`, overriding base `p-[3px]`; yesid.dev retains the base padding and adds inert marker `cn-tabs-list-variant-line`.
- No selector elsewhere in yesid.dev defines either marker.

Trigger differences:

- Transit targets bits-ui v2's real `data-state="active"` through `data-[state=active]:`; yesid.dev uses dead `data-active:` variants.
- Transit scopes active background/text/shadow to the List variant. yesid.dev's active classes are partly unscoped and include dark-only input/background/border rules.
- Transit default active shadow is `shadow-card`; yesid.dev uses `shadow-sm`, with `shadow-none` on the line variant.
- Transit line underline sits at `bottom-[-1px]`; yesid.dev uses `bottom-[-5px]`.
- Transit adds `outline-none` and uses `text-small`; yesid.dev lacks that base outline class and uses `text-sm`.

The package ports Transit's two co-located tests: one requires `data-[state=active]:`; the other forbids `data-active:`. This fixes a dead selector, but rail geometry and styling still need visual adoption review in yesid.dev.

### Toggle

Exports and API match: Root/Toggle, `toggleVariants`, `ToggleSize`, `ToggleVariant`, `ToggleVariants`; variants `default`/`outline`; sizes `default`/`sm`/`lg`; defaults; `pressed` binding; forwarded bits-ui props.

Differences:

- Transit passes base `twMergeConfig` to `tv`; yesid.dev uses the default merge vocabulary.
- Transit base type is `text-small`; yesid.dev uses `text-sm`.
- Transit adds base `text-muted-foreground`; yesid.dev has no explicit resting foreground class.
- Transit `sm` uses `text-caption`; yesid.dev uses `text-[0.8rem]`.
- yesid.dev includes invalid-state border and ring classes (`aria-invalid:*` plus dark variants); Transit omits them.
- Pressed/on state, primary interaction classes, focus ring, geometry, icons, and disabled behavior otherwise match.

### Toggle Group

Exports, API, and effective class sets match: Root/ToggleGroup, Item/ToggleGroupItem, context-provided variant/size/spacing/orientation, defaults, bindable discriminated-union value cast, data attributes, segmented-control border joining, and gap calculation.

Only formatting, class ordering, and comment wording differ locally. Adoption differences come from the Transit `toggleVariants` used by each Item, as documented above.

### Sheet

Transit-only; yesid.dev has no Sheet family.

Transit exports direct bits-ui Dialog Root, Trigger, Close, and Portal plus wrapped Content, Overlay, Header, Footer, Title, and Description. It also exports prefixed aliases, `sheetVariants`, and `SheetSide`.

Contract/classes:

- Sides are `left`, `right`, and `bottom`; bottom is the mobile-first default.
- Content uses base popover surface/foreground, `shadow-sheet`, fixed positioning, state-driven enter/exit animation, and side-specific borders/geometry.
- Content accepts `portalProps`, requires children, always renders an Overlay, and defaults `showCloseButton` to `true`.
- The close button uses `@lucide/svelte` X, carries an `sr-only` label, and has focus/disabled behavior.
- Overlay uses the sheet z-index token and scrim token/fallback with state-driven fade.
- Header and Footer are padded column layouts; Footer uses `margin-top: auto`.
- Title uses heading font, `text-base`, snug leading, medium weight. Description uses `text-small text-muted-foreground`.
- `sheetVariants` uses the base `twMergeConfig`.

There is no yesid.dev behavior to merge. Its first adoption is a new feature and needs product-level visual/a11y verification.

### Skeleton

Transit-only; yesid.dev has no Skeleton family.

Transit exports Root/Skeleton. It renders a ref-capable div with `data-slot="skeleton"`, `aria-hidden="true"`, caller classes/children/attributes, `rounded-md`, and solid `bg-muted`. A scoped two-second opacity pulse stops entirely under reduced motion. There is no legacy yesid.dev behavior to preserve.

### Line Combobox

Transit-only; yesid.dev has no Line Combobox family. The byte-faithful source is present under `src/primitives/line-combobox`, but wave 1 does not expose a `@yesid/ui/line-combobox` package subpath.

Transit exports Root/LineCombobox plus `LineComboboxOption` and `LineComboboxProps`. The API accepts a readonly option catalogue, bindable nullable selected value, accessible labels/copy, optional placeholder, a caller-provided fold function, and a root class.

Behavior/classes:

- bits-ui single-select Combobox with portalled Content and roving listbox behavior.
- Local ephemeral query, caller-defined folding, and token-AND filtering against each option's precomputed search haystack.
- Optional glyph/sublabel, selected checkmark, empty state, clear control, and trigger.
- Closing resets the typed query; clearing resets both query and value.
- Tokenized card/listbox chrome, primary interaction states, and minimum tap-target sizing.

Naming decision: the implementation is largely entity-generic, but `LineCombobox`, `LineComboboxOption`, and `LineComboboxProps`, along with line-oriented examples in its source comments, are Transit-domain language. Those names do not pass the third-consumer test, so wave 1 preserves the Plan-required source byte-faithfully while withholding the family from the package export map. Before exposing it publicly, the package needs a genuinely generic name with deliberate compatibility aliasing; no app conditional is involved.

## Test and source-path adoption checklist

Only Transit's co-located primitive test was ported unchanged apart from its package source path: `tabs/tabs-trigger.test.ts` contains two tests. yesid.dev's local Button test/harness was not merged because it asserts yesid.dev-only conversion behavior.

When yesid.dev flips imports, update or replace direct-source assertions deliberately:

- `apps/web/src/lib/components/ui/button/button.test.ts` and `ButtonTest.svelte`
- `apps/web/src/tests/style-regressions.test.ts` for Button conversion, Card bevel, and Separator source
- `apps/web/src/tests/surface-spec.test.ts` for the local Card source
- `apps/web/src/lib/styles/__tests__/engine-fullbleed-css.test.ts` for the local Separator import string

Transit also has consumer-level guards outside the package test suite that remain part of its acceptance bar:

- `apps/web/src/tests/card-frame-consistency.test.ts`
- `apps/web/src/tests/data-surface-no-glow.test.ts`
- `apps/web/src/lib/components/shared/CollapsibleSection.test.ts`

Passing package tests alone does not prove either consumer has zero visual change. Each consumer adoption needs its own source guards, build, and browser comparison after import replacement.
