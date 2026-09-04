import type { FigmaVariable } from './push-to-figma.ts';

export type VariableType = FigmaVariable['type'];

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
const diagnosticControls = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/gu;

export function diagnosticText(value: string): string {
  return value.replace(diagnosticControls, (character) => {
    const codePoint = character.codePointAt(0)!;
    return `\\u${codePoint.toString(16).padStart(4, '0')}`;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(source: string, index: number, detail: string): never {
  throw new Error(`${diagnosticText(source)}: item at index ${index} ${detail}`);
}

function validateValue(
  source: string,
  index: number,
  name: string,
  mode: string,
  type: VariableType,
  value: unknown,
): asserts value is string | number {
  const location = `variable "${diagnosticText(name)}" mode "${diagnosticText(mode)}"`;
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
    if (unexpectedKey) {
      fail(source, index, `has unexpected property "${diagnosticText(unexpectedKey)}"`);
    }

    if (typeof item.name !== 'string' || item.name.trim() === '') {
      fail(source, index, 'name must be a non-empty string');
    }
    if (names.has(item.name)) {
      throw new Error(
        `${diagnosticText(source)}: duplicate variable name "${diagnosticText(item.name)}"`,
      );
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
  return diagnosticText(JSON.stringify(value));
}

export function formatFinding(finding: Finding): string {
  const name = diagnosticText(finding.name);
  switch (finding.kind) {
    case 'MISSING':
      return `MISSING ${name}`;
    case 'UNEXPECTED':
      return `UNEXPECTED ${name}`;
    case 'TYPE_DRIFT':
      return `TYPE_DRIFT ${name} expected=${finding.expected} actual=${finding.actual}`;
    case 'MODE_DRIFT':
      return `MODE_DRIFT ${name} expected=[${finding.expected.map(diagnosticText).join(',')}] actual=[${finding.actual.map(diagnosticText).join(',')}]`;
    case 'VALUE_DRIFT':
      return `VALUE_DRIFT ${name} mode=${diagnosticText(finding.mode)} expected=${displayValue(finding.expected)} actual=${displayValue(finding.actual)}`;
  }
}
