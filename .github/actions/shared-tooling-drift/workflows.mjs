import { canonicalPath, fail, SHA_PATTERN } from './contract.mjs';
import { textAt, workflowFiles } from './config.mjs';

function stripYamlComment(line) {
	let single = false;
	let double = false;
	for (let index = 0; index < line.length; index += 1) {
		const character = line[index];
		if (character === "'" && !double) {
			if (single && line[index + 1] === "'") {
				index += 1;
				continue;
			}
			single = !single;
			continue;
		}
		if (character === '"' && !single && line[index - 1] !== '\\') {
			double = !double;
			continue;
		}
		if (character === '#' && !single && !double && (index === 0 || /\s/u.test(line[index - 1]))) {
			return line.slice(0, index).trimEnd();
		}
	}
	return line.trimEnd();
}

function yamlScalar(input, label) {
	const value = stripYamlComment(input).trim();
	if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/gu, "'");
	if (value.startsWith('"') && value.endsWith('"')) {
		try {
			return JSON.parse(value);
		} catch {
			fail(`${label} contains an invalid quoted uses scalar`);
		}
	}
	if (!value || /\s|\$\{\{|^[&*|>\[]/u.test(value)) fail(`${label} must be a literal action reference`);
	return value;
}

function workflowReferences(contents, workflow, sourceRepository) {
	const references = [];
	const repositoryPrefix = `${sourceRepository}/`;
	const lowerPrefix = repositoryPrefix.toLowerCase();
	let blockIndent = null;
	for (const [index, line] of contents.split(/\r?\n/u).entries()) {
		if (/^\s*\t/u.test(line)) fail(`${workflow}:${index + 1} uses unsupported tab indentation`);
		const indent = line.length - line.trimStart().length;
		if (blockIndent !== null) {
			if (!line.trim() || indent > blockIndent) continue;
			blockIndent = null;
		}
		const visible = stripYamlComment(line);
		if (!visible.trim()) continue;
		if (/^\s*(?:-\s*)?(?:run|script)\s*:\s*[>|][+-]?[0-9]*\s*$/u.test(visible)) {
			blockIndent = indent;
			continue;
		}
		const match = visible.match(/^\s*(?:-\s*)?uses\s*:\s*(.+?)\s*$/u);
		if (!match) {
			const lower = visible.toLowerCase();
			if (lower.includes(lowerPrefix) || lower.includes(`${sourceRepository.toLowerCase()}@`)) {
				fail(`${workflow}:${index + 1} contains a shared repository reference outside a literal uses scalar`);
			}
			continue;
		}
		const reference = yamlScalar(match[1], `${workflow}:${index + 1}`);
		const lower = reference.toLowerCase();
		if (!lower.startsWith(lowerPrefix) && !lower.startsWith(`${sourceRepository.toLowerCase()}@`)) continue;
		if (!reference.startsWith(repositoryPrefix)) {
			fail(`${workflow}:${index + 1} must use canonical repository casing and a shared action path`);
		}
		const separator = reference.lastIndexOf('@');
		if (separator <= repositoryPrefix.length || separator === reference.length - 1) {
			fail(`${workflow}:${index + 1} contains a malformed shared action reference`);
		}
		references.push({
			action: canonicalPath(
				reference.slice(repositoryPrefix.length, separator),
				`${workflow}:${index + 1} action`,
			),
			ref: reference.slice(separator + 1),
			line: index + 1,
		});
	}
	return references;
}

export function verifyCallers(root, manifest) {
	const expectedByWorkflow = new Map();
	for (const caller of manifest.callers) {
		const actions = expectedByWorkflow.get(caller.workflow) ?? [];
		actions.push(caller.action);
		expectedByWorkflow.set(caller.workflow, actions);
	}
	const allWorkflows = new Set([...workflowFiles(root), ...expectedByWorkflow.keys()]);
	const verified = [];
	for (const workflow of [...allWorkflows].sort()) {
		const expectedActions = expectedByWorkflow.get(workflow) ?? [];
		const references = workflowReferences(
			textAt(root, workflow, 'caller workflow'),
			workflow,
			manifest.source.repository,
		);
		for (const reference of references) {
			if (!SHA_PATTERN.test(reference.ref) || reference.ref !== manifest.source.sha) {
				fail(`${workflow}:${reference.line} shared action ref must equal immutable SHA ${manifest.source.sha}`);
			}
			if (!expectedActions.includes(reference.action)) {
				fail(`${workflow}:${reference.line} contains untracked shared action ${reference.action}`);
			}
		}
		for (const action of expectedActions) {
			const count = references.filter((reference) => reference.action === action).length;
			if (count !== 1) {
				fail(`${workflow} has a missing or duplicate caller ${action}; expected exactly once, found ${count}`);
			}
			verified.push({ workflow, action, sha: manifest.source.sha });
		}
	}
	return verified.sort((left, right) =>
		`${left.workflow}\0${left.action}`.localeCompare(`${right.workflow}\0${right.action}`),
	);
}
