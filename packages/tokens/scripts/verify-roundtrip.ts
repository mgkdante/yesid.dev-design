#!/usr/bin/env bun
// Verify round-trip parity between tokens.json (via push-to-figma.ts) and the
// Figma-side Variables exported by the orchestrator into .tmp.figma-export.json.
// Compares names, types, and mode keys only — value serialization deltas are
// acceptable per spec § 3.5 (Figma may reformat numbers / hex casing).
//
// Output convention: stderr only. Stdout stays empty so the script composes
// cleanly in CI pipelines that may capture stdout for other purposes.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Minimal ambient for Bun.spawn — `bun-types` isn't hoisted into this package's
// node_modules and adding it just to type one call would balloon devDependencies.
// Surface-area: only what we actually call below.
declare const Bun: {
  spawn(cmd: string[], options: { stdout: 'pipe'; stderr: 'pipe' }): {
    stdout: ReadableStream<Uint8Array>;
    stderr: ReadableStream<Uint8Array>;
    exited: Promise<number>;
  };
};

interface FigmaVariable {
  name: string;
  type: 'COLOR' | 'FLOAT' | 'STRING';
  values: Record<string, string | number>;
  description?: string;
}

type Finding =
  | { kind: 'MISSING'; name: string }
  | { kind: 'UNEXPECTED'; name: string }
  | { kind: 'TYPE_DRIFT'; name: string; expected: string; actual: string }
  | { kind: 'MODE_DRIFT'; name: string; expected: string[]; actual: string[] };

const here = dirname(fileURLToPath(import.meta.url));
const EXPORT_FILE = resolve(here, '../.tmp.figma-export.json');
const PUSH_SCRIPT = resolve(here, 'push-to-figma.ts');
// Names of the orchestration step (referenced in error messages) so a human
// landing on this script knows where the missing file is supposed to come from.
const ORCHESTRATOR_HINT =
  'Task 3.5 / orchestrator: call the figma-remote MCP `use_figma` tool and write the variables to packages/tokens/.tmp.figma-export.json before running this script.';

function formatType(value: FigmaVariable['type']): string {
  return value;
}

function isFigmaVariable(value: unknown): value is FigmaVariable {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.name !== 'string') return false;
  if (v.type !== 'COLOR' && v.type !== 'FLOAT' && v.type !== 'STRING') return false;
  if (typeof v.values !== 'object' || v.values === null) return false;
  if (v.description !== undefined && typeof v.description !== 'string') return false;
  return true;
}

function parseFigmaVariableArray(parsed: unknown, source: string): FigmaVariable[] {
  if (!Array.isArray(parsed)) {
    throw new Error(`${source}: expected a JSON array of FigmaVariable, got ${typeof parsed}`);
  }
  for (const [i, item] of parsed.entries()) {
    if (!isFigmaVariable(item)) {
      throw new Error(`${source}: item at index ${i} is not a valid FigmaVariable`);
    }
  }
  // Loop above validated every item; cast is safe but TS can't infer it.
  return parsed as FigmaVariable[];
}

// Pure diff. Sort order: MISSING, then UNEXPECTED, then TYPE_DRIFT, then
// MODE_DRIFT — alphabetical within each bucket. Stable order makes the
// output diffable across CI runs.
function diff(expected: FigmaVariable[], actual: FigmaVariable[]): Finding[] {
  const expectedByName = new Map(expected.map((v) => [v.name, v]));
  const actualByName = new Map(actual.map((v) => [v.name, v]));

  const findings: Finding[] = [];

  for (const name of expectedByName.keys()) {
    if (!actualByName.has(name)) {
      findings.push({ kind: 'MISSING', name });
    }
  }
  for (const name of actualByName.keys()) {
    if (!expectedByName.has(name)) {
      findings.push({ kind: 'UNEXPECTED', name });
    }
  }

  // Per-name comparisons only on names that exist in both.
  for (const [name, exp] of expectedByName) {
    const act = actualByName.get(name);
    if (!act) continue;
    if (exp.type !== act.type) {
      findings.push({
        kind: 'TYPE_DRIFT',
        name,
        expected: formatType(exp.type),
        actual: formatType(act.type),
      });
    }
    const expModes = Object.keys(exp.values).sort();
    const actModes = Object.keys(act.values).sort();
    if (expModes.length !== actModes.length || expModes.some((m, i) => m !== actModes[i])) {
      findings.push({
        kind: 'MODE_DRIFT',
        name,
        expected: expModes,
        actual: actModes,
      });
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
  };
  return [...findings].sort((a, b) => {
    if (order[a.kind] !== order[b.kind]) return order[a.kind] - order[b.kind];
    return a.name.localeCompare(b.name);
  });
}

function formatFinding(f: Finding): string {
  switch (f.kind) {
    case 'MISSING':
      return `MISSING ${f.name}`;
    case 'UNEXPECTED':
      return `UNEXPECTED ${f.name}`;
    case 'TYPE_DRIFT':
      return `TYPE_DRIFT ${f.name} expected=${f.expected} actual=${f.actual}`;
    case 'MODE_DRIFT':
      return `MODE_DRIFT ${f.name} expected=[${f.expected.join(',')}] actual=[${f.actual.join(',')}]`;
  }
}

async function loadExpected(): Promise<FigmaVariable[]> {
  // Re-use push-to-figma.ts as the source of truth rather than reimplementing
  // its flatten/bucket logic — single point of drift.
  const proc = Bun.spawn(['bun', 'run', PUSH_SCRIPT], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  // Drain stdout + stderr concurrently — sequential drains can deadlock if the
  // child fills one pipe's buffer while we're waiting on the other.
  const [stdoutText, stderrText] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(
      `push-to-figma.ts exited with code ${exitCode}.\nstderr:\n${stderrText.trim() || '(empty)'}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdoutText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`push-to-figma.ts stdout is not valid JSON: ${msg}`);
  }
  return parseFigmaVariableArray(parsed, 'push-to-figma.ts stdout');
}

function loadActual(): FigmaVariable[] {
  let raw: string;
  try {
    raw = readFileSync(EXPORT_FILE, 'utf-8');
  } catch {
    // ENOENT or any other read error — treat as missing-file case.
    throw new Error(
      `verify-roundtrip: cannot read ${EXPORT_FILE}.\n${ORCHESTRATOR_HINT}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`${EXPORT_FILE} is not valid JSON: ${msg}`);
  }
  return parseFigmaVariableArray(parsed, EXPORT_FILE);
}

async function main(): Promise<void> {
  const actual = loadActual();
  const expected = await loadExpected();

  console.error(`roundtrip: expected=${expected.length} actual=${actual.length}`);
  const findings = diff(expected, actual);
  for (const f of findings) {
    console.error(formatFinding(f));
  }
  if (findings.length === 0) {
    console.error(`OK: ${expected.length} variables in parity`);
    process.exit(0);
  }
  console.error(`DRIFT: ${findings.length} issues — review above`);
  process.exit(1);
}

try {
  await main();
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg);
  process.exit(1);
}
