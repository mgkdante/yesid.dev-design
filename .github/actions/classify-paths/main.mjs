import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const FILE_CAP = 3_000;
const PAGE_SIZE = 100;
const API_VERSION = '2022-11-28';
const TOP_LEVEL_RULE_KEYS = new Set(['schema', 'always', 'jobs', 'ignore']);
const MATCH_RULE_KEYS = new Set(['paths', 'prefixes']);
const IGNORE_KEYS = ['docs-only', 'irrelevant'];
const JOB_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/u;
const RESERVED_JOB_IDS = new Set(['__proto__', 'constructor', 'prototype']);

function fail(message) {
	throw new Error(message);
}

function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireExactKeys(value, expected, label) {
	const actual = Object.keys(value);
	for (const key of actual) {
		if (!expected.has(key)) fail(`${label} contains unexpected key ${JSON.stringify(key)}`);
	}
	for (const key of expected) {
		if (!Object.hasOwn(value, key)) fail(`${label} is missing key ${JSON.stringify(key)}`);
	}
}

function validateRepository(value) {
	if (typeof value !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(value)) {
		fail('repository must be an owner/name binding');
	}
	const [owner, repository] = value.split('/');
	if (owner === '.' || owner === '..' || repository === '.' || repository === '..') {
		fail('repository must be an owner/name binding');
	}
	return value;
}

function validateSha(value, label) {
	if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
		fail(`${label} must be a lowercase 40-character SHA`);
	}
	return value;
}

function validateFilePath(value, label = 'path') {
	if (
		typeof value !== 'string' ||
		value.length === 0 ||
		value.length > 4_096 ||
		value.startsWith('/') ||
		value.endsWith('/') ||
		value.includes('\\') ||
		/[\u0000-\u001f\u007f]/u.test(value)
	) {
		fail(`${label} is not a safe repository path`);
	}
	const segments = value.split('/');
	if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
		fail(`${label} is not a safe repository path`);
	}
	return value;
}

function validatePrefix(value, label) {
	if (typeof value !== 'string' || !value.endsWith('/') || value === '/') {
		fail(`${label} must be a non-root directory prefix ending in /`);
	}
	validateFilePath(value.slice(0, -1), label);
	return value;
}

function normalizeStringList(value, label, validator) {
	if (!Array.isArray(value)) fail(`${label} must be an array`);
	const normalized = value.map((entry, index) => validator(entry, `${label}[${index}]`));
	if (new Set(normalized).size !== normalized.length) fail(`${label} contains a duplicate`);
	return normalized.sort();
}

function normalizeMatchRules(value, label) {
	if (!isRecord(value)) fail(`${label} must be an object`);
	requireExactKeys(value, MATCH_RULE_KEYS, label);
	return {
		paths: normalizeStringList(value.paths, `${label}.paths`, validateFilePath),
		prefixes: normalizeStringList(value.prefixes, `${label}.prefixes`, validatePrefix),
	};
}

function normalizeRules(value) {
	if (!isRecord(value)) fail('rules must be an object');
	requireExactKeys(value, TOP_LEVEL_RULE_KEYS, 'rules');
	if (value.schema !== 1) fail('rules.schema must equal 1');
	if (!isRecord(value.jobs) || Object.keys(value.jobs).length === 0) {
		fail('rules.jobs must contain at least one work job');
	}
	if (!isRecord(value.ignore)) fail('rules.ignore must be an object');
	requireExactKeys(value.ignore, new Set(IGNORE_KEYS), 'rules.ignore');

	const jobs = {};
	for (const name of Object.keys(value.jobs).sort()) {
		if (!JOB_PATTERN.test(name) || RESERVED_JOB_IDS.has(name)) {
			fail(`rules.jobs contains invalid job id ${JSON.stringify(name)}`);
		}
		const jobRules = normalizeMatchRules(value.jobs[name], `rules.jobs.${name}`);
		if (jobRules.paths.length === 0 && jobRules.prefixes.length === 0) {
			fail(`rules.jobs.${name} must match at least one path or prefix`);
		}
		jobs[name] = jobRules;
	}

	return {
		schema: 1,
		always: normalizeMatchRules(value.always, 'rules.always'),
		jobs,
		ignore: Object.fromEntries(
			IGNORE_KEYS.map((name) => [
				name,
				normalizeMatchRules(value.ignore[name], `rules.ignore.${name}`),
			]),
		),
	};
}

function canonicalize(value) {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (!isRecord(value)) return value;
	return Object.fromEntries(
		Object.keys(value)
			.sort()
			.map((key) => [key, canonicalize(value[key])]),
	);
}

function canonicalJson(value) {
	return JSON.stringify(canonicalize(value));
}

function digest(value) {
	return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function matches(path, rules) {
	return rules.paths.includes(path) || rules.prefixes.some((prefix) => path.startsWith(prefix));
}

function allRelevant(jobNames, value) {
	return Object.fromEntries(jobNames.map((name) => [name, value]));
}

export function classifyPaths(input) {
	if (!isRecord(input)) fail('classifier input must be an object');
	const repository = validateRepository(input.repository);
	if (typeof input.event !== 'string' || !/^[A-Za-z0-9_]+$/u.test(input.event)) {
		fail('event must be a GitHub event name');
	}
	if (input.event === 'pull_request_target') {
		fail('pull_request_target is outside the trusted classifier contract');
	}
	const baseSha = validateSha(input.baseSha, 'baseSha');
	const headSha = validateSha(input.headSha, 'headSha');
	if (typeof input.runId !== 'string' || !/^[1-9][0-9]*$/u.test(input.runId)) {
		fail('runId must be a positive decimal string');
	}
	if (!Number.isSafeInteger(input.runAttempt) || input.runAttempt < 1) {
		fail('runAttempt must be a positive integer');
	}
	if (input.complete !== true) fail('file evidence must be complete');
	if (!Array.isArray(input.paths)) fail('paths must be an array');

	const paths = input.paths.map((path, index) => validateFilePath(path, `paths[${index}]`));
	if (new Set(paths).size !== paths.length) fail('paths contains duplicate evidence');
	paths.sort();

	const rules = normalizeRules(input.rules);
	const jobNames = Object.keys(rules.jobs);
	let relevant = allRelevant(jobNames, false);
	let reason;

	if (input.event !== 'pull_request') {
		relevant = allRelevant(jobNames, true);
		reason = 'force-full';
	} else if (paths.length === 0) {
		reason = 'empty';
	} else if (paths.some((path) => matches(path, rules.always))) {
		relevant = allRelevant(jobNames, true);
		reason = 'control';
	} else {
		const jobMatches = Object.fromEntries(
			jobNames.map((name) => [name, paths.some((path) => matches(path, rules.jobs[name]))]),
		);
		const known = paths.map(
			(path) =>
				jobNames.some((name) => matches(path, rules.jobs[name])) ||
				IGNORE_KEYS.some((name) => matches(path, rules.ignore[name])),
		);

		if (known.some((value) => !value)) {
			relevant = allRelevant(jobNames, true);
			reason = 'safe-full';
		} else {
			relevant = jobMatches;
			if (Object.values(jobMatches).some(Boolean)) {
				reason = 'matched';
			} else if (paths.every((path) => matches(path, rules.ignore['docs-only']))) {
				reason = 'docs-only';
			} else {
				reason = 'irrelevant';
			}
		}
	}

	return {
		schema: 1,
		source: {
			repository,
			event: input.event,
			baseSha,
			headSha,
			runId: input.runId,
			runAttempt: input.runAttempt,
			rerun: input.runAttempt > 1,
		},
		files: {
			complete: true,
			count: paths.length,
			digest: digest(paths),
		},
		rulesDigest: digest(rules),
		relevant,
		reason,
	};
}

async function fetchJson(fetchImpl, url, token) {
	let response;
	try {
		response = await fetchImpl(url, {
			headers: {
				accept: 'application/vnd.github+json',
				authorization: `Bearer ${token}`,
				'x-github-api-version': API_VERSION,
			},
			signal: AbortSignal.timeout(15_000),
		});
	} catch (error) {
		fail(`GitHub API request failed: ${error instanceof Error ? error.message : String(error)}`);
	}
	if (!response?.ok) fail(`GitHub API request failed with status ${response?.status ?? 'unknown'}`);
	try {
		return await response.json();
	} catch (error) {
		fail(`GitHub API returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
	}
}

function validateLivePullRequest(live, number, baseSha, headSha) {
	if (!isRecord(live) || live.number !== number || !isRecord(live.base) || !isRecord(live.head)) {
		fail('GitHub API pull request identity is incomplete');
	}
	if (live.base.sha !== baseSha) fail('stale pull request base SHA');
	if (live.head.sha !== headSha) fail('stale pull request head SHA');
	if (!Number.isSafeInteger(live.changed_files) || live.changed_files < 0) {
		fail('GitHub API changed files count is invalid');
	}
	if (live.changed_files >= FILE_CAP) {
		fail('pull request changed files reached the 3,000-file API cap');
	}
	return live.changed_files;
}

export async function collectPullRequestPaths({
	repository,
	event,
	token,
	apiUrl = 'https://api.github.com',
	fetchImpl = globalThis.fetch,
}) {
	const boundRepository = validateRepository(repository);
	if (!isRecord(event) || !Number.isSafeInteger(event.number) || event.number < 1) {
		fail('pull request event number must be a positive integer');
	}
	if (!isRecord(event.base) || !isRecord(event.head)) fail('pull request identity is incomplete');
	const eventBase = validateSha(event.base.sha, 'pull request base SHA');
	const eventHead = validateSha(event.head.sha, 'pull request head SHA');
	if (typeof token !== 'string' || token.length === 0) fail('GitHub API token is required');
	if (typeof fetchImpl !== 'function') fail('GitHub API fetch implementation is required');
	if (typeof apiUrl !== 'string' || !/^https:\/\/[^/\s]+(?:\/.*)?$/u.test(apiUrl)) {
		fail('GitHub API URL must use HTTPS');
	}

	const [owner, repo] = boundRepository.split('/');
	const root = `${apiUrl.replace(/\/+$/u, '')}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${event.number}`;
	const live = await fetchJson(fetchImpl, root, token);
	const changedFiles = validateLivePullRequest(live, event.number, eventBase, eventHead);

	let recordCount = 0;
	let page = 1;
	const paths = new Set();
	const filenames = new Set();
	while (recordCount < changedFiles) {
		const pageValue = await fetchJson(
			fetchImpl,
			`${root}/files?per_page=${PAGE_SIZE}&page=${page}`,
			token,
		);
		if (!Array.isArray(pageValue) || pageValue.length === 0) {
			fail('GitHub API file evidence is incomplete');
		}
		if (pageValue.length > PAGE_SIZE) fail('GitHub API file page exceeded the requested size');
		recordCount += pageValue.length;
		if (recordCount > changedFiles) fail('GitHub API file count exceeded pull request metadata');

		for (const [index, file] of pageValue.entries()) {
			if (!isRecord(file)) fail(`GitHub API file record ${index} is invalid`);
			const filename = validateFilePath(file.filename, `GitHub API filename on page ${page}`);
			if (filenames.has(filename)) fail('GitHub API file evidence contains a duplicate filename');
			filenames.add(filename);
			paths.add(filename);
			if (file.previous_filename !== undefined && file.previous_filename !== null) {
				paths.add(
					validateFilePath(
						file.previous_filename,
						`GitHub API previous filename on page ${page}`,
					),
				);
			}
		}

		if (pageValue.length < PAGE_SIZE && recordCount < changedFiles) {
			fail('GitHub API file evidence is incomplete');
		}
		page += 1;
	}

	if (recordCount !== changedFiles) fail('GitHub API file count is incomplete');
	const finalLive = await fetchJson(fetchImpl, root, token);
	const finalChangedFiles = validateLivePullRequest(
		finalLive,
		event.number,
		eventBase,
		eventHead,
	);
	if (finalChangedFiles !== changedFiles) fail('pull request moved during file acquisition');
	return [...paths].sort();
}

function input(environment, name) {
	return environment[`INPUT_${name.toUpperCase()}`] ?? '';
}

function readJson(value, label) {
	try {
		return JSON.parse(value);
	} catch (error) {
		fail(`${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
	}
}

function runtimeBinding(payload, environment) {
	const repository = environment.GITHUB_REPOSITORY ?? payload?.repository?.full_name;
	const event = environment.GITHUB_EVENT_NAME;
	const runId = environment.GITHUB_RUN_ID;
	const runAttempt = Number(environment.GITHUB_RUN_ATTEMPT);
	if (!event) fail('GITHUB_EVENT_NAME is required');

	if (event === 'pull_request') {
		const pullRequest = payload?.pull_request;
		if (!isRecord(pullRequest)) fail('pull_request event payload is missing');
		return {
			repository,
			event,
			baseSha: pullRequest.base?.sha,
			headSha: pullRequest.head?.sha,
			runId,
			runAttempt,
			pullRequest,
		};
	}

	const headSha = environment.GITHUB_SHA ?? payload?.after;
	const before = payload?.before;
	return {
		repository,
		event,
		baseSha: typeof before === 'string' && /^[0-9a-f]{40}$/u.test(before) ? before : headSha,
		headSha,
		runId,
		runAttempt,
	};
}

export async function runAction(environment = process.env, fetchImpl = globalThis.fetch) {
	const eventPath = environment.GITHUB_EVENT_PATH;
	if (!eventPath) fail('GITHUB_EVENT_PATH is required');
	const payload = readJson(readFileSync(eventPath, 'utf8'), 'GitHub event payload');
	const runtime = runtimeBinding(payload, environment);
	const rules = readJson(input(environment, 'rules-json'), 'rules-json');
	const paths =
		runtime.event === 'pull_request'
			? await collectPullRequestPaths({
					repository: runtime.repository,
					event: runtime.pullRequest,
					token: input(environment, 'github-token'),
					apiUrl: environment.GITHUB_API_URL,
					fetchImpl,
				})
			: [];
	const classification = classifyPaths({ ...runtime, complete: true, paths, rules });
	const outputPath = environment.GITHUB_OUTPUT;
	if (!outputPath) fail('GITHUB_OUTPUT is required');
	appendFileSync(outputPath, `classification=${canonicalJson(classification)}\n`, 'utf8');
	process.stdout.write(`${canonicalJson(classification)}\n`);
	return classification;
}

function annotation(value) {
	return value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

const direct =
	typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;
if (direct) {
	runAction().catch((error) => {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`::error title=Path classifier::${annotation(message)}\n`);
		process.exitCode = 1;
	});
}
