import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function compareText(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

const RAW_POLICY = {
	schema: 1,
	lineRule: 'trimmed-nonblank-lf-normalized',
	generatedHeaderScanLines: 5,
	generatedFrontmatterMaxLines: 10,
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
			source: String.raw`^\s*(?:\/\/+|#+|\/\*+|\*+|<!--)\s*(?:@generated\b|auto(?:matically)?[- ]generated\b|code\s+generated\b|generated(?:\s+(?:file|by|from)\b|:)|do\s+not\s+edit\b)`,
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
			.sort(([left], [right]) => compareText(left, right))
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

function deepFreeze<T>(value: T): T {
	if (value && typeof value === 'object' && !Object.isFrozen(value)) {
		for (const item of Object.values(value)) deepFreeze(item);
		Object.freeze(value);
	}
	return value;
}

export const SCORECARD_POLICY = deepFreeze({
	...structuredClone(RAW_POLICY),
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

function hasGeneratedHeader(source: string): boolean {
	const lines = source.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
	const scanLines =
		lines[0]?.trim() === '---'
			? SCORECARD_POLICY.generatedFrontmatterMaxLines
			: SCORECARD_POLICY.generatedHeaderScanLines;
	const candidates = lines.slice(0, scanLines);
	return GENERATED_HEADER.test(candidates.join('\n'));
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
		if (hasGeneratedHeader(source)) {
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

type UnknownRecord = Record<string, unknown>;

function record(value: unknown, label: string): UnknownRecord {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`${label} must be a mapping`);
	}
	return value as UnknownRecord;
}

function workflowDocument(path: string, source: string): UnknownRecord {
	const document = parseDocument(source, {
		prettyErrors: false,
		uniqueKeys: true,
	});
	if (document.errors.length > 0) {
		throw new Error(`${path} is invalid YAML: ${document.errors.map((error) => error.message).join('; ')}`);
	}
	return record(document.toJS({ maxAliasCount: 100 }), path);
}

function jobsInWorkflow(path: string, workflow: UnknownRecord): Array<JobInventory & { value: UnknownRecord }> {
	const jobs = record(workflow.jobs, `${path} jobs`);
	const entries = Object.entries(jobs);
	if (entries.length === 0) throw new Error(`${path} has no jobs`);
	return entries.map(([id, value]) => {
		const job = record(value, `${path} job ${id}`);
		const timeout = job['timeout-minutes'];
		return {
			id,
			timeout: typeof timeout === 'number' && Number.isSafeInteger(timeout) && timeout > 0,
			value: job,
		};
	});
}

function visitValues(
	value: unknown,
	visitor: (value: unknown, key: string | null) => void,
	key: string | null = null,
): void {
	visitor(value, key);
	if (Array.isArray(value)) {
		for (const item of value) visitValues(item, visitor);
		return;
	}
	if (value && typeof value === 'object') {
		for (const [childKey, item] of Object.entries(value)) visitValues(item, visitor, childKey);
	}
}

function visitWorkflowSteps(job: UnknownRecord, visitor: (step: UnknownRecord) => void): void {
	if (!Object.hasOwn(job, 'steps')) return;
	if (!Array.isArray(job.steps)) throw new Error('Workflow job steps must be an array');
	for (const [index, value] of job.steps.entries()) {
		visitor(record(value, `workflow step[${index}]`));
	}
}

function quotedEnd(value: string, start: number): number {
	const quote = value[start]!;
	for (let index = start + 1; index < value.length; index += 1) {
		if (value[index] !== quote) continue;
		if (quote === "'" && value[index + 1] === "'") {
			index += 1;
			continue;
		}
		if (quote === '"' && value[index - 1] === '\\') continue;
		return index + 1;
	}
	return value.length;
}

function githubExpressionBodies(value: string, implicit = false): string[] {
	const bodies: string[] = [];
	let search = 0;
	while (search < value.length) {
		const start = value.indexOf('${{', search);
		if (start < 0) break;
		let cursor = start + 3;
		for (; cursor < value.length; cursor += 1) {
			if (value[cursor] === "'" || value[cursor] === '"') {
				cursor = quotedEnd(value, cursor) - 1;
				continue;
			}
			if (value.startsWith('}}', cursor)) break;
		}
		if (cursor >= value.length) throw new Error('Unterminated GitHub expression');
		bodies.push(value.slice(start + 3, cursor));
		search = cursor + 2;
	}
	return bodies.length > 0 ? bodies : implicit ? [value] : [];
}

function secretNamesInExpression(expression: string): string[] {
	const names: string[] = [];
	for (let index = 0; index < expression.length; index += 1) {
		if (expression[index] === "'" || expression[index] === '"') {
			index = quotedEnd(expression, index) - 1;
			continue;
		}
		if (
			expression.slice(index, index + 'secrets'.length).toLowerCase() !== 'secrets' ||
			/[A-Za-z0-9_.]/u.test(expression[index - 1] ?? '')
		) {
			continue;
		}
		let cursor = index + 'secrets'.length;
		if (/[A-Za-z0-9_]/u.test(expression[cursor] ?? '')) continue;
		while (/\s/u.test(expression[cursor] ?? '')) cursor += 1;
		if (expression[cursor] === '.') {
			cursor += 1;
			while (/\s/u.test(expression[cursor] ?? '')) cursor += 1;
			const match = expression.slice(cursor).match(/^([A-Za-z_][A-Za-z0-9_]*)/u);
			if (match) names.push(match[1]!.toUpperCase());
			continue;
		}
		if (expression[cursor] !== '[') continue;
		cursor += 1;
		while (/\s/u.test(expression[cursor] ?? '')) cursor += 1;
		const quote = expression[cursor];
		if (quote !== "'" && quote !== '"') continue;
		const match = expression.slice(cursor + 1).match(/^([A-Za-z_][A-Za-z0-9_]*)/u);
		if (!match) continue;
		cursor += match[1]!.length + 1;
		if (expression[cursor] !== quote) continue;
		cursor += 1;
		while (/\s/u.test(expression[cursor] ?? '')) cursor += 1;
		if (expression[cursor] === ']') names.push(match[1]!.toUpperCase());
	}
	return names;
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
	const workflowDetails: Array<{
		path: string;
		jobs: number;
		capped: number;
		uncapped: number;
	}> = [];
	let total = 0;
	let capped = 0;
	for (const entry of workflowEntries) {
		const source = decoder.decode(blobs.get(entry.path));
		const workflow = workflowDocument(entry.path, source);
		const jobs = jobsInWorkflow(entry.path, workflow);
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
		const secrets = new Set<string>();
		const captureSecrets = (value: string, implicit = false): void => {
			for (const expression of githubExpressionBodies(value, implicit)) {
				for (const name of secretNamesInExpression(expression)) secrets.add(name);
			}
		};
		visitValues(workflow, (value) => {
			if (typeof value === 'string') captureSecrets(value);
		});
		for (const job of jobs) {
			if (typeof job.value.if === 'string') captureSecrets(job.value.if, true);
			visitWorkflowSteps(job.value, (step) => {
				if (typeof step.uses === 'string') {
					const match = step.uses.match(
						/^mgkdante\/yesid\.dev-design\/\.github\/actions\/(classify-paths|required-context|shared-tooling-drift)@([A-Za-z0-9._/-]+)$/u,
					);
					if (match)
						sharedCallers.push({
							path: entry.path,
							action: match[1]!,
							ref: match[2]!,
						});
				}
				if (typeof step.if === 'string') captureSecrets(step.if, true);
			});
		}
		for (const name of secrets) secretReferences.push({ path: entry.path, name });
	}
	for (const values of [uncappedJobs, workflowDetails, sharedCallers, secretReferences]) {
		values.sort((left, right) => compareText(canonicalJson(left), canonicalJson(right)));
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

const GITHUB_CONCLUSIONS = new Set([
	'action_required',
	'cancelled',
	'failure',
	'neutral',
	'skipped',
	'stale',
	'startup_failure',
	'success',
	'timed_out',
]);

const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/u;

function timestamp(value: string, label: string): number {
	const match = value.match(RFC3339);
	if (!match) throw new Error(`Invalid ${label} RFC3339 timestamp ${value}`);
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const hour = Number(match[4]);
	const minute = Number(match[5]);
	const second = Number(match[6]);
	const offset = match[8]!;
	const offsetHour = offset === 'Z' ? 0 : Number(offset.slice(1, 3));
	const offsetMinute = offset === 'Z' ? 0 : Number(offset.slice(4, 6));
	const daysInMonth = month >= 1 && month <= 12 ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0;
	if (
		year < 1 ||
		month < 1 ||
		month > 12 ||
		day < 1 ||
		day > daysInMonth ||
		hour > 23 ||
		minute > 59 ||
		second > 59 ||
		offsetHour > 23 ||
		offsetMinute > 59
	) {
		throw new Error(`Invalid ${label} RFC3339 timestamp ${value}`);
	}
	const parsed = Date.parse(value);
	if (!Number.isFinite(parsed)) throw new Error(`Invalid ${label} timestamp ${value}`);
	return parsed;
}

function exactRecord(value: unknown, label: string, fields: readonly string[]): UnknownRecord {
	const result = record(value, label);
	const keys = Object.keys(result);
	const missing = fields.filter((field) => !Object.hasOwn(result, field));
	const unexpected = keys.filter((field) => !fields.includes(field));
	if (missing.length > 0 || unexpected.length > 0) {
		throw new Error(
			`${label} fields invalid; missing ${missing.join(', ') || 'none'}; unexpected ${unexpected.join(', ') || 'none'}`,
		);
	}
	return result;
}

function githubConclusion(value: unknown, label: string): string {
	if (typeof value !== 'string' || !GITHUB_CONCLUSIONS.has(value)) {
		throw new Error(`Invalid ${label} conclusion ${String(value)}`);
	}
	return value;
}

function nullableTimestamp(value: unknown, label: string): string | null {
	if (value === null) return null;
	if (typeof value !== 'string') throw new Error(`${label} must be an RFC3339 string or null`);
	timestamp(value, label);
	return value;
}

function normalizedRun(value: unknown, index: number): NormalizedRun {
	const run = exactRecord(value, `run[${index}]`, ['id', 'attempt', 'conclusion', 'createdAt', 'updatedAt', 'jobs']);
	const id = run.id;
	if (!(
		(typeof id === 'number' && Number.isSafeInteger(id) && id > 0) ||
		(typeof id === 'string' && /^[1-9][0-9]*$/u.test(id))
	)) {
		throw new Error(`Invalid run[${index}] id`);
	}
	if (typeof run.attempt !== 'number' || !Number.isSafeInteger(run.attempt) || run.attempt < 1) {
		throw new Error(`Invalid attempt for run ${String(id)}`);
	}
	if (typeof run.createdAt !== 'string' || typeof run.updatedAt !== 'string') {
		throw new Error(`Run ${String(id)} timestamps must be RFC3339 strings`);
	}
	timestamp(run.createdAt, `${String(id)} createdAt`);
	timestamp(run.updatedAt, `${String(id)} updatedAt`);
	if (!Array.isArray(run.jobs)) throw new Error(`Run ${String(id)} jobs must be an array`);
	const jobs = run.jobs.map((value, jobIndex): NormalizedJob => {
		const job = exactRecord(value, `run ${String(id)} job[${jobIndex}]`, [
			'name',
			'conclusion',
			'startedAt',
			'completedAt',
		]);
		if (typeof job.name !== 'string' || job.name.trim().length === 0) {
			throw new Error(`Run ${String(id)} job[${jobIndex}] has invalid name`);
		}
		return {
			name: job.name,
			conclusion: githubConclusion(job.conclusion, `run ${String(id)} job ${job.name}`),
			startedAt: nullableTimestamp(job.startedAt, `run ${String(id)} job ${job.name} startedAt`),
			completedAt: nullableTimestamp(job.completedAt, `run ${String(id)} job ${job.name} completedAt`),
		};
	});
	return {
		id,
		attempt: run.attempt,
		conclusion: githubConclusion(run.conclusion, `run ${String(id)}`),
		createdAt: run.createdAt,
		updatedAt: run.updatedAt,
		jobs,
	};
}

function elapsedMilliseconds(start: number, end: number, label: string): number {
	if (end < start) throw new Error(`${label} ends before it starts`);
	return end - start;
}

function seconds(start: number, end: number, label: string): number {
	return elapsedMilliseconds(start, end, label) / 1000;
}

function nearestRank(values: readonly number[], percentile: number): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((left, right) => left - right);
	return sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)]!;
}

export function reduceRuns(input: readonly unknown[]) {
	if (!Array.isArray(input)) throw new Error('Run input must be an array');
	const runs = input.map(normalizedRun);
	const identities = new Set<string>();
	const walls: number[] = [];
	const queues: number[] = [];
	const conclusions: Record<string, number> = {};
	let reruns = 0;
	let runnerMilliseconds = 0;
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
			runnerMilliseconds += elapsedMilliseconds(
				timestamp(job.startedAt, `${identity}/${job.name} startedAt`),
				timestamp(job.completedAt, `${identity}/${job.name} completedAt`),
				`${identity}/${job.name}`,
			);
		}
	}
	const sortedConclusions = Object.fromEntries(
		Object.entries(conclusions).sort(([left], [right]) => compareText(left, right)),
	);
	const receipt = {
		schema: 1 as const,
		method: 'wall=createdAt-to-updatedAt; queue=createdAt-to-earliest-job-start; nearest-rank; runner=sum-nonskipped-job-wall',
		runs: runs.length,
		reruns,
		conclusions: sortedConclusions,
		wallSeconds: { p50: nearestRank(walls, 0.5), p95: nearestRank(walls, 0.95) },
		queueSeconds: { p50: nearestRank(queues, 0.5), p95: nearestRank(queues, 0.95) },
		runnerSeconds: runnerMilliseconds / 1000,
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
