import { describe, expect, it } from 'vitest';
import tokens from '../../tokens.json' with { type: 'json' };
import { parseTokens } from '../../src/parse.ts';
import { buildVariables, type FigmaVariable } from '../push-to-figma.ts';
import {
  diffVariables,
  parseVariableArray,
} from '../roundtrip-contract.ts';

const variable = (
  overrides: Partial<FigmaVariable> = {},
): FigmaVariable => ({
  name: 'color/primary',
  type: 'COLOR',
  values: { default: '#AABBCC' },
  ...overrides,
});

describe('roundtrip snapshot parsing', () => {
  it('accepts the canonical 161-variable generator output', () => {
    const generated = buildVariables(parseTokens(tokens));

    expect(parseVariableArray(generated, 'canonical')).toHaveLength(161);
  });

  it('rejects duplicate variable names', () => {
    expect(() =>
      parseVariableArray([variable(), variable()], 'snapshot'),
    ).toThrow('snapshot: duplicate variable name "color/primary"');
  });

  it.each([
    ['empty name', variable({ name: '  ' }), 'name must be a non-empty string'],
    ['empty values', variable({ values: {} }), 'values must contain at least one mode'],
    [
      'empty mode',
      variable({ values: { '  ': '#AABBCC' } }),
      'mode name must be a non-empty string',
    ],
  ])('rejects %s', (_label, input, message) => {
    expect(() => parseVariableArray([input], 'snapshot')).toThrow(message);
  });

  it.each([
    [
      'COLOR values that are not six-hex strings',
      variable({ values: { default: '#ABC' } }),
      'COLOR value must be a six-hex string',
    ],
    [
      'FLOAT string values',
      variable({ type: 'FLOAT', values: { default: '1' } }),
      'FLOAT value must be a finite number',
    ],
    [
      'non-finite FLOAT values',
      variable({ type: 'FLOAT', values: { default: Number.POSITIVE_INFINITY } }),
      'FLOAT value must be a finite number',
    ],
    [
      'non-string STRING values',
      variable({ type: 'STRING', values: { default: 1 } }),
      'STRING value must be a string',
    ],
  ])('rejects %s', (_label, input, message) => {
    expect(() => parseVariableArray([input], 'snapshot')).toThrow(message);
  });
});

describe('roundtrip semantic comparison', () => {
  it('normalizes only COLOR hex casing', () => {
    expect(
      diffVariables(
        [variable({ values: { default: '#AABBCC' } })],
        [variable({ values: { default: '#aabbcc' } })],
      ),
    ).toEqual([]);
  });

  it('compares finite FLOAT and STRING values exactly', () => {
    const expected: FigmaVariable[] = [
      variable({ name: 'float/value', type: 'FLOAT', values: { default: 1 } }),
      variable({ name: 'string/value', type: 'STRING', values: { default: 'Value' } }),
    ];
    const actual: FigmaVariable[] = [
      variable({ name: 'float/value', type: 'FLOAT', values: { default: 1.0000001 } }),
      variable({ name: 'string/value', type: 'STRING', values: { default: 'value' } }),
    ];

    expect(diffVariables(expected, actual)).toEqual([
      {
        kind: 'VALUE_DRIFT',
        name: 'float/value',
        mode: 'default',
        expected: 1,
        actual: 1.0000001,
      },
      {
        kind: 'VALUE_DRIFT',
        name: 'string/value',
        mode: 'default',
        expected: 'Value',
        actual: 'value',
      },
    ]);
  });

  it('treats signed zero as the same finite JSON number', () => {
    expect(
      diffVariables(
        [variable({ type: 'FLOAT', values: { default: 0 } })],
        [variable({ type: 'FLOAT', values: { default: -0 } })],
      ),
    ).toEqual([]);
  });

  it('ignores descriptions explicitly', () => {
    expect(
      diffVariables(
        [variable({ description: 'source description' })],
        [variable({ description: 'operator description' })],
      ),
    ).toEqual([]);
  });

  it('orders VALUE_DRIFT deterministically by variable name and mode', () => {
    const expected = [
      variable({
        name: 'z/value',
        values: { light: '#111111', dark: '#222222' },
      }),
      variable({ name: 'a/value', values: { default: '#333333' } }),
    ];
    const actual = [
      variable({ name: 'a/value', values: { default: '#444444' } }),
      variable({
        name: 'z/value',
        values: { light: '#555555', dark: '#666666' },
      }),
    ];

    expect(
      diffVariables(expected, actual).map((finding) =>
        finding.kind === 'VALUE_DRIFT'
          ? `${finding.name}:${finding.mode}`
          : finding.kind,
      ),
    ).toEqual(['a/value:default', 'z/value:dark', 'z/value:light']);
  });
});
