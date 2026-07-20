import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const RAW_POLICY = {
	schema: 1,
	lineRule: 'trimmed-nonblank-lf-normalized',
	archiveSegments: ['.archive', '_archive', 'archive', 'archived'],
	dependencySegments: ['.venv', 'node_modules', 'venv'],
	vendorSegments: ['third-party', 'third_party', 'vendor', 'vendors'],
	lockfiles: [
		'bun.lock',
		'cargo.lock',
		'composer.lock',
		'package-lock.json',
		'pnpm-lock.yaml',
		'poetry.lock',
		'uv.lock',
		'yarn.lock',
	],
	binaryExtensions: [
		'.7z',
		'.avif',
		'.bin',
		'.br',
		'.eot',
		'.gif',
		'.gz',
		'.ico',
		'.jpeg',
		'.jpg',
		'.mp3',
		'.mp4',
		'.otf',
		'.pdf',
		'.png',
		'.tar',
		'.ttf',
		'.webm',
		'.webp',
		'.woff',
		'.woff2',
		'.zip',
	],
	codeExtensions: [
		'.bash',
		'.c',
		'.cjs',
		'.cpp',
		'.cs',
		'.css',
		'.go',
		'.gql',
		'.graphql',
		'.h',
		'.hpp',
		'.htm',
		'.html',
		'.java',
		'.js',
		'.jsx',
		'.kt',
		'.kts',
		'.less',
		'.lua',
		'.mjs',
		'.php',
		'.proto',
		'.ps1',
		'.py',
		'.r',
		'.rb',
		'.rs',
		'.sass',
		'.scss',
		'.sh',
		'.sql',
		'.svelte',
		'.swift',
		'.ts',
		'.tsx',
		'.vue',
		'.zsh',
	],
	patterns: {
		generatedHeader: {
			source: String.raw`^\s*(?:\/\/|#|\/\*|\*|<!--).*(?:@generated|auto-generated|automatically generated|generated file|do not edit)`,
			flags: 'imu',
		},
		testFilename: {
			source: String.raw`(?:^|[._-])(?:test|spec)(?:[._-]|$)`,
			flags: 'u',
		},
	},
	testSegments: ['__tests__', 'cypress', 'e2e', 'playwright', 'spec', 'specs', 'test', 'tests'],
	configurationSegments: [
		'.github',
		'config',
		'configs',
		'doc',
		'docs',
		'fixture',
		'fixtures',
		'migration',
		'migrations',
		'snapshot',
		'snapshots',
	],
} as const;

function canonical(value: unknown): Json {
	if (value === null || ['boolean', 'number', 'string'].includes(typeof value)) return value as Json;
	if (Array.isArray(value)) return value.map(canonical);
	if (typeof value !== 'object') throw new Error(`Cannot canonicalize ${typeof value}`);
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => [key, canonical(item)]),
	);
}

function canonicalJson(value: unknown): string {
	return JSON.stringify(canonical(value));
}

function sha256(value: string | Uint8Array): string {
	return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function resultDigest(receipt: Readonly<{ source: Readonly<{ revision: string }> }>): string {
	return sha256(canonicalJson({ ...receipt, source: { revision: receipt.source.revision } }));
}

export const SCORECARD_POLICY = Object.freeze({
	...RAW_POLICY,
	digest: sha256(canonicalJson(RAW_POLICY)),
});

interface TreeEntry {
	path: string;
	sha: string;
}

function git(repository: string, args: readonly string[], input?: string): Buffer {
	const result = spawnSync('git', ['-C', repository, ...args], {
		input,
		maxBuffer: 1024 * 1024 * 512,
	});
	if (result.status !== 0) {
		const error = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8') : String(result.stderr);
		throw new Error(`git ${args[0] ?? '<missing>'} failed: ${error.trim()}`);
	}
	return Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout);
}

function resolveRevision(repository: string, revision: string): string {
	const exact = git(repository, ['rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`])
		.toString('utf8')
		.trim();
	if (!/^[0-9a-f]{40}$/u.test(exact)) throw new Error(`Invalid resolved revision ${exact}`);
	return exact;
}

function listTree(repository: string, revision: string): { exact: string; entries: TreeEntry[] } {
	const exact = resolveRevision(repository, revision);
	const records = git(repository, ['ls-tree', '-r', '-z', '--full-tree', exact])
		.toString('utf8')
		.split('\0')
		.filter(Boolean);
	const entries = records.map((record): TreeEntry => {
		const tab = record.indexOf('\t');
		const metadata = tab < 0 ? '' : record.slice(0, tab);
		const path = tab < 0 ? '' : record.slice(tab + 1);
		const match = metadata.match(/^[0-7]{6}\s+blob\s+([0-9a-f]{40})$/u);
		if (!match || !path) throw new Error(`Unsupported git tree entry ${record}`);
		return { path, sha: match[1]! };
	});
	return { exact, entries };
}

function readBlobs(repository: string, entries: readonly TreeEntry[]): Map<string, Buffer> {
	const blobs = new Map<string, Buffer>();
	for (let start = 0; start < entries.length; start += 256) {
		const batch = entries.slice(start, start + 256);
		const output = git(repository, ['cat-file', '--batch'], `${batch.map(({ sha }) => sha).join('\n')}\n`);
		let offset = 0;
		for (const entry of batch) {
			const lineEnd = output.indexOf(0x0a, offset);
			if (lineEnd < 0) throw new Error(`Missing cat-file header for ${entry.path}`);
			const header = output.subarray(offset, lineEnd).toString('utf8');
			const match = header.match(/^([0-9a-f]{40}) blob (\d+)$/u);
			if (!match || match[1] !== entry.sha) throw new Error(`Invalid cat-file header for ${entry.path}`);
			const size = Number(match[2]);
			const bodyStart = lineEnd + 1;
			const bodyEnd = bodyStart + size;
			if (!Number.isSafeInteger(size) || bodyEnd >= output.length || output[bodyEnd] !== 0x0a) {
				throw new Error(`Invalid cat-file body for ${entry.path}`);
			}
			blobs.set(entry.path, output.subarray(bodyStart, bodyEnd));
			offset = bodyEnd + 1;
		}
		if (offset !== output.length) throw new Error('Unexpected trailing cat-file output');
	}
	return blobs;
}

const BINARY_EXTENSIONS = new Set<string>(SCORECARD_POLICY.binaryExtensions);
const CODE_EXTENSIONS = new Set<string>(SCORECARD_POLICY.codeExtensions);
const GENERATED_HEADER = new RegExp(
	SCORECARD_POLICY.patterns.generatedHeader.source,
	SCORECARD_POLICY.patterns.generatedHeader.flags,
);
const TEST_FILENAME = new RegExp(
	SCORECARD_POLICY.patterns.testFilename.source,
	SCORECARD_POLICY.patterns.testFilename.flags,
);

function segments(path: string): string[] {
	return path.toLowerCase().split('/');
}

function hasSegment(path: string, values: readonly string[]): boolean {
	const parts = segments(path);
	return parts.some((part) => values.includes(part));
}

function knownPathExclusion(
	path: string,
): 'binary' | 'dependencies' | 'generated' | 'lockfiles' | 'vendored' | undefined {
	const name = basename(path).toLowerCase();
	if (SCORECARD_POLICY.lockfiles.includes(name as (typeof SCORECARD_POLICY.lockfiles)[number])) {
		return 'lockfiles';
	}
	if (hasSegment(path, SCORECARD_POLICY.dependencySegments)) return 'dependencies';
	if (hasSegment(path, SCORECARD_POLICY.vendorSegments)) return 'vendored';
	if (BINARY_EXTENSIONS.has(extname(name))) return 'binary';
	return undefined;
}

function nonblankLines(source: string): number {
	return source
		.replaceAll('\r\n', '\n')
		.replaceAll('\r', '\n')
		.split('\n')
		.filter((line) => line.trim().length > 0).length;
}

function sourceCategory(path: string): 'code' | 'configuration' | 'tests' {
	const name = basename(path).toLowerCase();
	if (
		hasSegment(path, SCORECARD_POLICY.testSegments) ||
		TEST_FILENAME.test(name)
	) {
		return 'tests';
	}
	if (hasSegment(path, SCORECARD_POLICY.configurationSegments)) return 'configuration';
	return CODE_EXTENSIONS.has(extname(name)) ? 'code' : 'configuration';
}

export interface SourceMeasurementInput {
	repository: string;
	revision: string;
}

export function measureSourceTree(input: SourceMeasurementInput) {
	const repository = resolve(input.repository);
	const { exact, entries } = listTree(repository, input.revision);
	const excluded = { binary: 0, dependencies: 0, generated: 0, lockfiles: 0, vendored: 0 };
	const candidates: TreeEntry[] = [];
	for (const entry of entries) {
		const reason = knownPathExclusion(entry.path);
		if (reason) excluded[reason] += 1;
		else candidates.push(entry);
	}
	const blobs = readBlobs(repository, candidates);
	const lines = { code: 0, tests: 0, configuration: 0, total: 0 };
	const files = { tracked: entries.length, measured: 0, code: 0, tests: 0, configuration: 0 };
	const archived = { files: 0, lines: 0 };
	const decoder = new TextDecoder('utf-8', { fatal: true });
	for (const entry of candidates) {
		let source: string;
		try {
			const blob = blobs.get(entry.path);
			if (!blob) throw new Error(`Missing blob for ${entry.path}`);
			source = decoder.decode(blob);
		} catch {
			excluded.binary += 1;
			continue;
		}
		if (GENERATED_HEADER.test(source.split(/\r?\n/u).slice(0, 5).join('\n'))) {
			excluded.generated += 1;
			continue;
		}
		const count = nonblankLines(source);
		if (hasSegment(entry.path, SCORECARD_POLICY.archiveSegments)) {
			archived.files += 1;
			archived.lines += count;
			continue;
		}
		const category = sourceCategory(entry.path);
		files.measured += 1;
		files[category] += 1;
		lines[category] += count;
		lines.total += count;
	}
	const receipt = {
		schema: 1 as const,
		source: { repository, revision: exact },
		policy: SCORECARD_POLICY,
		files,
		lines,
		archived,
		excluded,
	};
	return { ...receipt, resultDigest: resultDigest(receipt) };
}

interface JobInventory {
	id: string;
	timeout: boolean;
}

function jobsInWorkflow(path: string, source: string): JobInventory[] {
	const lines = source.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
	const start = lines.findIndex((line) => /^jobs:\s*(?:#.*)?$/u.test(line));
	if (start < 0) throw new Error(`${path} has no top-level jobs mapping`);
	const section: string[] = [];
	for (const line of lines.slice(start + 1)) {
		if (/^\S/u.test(line)) break;
		section.push(line);
	}
	const starts: Array<{ id: string; index: number }> = [];
	for (const [index, line] of section.entries()) {
		const match = line.match(/^ {2}(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+)):\s*(?:#.*)?$/u);
		if (match) starts.push({ id: match[1] ?? match[2] ?? match[3]!, index });
	}
	if (starts.length === 0) throw new Error(`${path} has no parseable jobs`);
	return starts.map(({ id, index }, position) => {
		const block = section.slice(index, starts[position + 1]?.index ?? section.length);
		return {
			id,
			timeout: block.some((line) =>
				/^ {4}timeout-minutes:\s*[1-9][0-9]*\s*(?:#.*)?$/u.test(line),
			),
		};
	});
}

export function inventoryWorkflows(input: SourceMeasurementInput) {
	const repository = resolve(input.repository);
	const { exact, entries } = listTree(repository, input.revision);
	const workflowEntries = entries.filter((entry) => /^\.github\/workflows\/[^/]+\.ya?ml$/u.test(entry.path));
	const blobs = readBlobs(repository, workflowEntries);
	const decoder = new TextDecoder('utf-8', { fatal: true });
	const uncappedJobs: string[] = [];
	const sharedCallers: Array<{ path: string; action: string; ref: string }> = [];
	const secretReferences: Array<{ path: string; name: string }> = [];
	const workflowDetails: Array<{ path: string; jobs: number; capped: number; uncapped: number }> = [];
	let total = 0;
	let capped = 0;
	for (const entry of workflowEntries) {
		const source = decoder.decode(blobs.get(entry.path));
		const jobs = jobsInWorkflow(entry.path, source);
		total += jobs.length;
		const cappedHere = jobs.filter((job) => job.timeout).length;
		capped += cappedHere;
		for (const job of jobs.filter((candidate) => !candidate.timeout)) {
			uncappedJobs.push(`${entry.path}:${job.id}`);
		}
		workflowDetails.push({
			path: entry.path,
			jobs: jobs.length,
			capped: cappedHere,
			uncapped: jobs.length - cappedHere,
		});
		for (const match of source.matchAll(
			/uses:\s*["']?mgkdante\/yesid\.dev-design\/\.github\/actions\/(classify-paths|required-context|shared-tooling-drift)@([A-Za-z0-9._/-]+)["']?/gu,
		)) {
			sharedCallers.push({ path: entry.path, action: match[1]!, ref: match[2]! });
		}
		const secrets = new Set([
			...[...source.matchAll(/\bsecrets\.([A-Za-z_][A-Za-z0-9_]*)/gu)].map(
				(match) => match[1]!,
			),
			...[...source.matchAll(/\bsecrets\[['"]([A-Za-z_][A-Za-z0-9_]*)['"]\]/gu)].map(
				(match) => match[1]!,
			),
		]);
		for (const name of secrets) secretReferences.push({ path: entry.path, name });
	}
	for (const values of [uncappedJobs, workflowDetails, sharedCallers, secretReferences]) {
		values.sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
	}
	const receipt = {
		schema: 1 as const,
		source: { repository, revision: exact },
		workflows: workflowEntries.length,
		jobs: { total, capped, uncapped: total - capped },
		workflowDetails,
		uncappedJobs,
		sharedCallers,
		secretReferences,
	};
	return { ...receipt, resultDigest: resultDigest(receipt) };
}

export interface NormalizedJob {
	name: string;
	conclusion: string;
	startedAt: string | null;
	completedAt: string | null;
}

export interface NormalizedRun {
	id: string | number;
	attempt: number;
	conclusion: string;
	createdAt: string;
	updatedAt: string;
	jobs: NormalizedJob[];
}

function timestamp(value: string, label: string): number {
	const parsed = Date.parse(value);
	if (!Number.isFinite(parsed)) throw new Error(`Invalid ${label} timestamp ${value}`);
	return parsed;
}

function seconds(start: number, end: number, label: string): number {
	if (end < start) throw new Error(`${label} ends before it starts`);
	return Math.round(((end - start) / 1000) * 1000) / 1000;
}

function nearestRank(values: readonly number[], percentile: number): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((left, right) => left - right);
	return sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)]!;
}

export function reduceRuns(runs: readonly NormalizedRun[]) {
	const identities = new Set<string>();
	const walls: number[] = [];
	const queues: number[] = [];
	const conclusions: Record<string, number> = {};
	let reruns = 0;
	let runnerSeconds = 0;
	let missingQueue = 0;
	let missingJobTiming = 0;
	for (const run of runs) {
		if (!Number.isSafeInteger(run.attempt) || run.attempt < 1) throw new Error(`Invalid attempt for run ${run.id}`);
		const identity = `${run.id}:${run.attempt}`;
		if (identities.has(identity)) throw new Error(`Duplicate run attempt ${identity}`);
		identities.add(identity);
		if (!run.conclusion) throw new Error(`Run ${identity} has no conclusion`);
		conclusions[run.conclusion] = (conclusions[run.conclusion] ?? 0) + 1;
		if (run.attempt > 1) reruns += 1;
		const created = timestamp(run.createdAt, `${identity} createdAt`);
		walls.push(seconds(created, timestamp(run.updatedAt, `${identity} updatedAt`), `${identity} wall`));
		const starts = run.jobs
			.filter((job) => job.conclusion !== 'skipped')
			.map((job) => (job.startedAt ? timestamp(job.startedAt, `${identity}/${job.name} startedAt`) : null))
			.filter((value): value is number => value !== null);
		if (starts.length === 0) missingQueue += 1;
		else queues.push(seconds(created, Math.min(...starts), `${identity} queue`));
		for (const job of run.jobs) {
			if (job.conclusion === 'skipped') continue;
			if (!job.startedAt || !job.completedAt) {
				missingJobTiming += 1;
				continue;
			}
			runnerSeconds += seconds(
				timestamp(job.startedAt, `${identity}/${job.name} startedAt`),
				timestamp(job.completedAt, `${identity}/${job.name} completedAt`),
				`${identity}/${job.name}`,
			);
		}
	}
	const sortedConclusions = Object.fromEntries(Object.entries(conclusions).sort(([left], [right]) => left.localeCompare(right)));
	const receipt = {
		schema: 1 as const,
		method: 'wall=createdAt-to-updatedAt; queue=createdAt-to-earliest-job-start; nearest-rank; runner=sum-nonskipped-job-wall',
		runs: runs.length,
		reruns,
		conclusions: sortedConclusions,
		wallSeconds: { p50: nearestRank(walls, 0.5), p95: nearestRank(walls, 0.95) },
		queueSeconds: { p50: nearestRank(queues, 0.5), p95: nearestRank(queues, 0.95) },
		runnerSeconds,
		missingQueue,
		missingJobTiming,
	};
	return { ...receipt, digest: sha256(canonicalJson(receipt)) };
}

function options(raw: readonly string[]): Map<string, string> {
	const parsed = new Map<string, string>();
	for (let index = 0; index < raw.length; index += 2) {
		const key = raw[index] ?? '';
		const value = raw[index + 1] ?? '';
		if (!key.startsWith('--') || !value) throw new Error(`Invalid argument ${key || '<missing>'}`);
		if (parsed.has(key)) throw new Error(`Duplicate argument ${key}`);
		parsed.set(key, value);
	}
	return parsed;
}

function exactOptions(parsed: Map<string, string>, expected: readonly string[]): void {
	const unexpected = [...parsed.keys()].filter((key) => !expected.includes(key));
	const missing = expected.filter((key) => !parsed.has(key));
	if (unexpected.length || missing.length) {
		throw new Error(`Expected ${expected.join(', ')}; missing ${missing.join(', ') || 'none'}; unexpected ${unexpected.join(', ') || 'none'}`);
	}
}

export function main(argv = process.argv.slice(2)): number {
	try {
		const [command, ...raw] = argv;
		const parsed = options(raw);
		let receipt: unknown;
		if (command === 'source' || command === 'workflows') {
			exactOptions(parsed, ['--repo', '--rev']);
			const input = { repository: parsed.get('--repo')!, revision: parsed.get('--rev')! };
			receipt = command === 'source' ? measureSourceTree(input) : inventoryWorkflows(input);
		} else if (command === 'runs') {
			exactOptions(parsed, ['--input']);
			const path = parsed.get('--input')!;
			const source = readFileSync(path === '-' ? 0 : path, 'utf8');
			const value = JSON.parse(source) as unknown;
			if (!Array.isArray(value)) throw new Error('Run input must be a JSON array');
			receipt = reduceRuns(value as NormalizedRun[]);
		} else {
			throw new Error('usage: bun tools/phase2-scorecard.ts <source --repo PATH --rev SHA|workflows --repo PATH --rev SHA|runs --input FILE|->');
		}
		console.log(JSON.stringify(receipt, null, 2));
		return 0;
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		return 1;
	}
}

const entrypoint = process.argv[1] ? resolve(process.argv[1]) : '';
if (entrypoint === fileURLToPath(import.meta.url)) process.exitCode = main();
