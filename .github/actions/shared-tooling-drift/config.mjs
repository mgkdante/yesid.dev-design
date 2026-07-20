import { lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
	canonicalJson,
	canonicalPath,
	digest,
	digestBytes,
	fail,
	record,
	requiredString,
	strictJson,
} from './contract.mjs';

const MAX_FILE_BYTES = 1024 * 1024;
const decoder = new TextDecoder('utf-8', { fatal: true });

export function workspaceRoot(input) {
	const root = realpathSync(requiredString(input, 'workspace'));
	if (!statSync(root).isDirectory()) fail('workspace must be a directory');
	return root;
}

export function manifestRelativePath(root, input) {
	const absolute = resolve(isAbsolute(input) ? input : join(root, input));
	return canonicalPath(relative(root, absolute).split(sep).join('/'), 'manifest path');
}

function fileAt(root, path, label) {
	const relativePath = canonicalPath(path, label);
	const segments = relativePath.split('/');
	let current = root;
	for (const [index, segment] of segments.entries()) {
		current = join(current, segment);
		let status;
		try {
			status = lstatSync(current);
		} catch {
			fail(`${label} does not exist: ${relativePath}`);
		}
		if (status.isSymbolicLink()) fail(`${label} must not traverse a symbolic link: ${relativePath}`);
		if (index < segments.length - 1 && !status.isDirectory()) {
			fail(`${label} parent is not a directory: ${relativePath}`);
		}
		if (index === segments.length - 1 && !status.isFile()) {
			fail(`${label} must be a regular file: ${relativePath}`);
		}
	}
	if (statSync(current).size > MAX_FILE_BYTES) fail(`${label} exceeds ${MAX_FILE_BYTES} bytes: ${relativePath}`);
	return current;
}

export function bytesAt(root, path, label) {
	return readFileSync(fileAt(root, path, label));
}

export function textAt(root, path, label) {
	try {
		return decoder.decode(bytesAt(root, path, label));
	} catch (error) {
		if (error instanceof Error && error.message.startsWith('shared-tooling-drift:')) throw error;
		fail(`${label} must contain valid UTF-8: ${path}`);
	}
}

function cloneJson(value) {
	if (Array.isArray(value)) return value.map(cloneJson);
	if (!record(value)) return value;
	const output = Object.create(null);
	for (const key of Object.keys(value)) output[key] = cloneJson(value[key]);
	return output;
}

function mergeJson(base, overlay) {
	if (!record(base) || !record(overlay)) return cloneJson(overlay);
	const output = cloneJson(base);
	for (const key of Object.keys(overlay)) {
		output[key] = Object.hasOwn(base, key) ? mergeJson(base[key], overlay[key]) : cloneJson(overlay[key]);
	}
	return output;
}

function verifiedSources(root, contract) {
	return contract.sources.map((source) => {
		const bytes = bytesAt(root, source.path, 'configuration source');
		if (digestBytes(bytes) !== source.digest) fail(`configuration source digest drift at ${source.path}`);
		return { ...source, bytes };
	});
}

function verifyConfiguration(root, contract) {
	const targetBytes = bytesAt(root, contract.target, 'configuration target');
	const sources = verifiedSources(root, contract);
	if (contract.mode === 'bytes') {
		const expected = sources[0].bytes;
		if (!expected.equals(targetBytes)) fail(`configuration byte drift at ${contract.target}`);
		return { mode: contract.mode, target: contract.target, digest: digestBytes(expected) };
	}
	let expected = Object.create(null);
	for (const source of sources) {
		let contents;
		try {
			contents = decoder.decode(source.bytes);
		} catch {
			fail(`configuration source must contain valid UTF-8: ${source.path}`);
		}
		expected = mergeJson(expected, strictJson(contents, source.path));
	}
	let actualContents;
	try {
		actualContents = decoder.decode(targetBytes);
	} catch {
		fail(`configuration target must contain valid UTF-8: ${contract.target}`);
	}
	const actual = strictJson(actualContents, contract.target);
	if (canonicalJson(expected) !== canonicalJson(actual)) fail(`configuration JSON drift at ${contract.target}`);
	return { mode: contract.mode, target: contract.target, digest: digest(expected) };
}

export function verifyConfigurations(root, contracts) {
	return contracts.map((contract) => verifyConfiguration(root, contract));
}

export function workflowFiles(root) {
	let workflows = root;
	for (const segment of ['.github', 'workflows']) {
		workflows = join(workflows, segment);
		let status;
		try {
			status = lstatSync(workflows);
		} catch {
			fail('.github/workflows must be a readable directory');
		}
		if (status.isSymbolicLink() || !status.isDirectory()) {
			fail('.github/workflows must be a regular directory without symbolic links');
		}
	}
	let entries;
	try {
		entries = readdirSync(workflows, { withFileTypes: true });
	} catch {
		fail('.github/workflows must be a readable directory');
	}
	const files = [];
	for (const entry of entries) {
		if (!/\.ya?ml$/u.test(entry.name)) continue;
		if (!entry.isFile()) fail(`workflow must be a regular file: .github/workflows/${entry.name}`);
		files.push(`.github/workflows/${entry.name}`);
	}
	return files.sort();
}
