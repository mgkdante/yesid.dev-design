#!/usr/bin/env bun
// Compare generated variables with a JSON snapshot exported by an operator's
// chosen read workflow. This verifier is read-only and never writes remotely.
// Output convention: stderr only. Exit 0 means parity, 1 drift, and 2 invalid
// input or expected-variable generation failure.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  diagnosticText,
  diffVariables,
  formatFinding,
  parseVariableArray,
} from './roundtrip-contract.ts';
import type { FigmaVariable } from './push-to-figma.ts';

declare const Bun: {
  spawn(cmd: string[], options: { stdout: 'pipe'; stderr: 'pipe' }): {
    stdout: ReadableStream<Uint8Array>;
    stderr: ReadableStream<Uint8Array>;
    exited: Promise<number>;
  };
};

const here = dirname(fileURLToPath(import.meta.url));
const defaultSnapshotPath = resolve(here, '../.tmp.figma-export.json');
const generatorPath = resolve(here, 'push-to-figma.ts');

function diagnosticMessage(value: string): string {
  return value.split('\n').map(diagnosticText).join('\n');
}

function snapshotPathFromArgs(args: string[]): string {
  if (args.length > 1) {
    throw new Error('expected zero or one snapshot path argument');
  }
  return resolve(args[0] ?? defaultSnapshotPath);
}

function parseJson(raw: string, source: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${diagnosticText(source)}: invalid JSON: ${diagnosticText(message)}`);
  }
}

function loadSnapshot(snapshotPath: string): FigmaVariable[] {
  let raw: string;
  try {
    raw = readFileSync(snapshotPath, 'utf8');
  } catch {
    throw new Error(
      `cannot read snapshot ${diagnosticText(snapshotPath)}.\n` +
        `Operator contract:\n` +
        `1. Capture \`bun run --cwd packages/tokens figma:push\` stdout as the proposed variables.\n` +
        `2. After owner approval, import it using any compatible workflow.\n` +
        `3. Export or read back FigmaVariable[] JSON and save the snapshot at ${diagnosticText(snapshotPath)}.\n` +
        `4. Run \`bun run --silent --cwd packages/tokens figma:verify -- ${diagnosticText(snapshotPath)}\`.\n` +
        `This verifier only reads exported state; it never writes remotely.`,
    );
  }
  return parseVariableArray(parseJson(raw, snapshotPath), snapshotPath);
}

async function loadExpected(): Promise<FigmaVariable[]> {
  const child = Bun.spawn([process.execPath, generatorPath], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(
      `expected-variable generation exited with code ${exitCode}: ${diagnosticText(stderr.trim() || '(no diagnostic)')}`,
    );
  }
  return parseVariableArray(
    parseJson(stdout, 'expected-variable generator'),
    'expected-variable generator',
  );
}

async function run(args: string[]): Promise<number> {
  const actual = loadSnapshot(snapshotPathFromArgs(args));
  const expected = await loadExpected();
  const findings = diffVariables(expected, actual);

  console.error(`roundtrip: expected=${expected.length} actual=${actual.length}`);
  for (const finding of findings) console.error(formatFinding(finding));

  if (findings.length === 0) {
    console.error(`OK: ${expected.length} variables in parity`);
    return 0;
  }
  console.error(`DRIFT: ${findings.length} issues — review above`);
  return 1;
}

const isMain = process.argv[1] ? resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (isMain) {
  try {
    process.exitCode = await run(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`verify-roundtrip: ${diagnosticMessage(message)}`);
    process.exitCode = 2;
  }
}
