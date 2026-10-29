import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPOSITORY_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const GITHUB_DIRECTORY = join(REPOSITORY_ROOT, '.github');
const CI_WORKFLOW_PATH = join(GITHUB_DIRECTORY, 'workflows', 'ci.yml');
const SECRET_SCAN_WORKFLOW_PATH = join(GITHUB_DIRECTORY, 'workflows', 'secret-scan.yml');

function readText(path: string): string {
	return readFileSync(path, 'utf-8');
}

function yamlFiles(directory: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...yamlFiles(path));
		} else if (/\.ya?ml$/u.test(entry.name)) {
			files.push(path);
		}
	}
	return files;
}

function topLevelBlock(yaml: string, key: string): string {
	const lines = yaml.split(/\r?\n/u);
	const start = lines.findIndex((line) => line === `${key}:`);
	if (start === -1) return '';

	let end = lines.length;
	for (let index = start + 1; index < lines.length; index += 1) {
		if (/^[^\s#][^:]*:/u.test(lines[index] ?? '')) {
			end = index;
			break;
		}
	}
	return lines.slice(start, end).join('\n');
}

describe('distribution workflow trust root', () => {
	it.each([
		['ci.yml', CI_WORKFLOW_PATH],
		['secret-scan.yml', SECRET_SCAN_WORKFLOW_PATH],
	])('%s retains read-only repository contents permission', (_name, path) => {
		expect(topLevelBlock(readText(path), 'permissions')).toMatch(/^\s+contents:\s*read\s*$/mu);
	});

	it('pins every external workflow and composite-action dependency to a commit SHA', () => {
		const yaml = yamlFiles(GITHUB_DIRECTORY)
			.map((path) => [path, readText(path)] as const)
			.filter(([path, contents]) => {
				const githubPath = relative(GITHUB_DIRECTORY, path).split(sep).join('/');
				return (
					githubPath.startsWith('workflows/') ||
					githubPath.startsWith('actions/') ||
					/^\s+using:\s*composite\s*$/mu.test(contents)
				);
			});

		for (const [path, contents] of yaml) {
			const githubPath = relative(REPOSITORY_ROOT, path).split(sep).join('/');
			for (const [index, line] of contents.split(/\r?\n/u).entries()) {
				const match = line.match(/^\s*(?:-\s*)?uses:\s*(.+?)\s*(?:#.*)?$/u);
				if (!match?.[1]) continue;
				const reference = match[1].replace(/^(['"])(.*)\1$/u, '$2');
				if (reference.startsWith('./')) continue;
				expect(
					reference,
					`${githubPath}:${index + 1} external uses: must end in a 40-character commit SHA`,
				).toMatch(/@[0-9a-f]{40}$/u);
			}
		}
	});

});
