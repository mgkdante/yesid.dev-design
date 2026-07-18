import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPOSITORY_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const GITHUB_DIRECTORY = join(REPOSITORY_ROOT, '.github');
const CODEOWNERS_PATH = join(GITHUB_DIRECTORY, 'CODEOWNERS');
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

function workflowSteps(yaml: string): string[] {
	const lines = yaml.split(/\r?\n/u);
	const steps: string[] = [];

	for (let index = 0; index < lines.length; index += 1) {
		const stepsMatch = lines[index]?.match(/^(\s*)steps:\s*$/u);
		if (!stepsMatch) continue;
		const stepsIndent = stepsMatch[1]?.length ?? 0;
		let cursor = index + 1;

		while (cursor < lines.length) {
			const line = lines[cursor] ?? '';
			if (line.trim() && line.length - line.trimStart().length <= stepsIndent) break;
			const stepMatch = line.match(/^(\s*)-\s+(?:name|uses):/u);
			if (!stepMatch || (stepMatch[1]?.length ?? 0) !== stepsIndent + 2) {
				cursor += 1;
				continue;
			}

			const start = cursor;
			cursor += 1;
			while (cursor < lines.length) {
				const candidate = lines[cursor] ?? '';
				if (candidate.trim() && candidate.length - candidate.trimStart().length <= stepsIndent) break;
				if (/^\s*-\s+(?:name|uses):/u.test(candidate)) {
					const candidateIndent = candidate.length - candidate.trimStart().length;
					if (candidateIndent === stepsIndent + 2) break;
				}
				cursor += 1;
			}
			steps.push(lines.slice(start, cursor).join('\n'));
		}
		index = cursor - 1;
	}

	return steps;
}

function ownershipRules(): Map<string, string[]> {
	const rules = new Map<string, string[]>();
	for (const rawLine of readText(CODEOWNERS_PATH).split(/\r?\n/u)) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) continue;
		const [pattern, ...owners] = line.split(/\s+/u);
		if (pattern) rules.set(pattern, owners);
	}
	return rules;
}

describe('distribution trust-root ownership', () => {
	it('routes the repository and release-critical surfaces to the brand owner', () => {
		const codeownersExists = existsSync(CODEOWNERS_PATH);
		expect(
			codeownersExists,
			'.github/CODEOWNERS must exist before ownership rules can be evaluated',
		).toBe(true);
		if (!codeownersExists) return;

		const rules = ownershipRules();
		const owner = '@mgkdante';

		for (const pattern of [
			'*',
			'/.github/',
			'/packages/',
			'/packages/tokens/tokens.json',
			'/tools/adopt.ts',
			'/package.json',
			'/bun.lock',
		]) {
			expect(rules.get(pattern), `${pattern} must route to ${owner}`).toContain(owner);
		}
	});
});

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

	it('keeps scheduled and manual secret scans on verified full-history gitleaks', () => {
		const workflow = readText(SECRET_SCAN_WORKFLOW_PATH);
		const triggers = topLevelBlock(workflow, 'on');
		expect(triggers).toMatch(/^\s+schedule:\s*$/mu);
		expect(triggers).toMatch(/^\s+workflow_dispatch:\s*$/mu);

		const steps = workflowSteps(workflow);
		const installGitleaks = steps.find((step) => /^\s*-\s+name:\s*Install gitleaks\s*$/mu.test(step));
		expect(installGitleaks, 'secret scan must retain the gitleaks install step').toBeDefined();

		const checksum = installGitleaks?.match(
			/^\s+GITLEAKS_SHA256:\s*["']?([0-9a-f]{64})["']?\s*$/mu,
		);
		expect(checksum?.[1], 'GITLEAKS_SHA256 must be a 64-character hexadecimal digest').toMatch(
			/^[0-9a-f]{64}$/u,
		);
		const downloadedArchive = installGitleaks?.match(
			/^\s*curl\b.*\s-o\s+["']?([^"'\s]+)["']?\s*$/mu,
		)?.[1];
		expect(downloadedArchive, 'gitleaks download must name its archive path').toBeDefined();
		const verifiedArchive = installGitleaks?.match(
			/^\s*echo\s+"\$\{GITLEAKS_SHA256\}\s{2}([^"\s]+)"\s*\|\s*sha256sum\s+-c\s+-\s*$/mu,
		)?.[1];
		expect(
			verifiedArchive,
			'GITLEAKS_SHA256 and the downloaded archive path must be piped into sha256sum -c -',
		).toBe(downloadedArchive);

		const checkout = steps.find((step) => /uses:\s*actions\/checkout@/u.test(step));
		expect(checkout, 'secret scan must check out the repository').toBeDefined();
		expect(checkout).toMatch(/^\s+fetch-depth:\s*0\s*$/mu);

		const fullHistory = steps.find((step) => /^\s*-\s+name:\s*Scan full history\s*$/mu.test(step));
		expect(fullHistory, 'secret scan must retain a full-history step').toBeDefined();
		expect(fullHistory).toMatch(
			/^\s+if:\s*github\.event_name\s*==\s*'schedule'\s*\|\|\s*github\.event_name\s*==\s*'workflow_dispatch'\s*$/mu,
		);
		expect(fullHistory).toMatch(/^\s+run:\s*gitleaks detect --redact\s*$/mu);
		expect(fullHistory).not.toContain('--log-opts');
	});
});
