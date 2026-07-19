export type AxeViolation = Readonly<{
	id: string;
	impact?: string | null;
}>;

export function blockingAxeViolations<T extends AxeViolation>(
	violations: readonly T[],
): readonly T[] {
	return violations.filter(({ impact }) => impact === 'serious' || impact === 'critical');
}
