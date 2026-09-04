export type VariableType = 'COLOR' | 'FLOAT' | 'STRING';

export interface FigmaVariable {
  name: string;
  type: VariableType;
  values: Record<string, string | number>;
  description?: string;
}

export type Finding =
  | { kind: 'MISSING'; name: string }
  | { kind: 'UNEXPECTED'; name: string }
  | { kind: 'TYPE_DRIFT'; name: string; expected: VariableType; actual: VariableType }
  | { kind: 'MODE_DRIFT'; name: string; expected: string[]; actual: string[] }
  | {
      kind: 'VALUE_DRIFT';
      name: string;
      mode: string;
      expected: string | number;
      actual: string | number;
    };

const variableKeys = new Set(['name', 'type', 'values', 'description']);
const colorPattern = /^#[0-9a-fA-F]{6}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(source: string, index: number, detail: string): never {
  throw new Error(`${source}: item at index ${index} ${detail}`);
}

function validateValue(
  source: string,
  index: number,
  name: string,
  mode: string,
  type: VariableType,
  value: unknown,
): asserts value is string | number {
  const location = `variable "${name}" mode "${mode}"`;
  if (type === 'COLOR' && (typeof value !== 'string' || !colorPattern.test(value))) {
    fail(source, index, `${location} COLOR value must be a six-hex string`);
  }
  if (type === 'FLOAT' && (typeof value !== 'number' || !Number.isFinite(value))) {
    fail(source, index, `${location} FLOAT value must be a finite number`);
  }
  if (type === 'STRING' && typeof value !== 'string') {
    fail(source, index, `${location} STRING value must be a string`);
  }
}

export function parseVariableArray(parsed: unknown, source: string): FigmaVariable[] {
  if (!Array.isArray(parsed)) {
    throw new Error(`${source}: expected a JSON array of variables`);
  }

  const names = new Set<string>();
  const variables: FigmaVariable[] = [];

  for (const [index, item] of parsed.entries()) {
    if (!isRecord(item)) fail(source, index, 'must be an object');

    const unexpectedKey = Object.keys(item).find((key) => !variableKeys.has(key));
    if (unexpectedKey) fail(source, index, `has unexpected property "${unexpectedKey}"`);

    if (typeof item.name !== 'string' || item.name.trim() === '') {
      fail(source, index, 'name must be a non-empty string');
    }
    if (names.has(item.name)) {
      throw new Error(`${source}: duplicate variable name "${item.name}"`);
    }
    names.add(item.name);

    if (item.type !== 'COLOR' && item.type !== 'FLOAT' && item.type !== 'STRING') {
      fail(source, index, 'type must be COLOR, FLOAT, or STRING');
    }
    if (!isRecord(item.values)) fail(source, index, 'values must be an object');

    const entries = Object.entries(item.values);
    if (entries.length === 0) fail(source, index, 'values must contain at least one mode');
    for (const [mode, value] of entries) {
      if (mode.trim() === '') fail(source, index, 'mode name must be a non-empty string');
      validateValue(source, index, item.name, mode, item.type, value);
    }

    if (item.description !== undefined && typeof item.description !== 'string') {
      fail(source, index, 'description must be a string when present');
    }

    variables.push(item as unknown as FigmaVariable);
  }

  return variables;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function valuesEqual(type: VariableType, expected: string | number, actual: string | number): boolean {
  if (type === 'COLOR') {
    return (expected as string).toLowerCase() === (actual as string).toLowerCase();
  }
  return expected === actual;
}

export function diffVariables(expected: FigmaVariable[], actual: FigmaVariable[]): Finding[] {
  const expectedByName = new Map(expected.map((variable) => [variable.name, variable]));
  const actualByName = new Map(actual.map((variable) => [variable.name, variable]));
  const findings: Finding[] = [];

  for (const name of expectedByName.keys()) {
    if (!actualByName.has(name)) findings.push({ kind: 'MISSING', name });
  }
  for (const name of actualByName.keys()) {
    if (!expectedByName.has(name)) findings.push({ kind: 'UNEXPECTED', name });
  }

  for (const [name, expectedVariable] of expectedByName) {
    const actualVariable = actualByName.get(name);
    if (!actualVariable) continue;

    if (expectedVariable.type !== actualVariable.type) {
      findings.push({
        kind: 'TYPE_DRIFT',
        name,
        expected: expectedVariable.type,
        actual: actualVariable.type,
      });
    }

    const expectedModes = Object.keys(expectedVariable.values).sort(compareText);
    const actualModes = Object.keys(actualVariable.values).sort(compareText);
    if (
      expectedModes.length !== actualModes.length ||
      expectedModes.some((mode, index) => mode !== actualModes[index])
    ) {
      findings.push({ kind: 'MODE_DRIFT', name, expected: expectedModes, actual: actualModes });
    }

    if (expectedVariable.type !== actualVariable.type) continue;
    for (const mode of expectedModes) {
      if (!(mode in actualVariable.values)) continue;
      const expectedValue = expectedVariable.values[mode]!;
      const actualValue = actualVariable.values[mode]!;
      if (!valuesEqual(expectedVariable.type, expectedValue, actualValue)) {
        findings.push({
          kind: 'VALUE_DRIFT',
          name,
          mode,
          expected: expectedValue,
          actual: actualValue,
        });
      }
    }
  }

  return sortFindings(findings);
}

function sortFindings(findings: Finding[]): Finding[] {
  const order: Record<Finding['kind'], number> = {
    MISSING: 0,
    UNEXPECTED: 1,
    TYPE_DRIFT: 2,
    MODE_DRIFT: 3,
    VALUE_DRIFT: 4,
  };
  return [...findings].sort((a, b) => {
    const byKind = order[a.kind] - order[b.kind];
    if (byKind !== 0) return byKind;
    const byName = compareText(a.name, b.name);
    if (byName !== 0) return byName;
    if (a.kind === 'VALUE_DRIFT' && b.kind === 'VALUE_DRIFT') {
      return compareText(a.mode, b.mode);
    }
    return 0;
  });
}

function displayValue(value: string | number): string {
  return JSON.stringify(value);
}

export function formatFinding(finding: Finding): string {
  switch (finding.kind) {
    case 'MISSING':
      return `MISSING ${finding.name}`;
    case 'UNEXPECTED':
      return `UNEXPECTED ${finding.name}`;
    case 'TYPE_DRIFT':
      return `TYPE_DRIFT ${finding.name} expected=${finding.expected} actual=${finding.actual}`;
    case 'MODE_DRIFT':
      return `MODE_DRIFT ${finding.name} expected=[${finding.expected.join(',')}] actual=[${finding.actual.join(',')}]`;
    case 'VALUE_DRIFT':
      return `VALUE_DRIFT ${finding.name} mode=${finding.mode} expected=${displayValue(finding.expected)} actual=${displayValue(finding.actual)}`;
  }
}
