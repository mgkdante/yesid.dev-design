import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const JOB_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/u;
const EVENT_PATTERN = /^[A-Za-z0-9_]+$/u;
const REASONS = new Set([
	'control',
	'docs-only',
	'empty',
	'force-full',
	'irrelevant',
	'matched',
	'safe-full',
]);
const RUNTIME_KEYS = ['baseSha', 'event', 'headSha', 'repository', 'runAttempt', 'runId'];
const SOURCE_KEYS = [...RUNTIME_KEYS, 'rerun'];

function isRecord(value) {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(message) {
	throw new Error(`required-context: ${message}`);
}

function assertRecord(value, label) {
	if (!isRecord(value)) fail(`${label} must be an object`);
	return value;
}

function assertExactKeys(value, expected, label) {
	const actual = Object.keys(value).sort();
	const wanted = [...expected].sort();
	if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
		fail(`${label} keys must be exactly [${wanted.join(', ')}]; received [${actual.join(', ')}]`);
	}
}

function assertString(value, label) {
	if (typeof value !== 'string' || value.length === 0) fail(`${label} must be a non-empty string`);
	return value;
}

function assertSha(value, label) {
	const sha = assertString(value, label);
	if (!SHA_PATTERN.test(sha)) fail(`${label} must be a lowercase 40-character commit SHA`);
	return sha;
}

function assertPositiveInteger(value, label) {
	if (!Number.isSafeInteger(value) || value < 1) fail(`${label} must be a positive integer`);
	return value;
}

function assertRepository(value, label) {
	const repository = assertString(value, label);
	if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository)) {
		fail(`${label} must be an owner/name binding`);
	}
	const [owner, name] = repository.split('/');
	if (owner === '.' || owner === '..' || name === '.' || name === '..') {
		fail(`${label} must be an owner/name binding`);
	}
	return repository;
}

function assertEvent(value, label) {
	const event = assertString(value, label);
	if (!EVENT_PATTERN.test(event) || event === 'pull_request_target') {
		fail(`${label} is outside the trusted event contract`);
	}
	return event;
}

function assertRunId(value, label) {
	const runId = assertString(value, label);
	if (!/^[1-9][0-9]*$/u.test(runId)) fail(`${label} must be a positive decimal string`);
	return runId;
}

function validateRuntime(value) {
	const runtime = assertRecord(value, 'runtime');
	assertExactKeys(runtime, RUNTIME_KEYS, 'runtime');
	assertRepository(runtime.repository, 'runtime.repository');
	assertEvent(runtime.event, 'runtime.event');
	assertSha(runtime.baseSha, 'runtime.baseSha');
	assertSha(runtime.headSha, 'runtime.headSha');
	assertRunId(runtime.runId, 'runtime.runId');
	assertPositiveInteger(runtime.runAttempt, 'runtime.runAttempt');
	return runtime;
}

function parseClassification(raw) {
	if (typeof raw !== 'string' || raw.length === 0) {
		fail('classifier output "classification" is missing');
	}

	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		fail(`classification JSON is invalid: ${error instanceof Error ? error.message : String(error)}`);
	}

	const classification = assertRecord(parsed, 'classification');
	assertExactKeys(
		classification,
		['files', 'reason', 'relevant', 'rulesDigest', 'schema', 'source'],
		'classification',
	);
	if (classification.schema !== 1) fail('classification.schema must equal 1');

	const source = assertRecord(classification.source, 'classification.source');
	assertExactKeys(source, SOURCE_KEYS, 'classification.source');
	assertRepository(source.repository, 'classification.source.repository');
	assertEvent(source.event, 'classification.source.event');
	assertSha(source.baseSha, 'classification.source.baseSha');
	assertSha(source.headSha, 'classification.source.headSha');
	assertRunId(source.runId, 'classification.source.runId');
	assertPositiveInteger(source.runAttempt, 'classification.source.runAttempt');
	if (typeof source.rerun !== 'boolean') fail('classification.source.rerun must be boolean');
	if (source.rerun !== (source.runAttempt > 1)) {
		fail('classification.source.rerun does not match its run attempt');
	}

	const files = assertRecord(classification.files, 'classification.files');
	assertExactKeys(files, ['complete', 'count', 'digest'], 'classification.files');
	if (files.complete !== true) fail('classification.files.complete must equal true');
	if (!Number.isSafeInteger(files.count) || files.count < 0) {
		fail('classification.files.count must be a non-negative integer');
	}
	if (!DIGEST_PATTERN.test(assertString(files.digest, 'classification.files.digest'))) {
		fail('classification.files.digest must be a sha256 digest');
	}
	if (!DIGEST_PATTERN.test(assertString(classification.rulesDigest, 'classification.rulesDigest'))) {
		fail('classification.rulesDigest must be a sha256 digest');
	}
	const reason = assertString(classification.reason, 'classification.reason');
	if (!REASONS.has(reason)) fail(`classification.reason is invalid: ${reason}`);

	const relevant = assertRecord(classification.relevant, 'classification.relevant');
	if (Object.keys(relevant).length === 0) {
		fail('classification.relevant must contain at least one work job');
	}
	for (const [job, selected] of Object.entries(relevant)) {
		if (!JOB_PATTERN.test(job)) fail(`classification.relevant contains invalid job id "${job}"`);
		if (typeof selected !== 'boolean') {
			fail(`classification.relevant.${job} must be boolean`);
		}
	}
	const selections = Object.values(relevant);
	const anyRelevant = selections.some(Boolean);
	const allRelevant = selections.every(Boolean);
	if (reason === 'empty' && (files.count !== 0 || anyRelevant)) {
		fail('classification reason empty requires zero files and no relevant work');
	}
	if ((reason === 'docs-only' || reason === 'irrelevant') && (files.count === 0 || anyRelevant)) {
		fail(`classification reason ${reason} requires files and no relevant work`);
	}
	if (reason === 'matched' && (files.count === 0 || !anyRelevant)) {
		fail('classification reason matched requires files and relevant work');
	}
	if ((reason === 'control' || reason === 'safe-full') && (files.count === 0 || !allRelevant)) {
		fail(`classification reason ${reason} requires files and all work relevant`);
	}
	if (reason === 'force-full' && !allRelevant) {
		fail('classification reason force-full requires all work relevant');
	}

	return classification;
}

function validateNeed(value, job) {
	const need = assertRecord(value, `needs.${job}`);
	assertExactKeys(need, ['outputs', 'result'], `needs.${job}`);
	assertString(need.result, `needs.${job}.result`);
	assertRecord(need.outputs, `needs.${job}.outputs`);
	return need;
}

function bindClassification(classification, runtime) {
	for (const key of RUNTIME_KEYS) {
		if (classification.source[key] !== runtime[key]) {
			const stale = key === 'runAttempt' || key === 'headSha' ? ' (stale evidence)' : '';
			fail(`classification binding mismatch for ${key}${stale}`);
		}
	}
	if (classification.source.rerun !== (runtime.runAttempt > 1)) {
		fail('classification rerun binding does not match the current run attempt');
	}
}

function assertDirectNeeds(needs, classifierJob, relevant) {
	if (Object.hasOwn(relevant, classifierJob)) {
		fail(`classifier job "${classifierJob}" collides with a reported work job`);
	}
	const expected = [classifierJob, ...Object.keys(relevant)].sort();
	const actual = Object.keys(needs).sort();
	const missing = expected.filter((job) => !Object.hasOwn(needs, job));
	const extra = actual.filter((job) => !expected.includes(job));
	if (missing.length > 0 || extra.length > 0) {
		fail(
			`direct needs mismatch: missing [${missing.join(', ')}]; extra [${extra.join(', ')}]`,
		);
	}
}

export function evaluateRequiredContext({ needs: needsValue, classifierJob = 'classify', runtime }) {
	const current = validateRuntime(runtime);
	const needs = assertRecord(needsValue, 'needs');
	if (!JOB_PATTERN.test(classifierJob)) fail('classifier job id is invalid');
	if (!Object.hasOwn(needs, classifierJob)) {
		fail(`direct needs are missing classifier job "${classifierJob}"`);
	}

	const classifier = validateNeed(needs[classifierJob], classifierJob);
	if (classifier.result !== 'success') {
		fail(`classifier job "${classifierJob}" reported ${classifier.result}`);
	}
	const classification = parseClassification(classifier.outputs.classification);
	bindClassification(classification, current);
	assertDirectNeeds(needs, classifierJob, classification.relevant);

	let relevant = 0;
	let skipped = 0;
	for (const [job, selected] of Object.entries(classification.relevant).sort(([a], [b]) =>
		a.localeCompare(b),
	)) {
		const need = validateNeed(needs[job], job);
		const expected = selected ? 'success' : 'skipped';
		if (need.result !== expected) {
			fail(
				`${job} expected ${expected} because relevant=${String(selected)} but reported ${need.result}`,
			);
		}
		if (selected) relevant += 1;
		else skipped += 1;
	}

	return { schema: 1, relevant, skipped, rerun: classification.source.rerun };
}

function requiredEnvironment(environment, name) {
	return assertString(environment[name], `environment ${name}`);
}

function readInput(environment, name, required = true) {
	const key = `INPUT_${name.toUpperCase()}`;
	const value = environment[key] ?? environment[key.replaceAll('-', '_')];
	if (required && (typeof value !== 'string' || value.length === 0)) {
		fail(`action input "${name}" is required`);
	}
	return value;
}

function readEvent(path) {
	let event;
	try {
		event = JSON.parse(readFileSync(path, 'utf8'));
	} catch (error) {
		fail(`GitHub event JSON is invalid: ${error instanceof Error ? error.message : String(error)}`);
	}
	return assertRecord(event, 'GitHub event');
}

export function runtimeFromGithub(environment = process.env) {
	const eventName = requiredEnvironment(environment, 'GITHUB_EVENT_NAME');
	const runId = requiredEnvironment(environment, 'GITHUB_RUN_ID');
	const attemptText = requiredEnvironment(environment, 'GITHUB_RUN_ATTEMPT');
	if (!/^\d+$/u.test(attemptText)) fail('GITHUB_RUN_ATTEMPT must be a positive integer');
	const runAttempt = Number(attemptText);
	assertPositiveInteger(runAttempt, 'GITHUB_RUN_ATTEMPT');

	const event = readEvent(requiredEnvironment(environment, 'GITHUB_EVENT_PATH'));
	const eventRepository = isRecord(event.repository) ? event.repository.full_name : undefined;
	const repository = environment.GITHUB_REPOSITORY ?? eventRepository;
	let baseSha;
	let headSha;
	if (eventName === 'pull_request') {
		const pullRequest = assertRecord(event.pull_request, 'GitHub event.pull_request');
		baseSha = assertSha(assertRecord(pullRequest.base, 'pull_request.base').sha, 'pull_request.base.sha');
		headSha = assertSha(assertRecord(pullRequest.head, 'pull_request.head').sha, 'pull_request.head.sha');
	} else {
		headSha = assertSha(environment.GITHUB_SHA ?? event.after, 'GITHUB_SHA or event.after');
		baseSha = typeof event.before === 'string' && SHA_PATTERN.test(event.before) ? event.before : headSha;
	}

	return validateRuntime({
		repository,
		event: eventName,
		baseSha,
		headSha,
		runId,
		runAttempt,
	});
}

function writeReport(report, environment) {
	const compact = JSON.stringify(report);
	const outputPath = environment.GITHUB_OUTPUT;
	if (typeof outputPath === 'string' && outputPath.length > 0) {
		appendFileSync(outputPath, `report=${compact}\n`, 'utf8');
	}
	process.stdout.write(`${compact}\n`);
}

function escapeWorkflowCommand(value) {
	return value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

export function runRequiredContext(environment = process.env) {
	let needs;
	try {
		needs = JSON.parse(readInput(environment, 'NEEDS-JSON'));
	} catch (error) {
		fail(`needs-json is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
	}
	const classifierJob = readInput(environment, 'CLASSIFIER-JOB', false) || 'classify';
	const report = evaluateRequiredContext({
		needs,
		classifierJob,
		runtime: runtimeFromGithub(environment),
	});
	writeReport(report, environment);
	return report;
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
	try {
		runRequiredContext();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`::error title=Required context::${escapeWorkflowCommand(message)}\n`);
		process.exitCode = 1;
	}
}
