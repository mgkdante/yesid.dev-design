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

function temporaryPath(name: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'yesid-roundtrip-'));
  temporaryDirectories.push(directory);
  return join(directory, name);
}

function run(snapshotPath: string) {
	return spawnSync('bun', ['run', 'figma:verify', '--', snapshotPath], {
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
});
