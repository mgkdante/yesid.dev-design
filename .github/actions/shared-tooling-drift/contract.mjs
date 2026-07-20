import { createHash } from 'node:crypto';

export const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const REPOSITORY_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38})\/[a-z0-9._-]+$/u;
const PATH_PATTERN = /^[A-Za-z0-9._+@/-]+$/u;
const MODES = new Set(['bytes', 'json-merge']);
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const GATE_PATH = '.github/actions/shared-tooling-drift';
const REQUIRED_ACTIONS = [
	'.github/actions/classify-paths',
	'.github/actions/required-context',
	GATE_PATH,
];

export function fail(message) {
	throw new Error(`shared-tooling-drift: ${message}`);
}

export function record(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
	if (!record(value)) fail(`${label} must be an object`);
	const actual = Object.keys(value).sort();
	const canonical = [...expected].sort();
	if (JSON.stringify(actual) !== JSON.stringify(canonical)) {
		fail(`${label} keys must equal ${canonical.join(', ')}; received ${actual.join(', ')}`);
	}
}

export function requiredString(value, label) {
	if (typeof value !== 'string' || value.length === 0) fail(`${label} must be a non-empty string`);
	return value;
}

export function repository(value, label) {
	const candidate = requiredString(value, label);
	if (!REPOSITORY_PATTERN.test(candidate)) {
		fail(`${label} must be a canonical lowercase owner/repository identity`);
	}
	return candidate;
}

export function commitSha(value, label) {
	const candidate = requiredString(value, label);
	if (!SHA_PATTERN.test(candidate)) fail(`${label} must be an immutable lowercase 40-character SHA`);
	return candidate;
}

function sha256(value, label) {
	const candidate = requiredString(value, label);
	if (!DIGEST_PATTERN.test(candidate)) fail(`${label} must be a lowercase SHA-256 digest`);
	return candidate;
}

export function canonicalPath(value, label) {
	const path = requiredString(value, label);
	if (
		path.length > 512 ||
		!PATH_PATTERN.test(path) ||
		path.startsWith('/') ||
		path.endsWith('/') ||
		path.includes('\\') ||
		path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
	) {
		fail(`${label} must be a canonical repository-relative path`);
	}
	return path;
}

function canonicalize(value) {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (!record(value)) return value;
	return Object.fromEntries(
		Object.keys(value)
			.sort()
			.map((key) => [key, canonicalize(value[key])]),
	);
}

export function canonicalJson(value) {
	return JSON.stringify(canonicalize(value));
}

export function digestBytes(bytes) {
	return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function digest(value) {
	return digestBytes(canonicalJson(value));
}

export function strictJson(source, label) {
	let cursor = 0;

	function whitespace() {
		while (/\s/u.test(source[cursor] ?? '')) cursor += 1;
	}

	function quoted() {
		const start = cursor;
		cursor += 1;
		while (cursor < source.length) {
			const character = source[cursor];
			if (character === '"') {
				cursor += 1;
				try {
					return JSON.parse(source.slice(start, cursor));
				} catch {
					fail(`${label} contains an invalid JSON string`);
				}
			}
			if (character === '\\') {
				cursor += 2;
				continue;
			}
			if ((character?.charCodeAt(0) ?? 0) < 0x20) fail(`${label} contains a control character`);
			cursor += 1;
		}
		fail(`${label} contains an unterminated JSON string`);
	}

	function value(path) {
		whitespace();
		const character = source[cursor];
		if (character === '"') return quoted();
		if (character === '{') return object(path);
		if (character === '[') return array(path);
		for (const [token, result] of [
			['true', true],
			['false', false],
			['null', null],
		]) {
			if (source.startsWith(token, cursor)) {
				cursor += token.length;
				return result;
			}
		}
		const match = source.slice(cursor).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u);
		if (match) {
			cursor += match[0].length;
			const number = Number(match[0]);
			if (!Number.isFinite(number)) fail(`${label} contains a non-finite number at ${path}`);
			return number;
		}
		fail(`${label} contains invalid JSON at ${path}`);
	}

	function object(path) {
		cursor += 1;
		const output = Object.create(null);
		const keys = new Set();
		whitespace();
		if (source[cursor] === '}') {
			cursor += 1;
			return output;
		}
		while (cursor < source.length) {
			whitespace();
			if (source[cursor] !== '"') fail(`${label} requires a quoted object key at ${path}`);
			const key = quoted();
			if (keys.has(key)) fail(`${label} contains duplicate key ${key} at ${path}`);
			if (RESERVED_KEYS.has(key)) fail(`${label} contains reserved key ${key} at ${path}`);
			keys.add(key);
			whitespace();
			if (source[cursor] !== ':') fail(`${label} requires ':' after ${path}.${key}`);
			cursor += 1;
			Object.defineProperty(output, key, {
				value: value(`${path}.${key}`),
				enumerable: true,
				writable: true,
				configurable: true,
			});
			whitespace();
			if (source[cursor] === '}') {
				cursor += 1;
				return output;
			}
			if (source[cursor] !== ',') fail(`${label} requires ',' or '}' at ${path}`);
			cursor += 1;
		}
		fail(`${label} contains an unterminated object at ${path}`);
	}

	function array(path) {
		cursor += 1;
		const output = [];
		whitespace();
		if (source[cursor] === ']') {
			cursor += 1;
			return output;
		}
		while (cursor < source.length) {
			output.push(value(`${path}[${output.length}]`));
			whitespace();
			if (source[cursor] === ']') {
				cursor += 1;
				return output;
			}
			if (source[cursor] !== ',') fail(`${label} requires ',' or ']' at ${path}`);
			cursor += 1;
		}
		fail(`${label} contains an unterminated array at ${path}`);
	}

	const parsed = value('$');
	whitespace();
	if (cursor !== source.length) fail(`${label} contains trailing JSON content`);
	return parsed;
}

export function parseManifest(contents) {
	const value = strictJson(contents, 'manifest');
	exactKeys(value, ['schema', 'source', 'configurations', 'callers'], 'manifest');
	if (value.schema !== 1) fail('manifest.schema must equal 1');
	exactKeys(value.source, ['repository', 'sha', 'gate'], 'manifest.source');
	const source = {
		repository: repository(value.source.repository, 'manifest.source.repository'),
		sha: commitSha(value.source.sha, 'manifest.source.sha'),
		gate: canonicalPath(value.source.gate, 'manifest.source.gate'),
	};
	if (source.gate !== GATE_PATH) fail(`manifest.source.gate must equal ${GATE_PATH}`);
	if (!Array.isArray(value.configurations) || value.configurations.length === 0) {
		fail('manifest.configurations must contain at least one drift contract');
	}
	if (!Array.isArray(value.callers) || value.callers.length === 0) {
		fail('manifest.callers must contain caller contracts');
	}

	const targets = new Set();
	const configurations = value.configurations.map((entry, index) => {
		exactKeys(entry, ['mode', 'sources', 'target'], `manifest.configurations[${index}]`);
		if (!MODES.has(entry.mode)) fail(`manifest.configurations[${index}].mode is invalid`);
		if (!Array.isArray(entry.sources) || entry.sources.length === 0) {
			fail(`manifest.configurations[${index}].sources must not be empty`);
		}
		if (entry.mode !== 'json-merge' && entry.sources.length !== 1) {
			fail(`manifest.configurations[${index}] ${entry.mode} mode requires exactly one source`);
		}
		const sources = entry.sources.map((candidate, sourceIndex) => {
			exactKeys(candidate, ['path', 'digest'], `manifest.configurations[${index}].sources[${sourceIndex}]`);
			return {
				path: canonicalPath(candidate.path, `manifest.configurations[${index}].sources[${sourceIndex}].path`),
				digest: sha256(
					candidate.digest,
					`manifest.configurations[${index}].sources[${sourceIndex}].digest`,
				),
			};
		});
		if (new Set(sources.map(({ path }) => path)).size !== sources.length) {
			fail(`manifest.configurations[${index}] contains a duplicate source`);
		}
		const target = canonicalPath(entry.target, `manifest.configurations[${index}].target`);
		if (sources.some(({ path }) => path === target)) fail(`configuration target must differ from its sources: ${target}`);
		if (targets.has(target)) fail(`manifest contains duplicate configuration target ${target}`);
		targets.add(target);
		return { mode: entry.mode, sources, target };
	});

	const callerKeys = new Set();
	const callers = value.callers.map((entry, index) => {
		exactKeys(entry, ['workflow', 'action'], `manifest.callers[${index}]`);
		const workflow = canonicalPath(entry.workflow, `manifest.callers[${index}].workflow`);
		if (!/^\.github\/workflows\/[^/]+\.ya?ml$/u.test(workflow)) {
			fail(`manifest.callers[${index}].workflow must name a top-level .github/workflows YAML file`);
		}
		const action = canonicalPath(entry.action, `manifest.callers[${index}].action`);
		if (!/^\.github\/(?:actions\/.+|workflows\/[^/]+\.ya?ml)$/u.test(action)) {
			fail(`manifest.callers[${index}].action must name a shared action or reusable workflow`);
		}
		const key = `${workflow}\0${action}`;
		if (callerKeys.has(key)) fail(`manifest contains duplicate caller ${workflow} -> ${action}`);
		callerKeys.add(key);
		return { workflow, action };
	});
	for (const action of REQUIRED_ACTIONS) {
		if (!callers.some((caller) => caller.action === action)) {
			if (action === GATE_PATH) fail(`manifest gate caller ${GATE_PATH} is required`);
			fail(`manifest must declare required shared action ${action} as a caller`);
		}
	}

	return {
		schema: 1,
		source,
		configurations: configurations.sort((left, right) => left.target.localeCompare(right.target)),
		callers: callers.sort((left, right) =>
			`${left.workflow}\0${left.action}`.localeCompare(`${right.workflow}\0${right.action}`),
		),
	};
}
