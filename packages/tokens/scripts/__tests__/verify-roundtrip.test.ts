import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import tokens from '../../tokens.json' with { type: 'json' };
import { parseTokens } from '../../src/parse.ts';
import { buildVariables } from '../push-to-figma.ts';

const packageRoot = resolve(import.meta.dirname, '../..');
const temporaryDirectories: string[] = [];
const terminalControls =
  /(?:[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]|\p{Bidi_Control})/u;

function temporaryPath(name: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'yesid-roundtrip-'));
  temporaryDirectories.push(directory);
  return join(directory, name);
}

function run(snapshotPath: string) {
  return spawnSync('bun', ['run', '--silent', 'figma:verify', '--', snapshotPath], {
    cwd: packageRoot,
    encoding: 'utf8',
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('verify-roundtrip CLI', () => {
  it('returns 0 with stderr-only output for canonical 161-variable parity', () => {
    const snapshotPath = temporaryPath('snapshot.json');
    writeFileSync(
      snapshotPath,
      `${JSON.stringify(buildVariables(parseTokens(tokens)), null, 2)}\n`,
    );

    const result = run(snapshotPath);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('roundtrip: expected=161 actual=161');
    expect(result.stderr).toContain('OK: 161 variables in parity');
  });

  it('returns 1 and reports VALUE_DRIFT for a mutated value', () => {
    const variables = buildVariables(parseTokens(tokens));
    const nav = variables.find((variable) => variable.name === 'z/nav');
    if (!nav) throw new Error('canonical fixture is missing z/nav');
    nav.values.default = 71;
    const snapshotPath = temporaryPath('mutated.json');
    writeFileSync(snapshotPath, `${JSON.stringify(variables, null, 2)}\n`);

    const result = run(snapshotPath);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(
      'VALUE_DRIFT z/nav mode=default expected=70 actual=71',
    );
  });

  it('returns 2 with a tool-neutral error when the snapshot is missing', () => {
    const missingPath = temporaryPath('missing.json');

    const result = run(missingPath);

    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(`cannot read snapshot ${missingPath}`);
    expect(result.stderr).toContain('Operator contract:');
    expect(result.stderr).toContain('After owner approval, import it using any compatible workflow.');
    expect(result.stderr).toContain('This verifier only reads exported state; it never writes remotely.');
    expect(result.stderr).not.toMatch(/Task 3\.5|orchestrator|MCP|use_figma/i);
  });

  it('terminal-encodes a non-array snapshot filename', () => {
    const snapshotPath = temporaryPath('snapshot\u001b]2;path\u0007.json');
    writeFileSync(snapshotPath, '{}\n');

    const result = run(snapshotPath);

    expect(result.status).toBe(2);
    expect(result.stderr).not.toMatch(terminalControls);
    expect(result.stderr).toContain('snapshot\\u001b]2;path\\u0007.json');
  });

  it.each([
    [
      'unexpected property',
      2,
      (variables: ReturnType<typeof buildVariables>, control: string) => {
        Object.assign(variables[0]!, { [`unexpected${control}`]: true });
      },
    ],
    [
      'variable name',
      1,
      (variables: ReturnType<typeof buildVariables>, control: string) => {
        variables[0]!.name += control;
      },
    ],
    [
      'mode name',
      1,
      (variables: ReturnType<typeof buildVariables>, control: string) => {
        const variable = variables[0]!;
        const [mode, value] = Object.entries(variable.values)[0]!;
        variable.values = { [`${mode}${control}`]: value };
      },
    ],
    [
      'string value',
      1,
      (variables: ReturnType<typeof buildVariables>, control: string) => {
        const variable = variables.find(({ type }) => type === 'STRING')!;
        const mode = Object.keys(variable.values)[0]!;
        variable.values[mode] = `${variable.values[mode]}${control}`;
      },
    ],
  ] as const)('terminal-encodes control bytes from a snapshot %s', (_label, status, mutate) => {
    const variables = buildVariables(parseTokens(tokens));
    const control = '\u001b]2;roundtrip-control\u0007\u009b31m\u061c\u200e\u200f\u2028\u2029\u202e';
    mutate(variables, control);
    const snapshotPath = temporaryPath('terminal-control.json');
    writeFileSync(snapshotPath, `${JSON.stringify(variables, null, 2)}\n`);

    const result = run(snapshotPath);

    expect(result.status).toBe(status);
    expect(result.stdout).toBe('');
    expect(result.stderr).not.toMatch(terminalControls);
    expect(result.stderr).toContain('\\u001b');
    expect(result.stderr).toContain('\\u0007');
    expect(result.stderr).toContain('\\u009b');
    expect(result.stderr).toContain('\\u061c');
    expect(result.stderr).toContain('\\u200e');
    expect(result.stderr).toContain('\\u200f');
    expect(result.stderr).toContain('\\u2028');
    expect(result.stderr).toContain('\\u2029');
    expect(result.stderr).toContain('\\u202e');
  });
});
