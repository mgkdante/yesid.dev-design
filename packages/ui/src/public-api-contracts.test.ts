import type { Component, ComponentProps, Snippet } from 'svelte';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { Badge, type BadgeProps } from '@yesid/ui/badge';
import { Button, type ButtonProps } from '@yesid/ui/button';
import { CollapsibleContent } from '@yesid/ui/collapsible';
import { Combobox, type ComboboxProps } from '@yesid/ui/combobox';
import { Separator, type SeparatorProps } from '@yesid/ui/separator';
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetOverlay,
	SheetPortal,
	SheetTitle,
	SheetTrigger,
	type SheetCloseProps,
	type SheetContentProps,
	type SheetDescriptionProps,
	type SheetFooterProps,
	type SheetHeaderProps,
	type SheetOverlayProps,
	type SheetPortalProps,
	type SheetRootProps,
	type SheetTitleProps,
	type SheetTriggerProps,
} from '@yesid/ui/sheet';
import {
	ToggleGroup,
	ToggleGroupItem,
	type ToggleGroupItemProps,
	type ToggleGroupProps,
} from '@yesid/ui/toggle-group';
import {
	ChevronToggle,
	QuietModeButton,
	SectionLabel,
	StopLabel,
	TerminalCursor,
	type QuietModeButtonProps,
	type StopLabelProps,
	type TerminalCursorProps,
} from '@yesid/ui/brand';

type BindingsOf<T> = T extends Component<any, any, infer Bindings> ? Bindings : never;

const buttonProps: ButtonProps = {
	type: 'submit',
	form: 'checkout',
	ref: null as HTMLButtonElement | null,
	onclick: (event) => expectTypeOf(event.currentTarget).toMatchTypeOf<HTMLButtonElement>(),
};

const buttonLinkProps: ButtonProps = {
	href: '',
	type: 'text/html',
	target: '_blank',
	disabled: true,
	ref: null as HTMLAnchorElement | null,
	onclick: (event) => expectTypeOf(event.currentTarget).toMatchTypeOf<HTMLAnchorElement>(),
};

// @ts-expect-error anchor-only target requires the href discriminant
const invalidButtonTarget: ButtonProps = { target: '_blank' };
// @ts-expect-error button-only form is invalid on the anchor branch
const invalidButtonForm: ButtonProps = { href: '/products', form: 'checkout' };

const badgeProps: BadgeProps = {
	ref: null as HTMLSpanElement | null,
	onclick: (event) => expectTypeOf(event.currentTarget).toMatchTypeOf<HTMLSpanElement>(),
};

const badgeLinkProps: BadgeProps = {
	href: '',
	target: '_blank',
	ref: null as HTMLAnchorElement | null,
	onclick: (event) => expectTypeOf(event.currentTarget).toMatchTypeOf<HTMLAnchorElement>(),
};

// @ts-expect-error anchor-only target requires the href discriminant
const invalidBadgeTarget: BadgeProps = { target: '_blank' };

const divStopLabel: StopLabelProps = {
	stop: '01',
	onclick: (event) => expectTypeOf(event.currentTarget).toMatchTypeOf<HTMLDivElement>(),
};

const headingStopLabel: StopLabelProps = {
	stop: '01',
	as: 'h1',
	onclick: (event) => expectTypeOf(event.currentTarget).toMatchTypeOf<HTMLHeadingElement>(),
};

const ignoredChildren = (() => undefined) as unknown as Snippet;
// @ts-expect-error StopLabel owns its rendered plate content
const invalidStopChildren: StopLabelProps = { stop: '01', children: ignoredChildren };

type CollapsibleContentProps = ComponentProps<typeof CollapsibleContent>;
// @ts-expect-error CollapsibleContent owns the delegated child snippet
const invalidCollapsibleChild: CollapsibleContentProps = { child: ignoredChildren };

type SectionLabelProps = ComponentProps<typeof SectionLabel>;
type ChevronToggleProps = ComponentProps<typeof ChevronToggle>;
// @ts-expect-error fixed-content brand components do not accept children
const invalidSectionChildren: SectionLabelProps = { text: 'Section', children: ignoredChildren };
// @ts-expect-error the decorative SVG owns its path
const invalidChevronChildren: ChevronToggleProps = { open: false, children: ignoredChildren };
// @ts-expect-error the decorative cursor owns its empty span
const invalidCursorChildren: TerminalCursorProps = { children: ignoredChildren };

const quietModeProps: QuietModeButtonProps = {
	copy: {
		collapse: 'Collapse all',
		expand: 'Expand all',
		collapseTitle: 'Collapse every section',
		expandTitle: 'Expand every section',
		remember: 'Always start collapsed',
		forget: "Don't start collapsed",
	},
	enabled: false,
	remembered: false,
	onToggle: () => undefined,
	onRememberToggle: () => undefined,
	activeEffect: 'glow',
};
type QuietModeComponentProps = ComponentProps<typeof QuietModeButton>;
const quietModeComponentProps: QuietModeComponentProps = quietModeProps;
// @ts-expect-error visual policy is a closed neutral variant
const invalidQuietModeEffect: QuietModeButtonProps = { ...quietModeProps, activeEffect: 'pulse' };
const invalidQuietModeChildren: QuietModeButtonProps = {
	...quietModeProps,
	// @ts-expect-error the package owns the two-button body
	children: ignoredChildren,
};

const comboboxProps: ComboboxProps = {
	options: [],
	label: 'Choose',
	clearLabel: 'Clear',
	emptyLabel: 'Empty',
	fold: (raw) => raw,
	open: false,
	disabled: true,
	name: 'choice',
	onValueChange: (value) => expectTypeOf(value).toEqualTypeOf<string | null>(),
};

const separatorDefault: SeparatorProps = { variant: 'default', decorative: true };
const separatorHazard: SeparatorProps = {
	variant: 'hazard',
	hazardSize: 'sm',
	maxWidth: '100%',
	orientation: 'vertical',
	'data-testid': 'hazard',
	ref: null,
};
const separatorGradient: SeparatorProps = {
	variant: 'gradient',
	maxWidth: '60rem',
	'data-slot': 'custom-separator',
};
// @ts-expect-error custom visual variants cannot promise Bits render delegation
const invalidSeparatorChild: SeparatorProps = { variant: 'hazard', child: ignoredChildren };
// @ts-expect-error custom visual variants are always decorative
const invalidSeparatorDecorative: SeparatorProps = { variant: 'gradient', decorative: false };

const singleToggle: ToggleGroupProps = {
	type: 'single',
	value: 'one',
	onValueChange: (value) => expectTypeOf(value).toEqualTypeOf<string>(),
};
const multipleToggle: ToggleGroupProps = {
	type: 'multiple',
	value: ['one'],
	onValueChange: (value) => expectTypeOf(value).toEqualTypeOf<string[]>(),
};
const toggleItem: ToggleGroupItemProps = { value: 'one' };
// @ts-expect-error single mode accepts one string
const invalidSingleToggle: ToggleGroupProps = { type: 'single', value: ['one'] };
// @ts-expect-error multiple mode accepts an array
const invalidMultipleToggle: ToggleGroupProps = { type: 'multiple', value: 'one' };
// @ts-expect-error item value is required input state
const invalidToggleItem: ToggleGroupItemProps = {};

const sheetRoot: SheetRootProps = { open: false };
const sheetTrigger: SheetTriggerProps = {};
const sheetClose: SheetCloseProps = {};
const sheetPortal: SheetPortalProps = { disabled: true };
const sheetContent: SheetContentProps = {
	children: ignoredChildren,
	portalProps: { disabled: true },
	closeLabel: 'Close panel',
};
const sheetOverlay: SheetOverlayProps = {};
const sheetHeader: SheetHeaderProps = {};
const sheetFooter: SheetFooterProps = {};
const sheetTitle: SheetTitleProps = {};
const sheetDescription: SheetDescriptionProps = {};
const invalidPortalChildren: SheetContentProps = {
	children: ignoredChildren,
	// @ts-expect-error SheetContent owns Portal children
	portalProps: { children: ignoredChildren },
};

describe('public UI prop contracts', () => {
	it('keeps component bindings and named exports explicit', () => {
		expectTypeOf<BindingsOf<typeof Button>>().toEqualTypeOf<'ref'>();
		expectTypeOf<BindingsOf<typeof Badge>>().toEqualTypeOf<'ref'>();
		expectTypeOf<BindingsOf<typeof Combobox>>().toEqualTypeOf<'value' | 'open'>();
		expectTypeOf<BindingsOf<typeof Separator>>().toEqualTypeOf<'ref'>();
		expectTypeOf<BindingsOf<typeof ToggleGroup>>().toEqualTypeOf<'value' | 'ref'>();
		expectTypeOf<BindingsOf<typeof ToggleGroupItem>>().toEqualTypeOf<'ref'>();
		expectTypeOf<BindingsOf<typeof Sheet>>().toEqualTypeOf<'open'>();
		expectTypeOf<BindingsOf<typeof SheetTrigger>>().toEqualTypeOf<'ref'>();
		expectTypeOf<BindingsOf<typeof SheetClose>>().toEqualTypeOf<'ref'>();
		expectTypeOf<BindingsOf<typeof SheetContent>>().toEqualTypeOf<'ref'>();
		expectTypeOf<BindingsOf<typeof SheetOverlay>>().toEqualTypeOf<'ref'>();
		expectTypeOf<BindingsOf<typeof SheetTitle>>().toEqualTypeOf<'ref'>();
		expectTypeOf<BindingsOf<typeof SheetDescription>>().toEqualTypeOf<'ref'>();
		expectTypeOf<BindingsOf<typeof SheetPortal>>().toEqualTypeOf<''>();
		expect(buttonProps.type).toBe('submit');
		expect(buttonLinkProps.href).toBe('');
		expect(badgeProps.ref).toBeNull();
		expect(badgeLinkProps.href).toBe('');
		expect(divStopLabel.stop).toBe('01');
		expect(headingStopLabel.as).toBe('h1');
		expect(comboboxProps.open).toBe(false);
		expect(separatorDefault.variant).toBe('default');
		expect(separatorHazard.maxWidth).toBe('100%');
		expect(separatorGradient.variant).toBe('gradient');
		expect(singleToggle.type).toBe('single');
		expect(multipleToggle.type).toBe('multiple');
		expect(toggleItem.value).toBe('one');
		expect(sheetRoot.open).toBe(false);
		expect(sheetTrigger).toEqual({});
		expect(sheetClose).toEqual({});
		expect(sheetPortal.disabled).toBe(true);
		expect(sheetContent.closeLabel).toBe('Close panel');
		expect(sheetOverlay).toEqual({});
		expect(sheetHeader).toEqual({});
		expect(sheetFooter).toEqual({});
		expect(sheetTitle).toEqual({});
		expect(sheetDescription).toEqual({});
	});
});
