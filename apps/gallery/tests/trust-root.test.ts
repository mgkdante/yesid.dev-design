import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPOSITORY_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const GITHUB_DIRECTORY = join(REPOSITORY_ROOT, '.github');
const CODEOWNERS_PATH = join(GITHUB_DIRECTORY, 'CODEOWNERS');
const CI_WORKFLOW_PATH = join(GITHUB_DIRECTORY, 'workflows', 'ci.yml');
const SECRET_SCAN_WORKFLOW_PATH = join(GITHUB_DIRECTORY, 'workflows', 'secret-scan.yml');
const RELEASE_WORKFLOW_PATH = join(GITHUB_DIRECTORY, 'workflows', 'release.yml');

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

	it('publishes one canonical immutable asset and keeps normal exact-tag reruns read-only', () => {
		const workflow = readText(RELEASE_WORKFLOW_PATH);
		const permissions = topLevelBlock(workflow, 'permissions');
		expect(permissions).toMatch(/^\s+contents:\s*write\s*$/mu);
		expect(permissions).toMatch(/^\s+actions:\s*read\s*$/mu);
		expect(permissions).not.toMatch(/^\s+(?!contents:)[\w-]+:\s*write\s*$/mu);
		const triggers = topLevelBlock(workflow, 'on');
		expect(triggers).toMatch(/^\s+push:\s*$/mu);
		expect(triggers).toMatch(/^\s+tags:\s*\[(['"]?)v\*\1\]\s*$/mu);
		expect(triggers).toMatch(/^\s+workflow_dispatch:\s*$/mu);
		expect(workflow).toContain('bun tools/release-archive.ts build');
		expect(workflow).toContain('bun tools/release-archive.ts verify');
		expect(workflow).toContain('bun run release:check -- --version "$release_version" --tag "$RELEASE_TAG"');
		expect(workflow).toContain('yesid.dev-design-${RELEASE_TAG}.tar');
		expect(workflow).not.toContain('repos/${GITHUB_REPOSITORY}/immutable-releases');
		expect(workflow).toContain('recover-first-publication');
		expect(workflow).toContain('RECOVERY_RUN_ID');
		expect(workflow).toContain('IMMUTABLE_SETTINGS_TAG_OBJECT');
		expect(workflow).toContain('GITHUB_ACTOR');
		expect(workflow).toContain('GITHUB_REPOSITORY_OWNER');
		expect(workflow).toContain('.event == "push"');
		expect(workflow).toContain('.path == ".github/workflows/release.yml"');
		expect(workflow).toContain('.head_branch == $tag');
		expect(workflow).toContain('.head_sha == $commit');
		expect(workflow).toContain('.conclusion == "failure"');
		expect(workflow).toContain('existing draft release');
		expect(workflow).not.toContain('--clobber');
		expect(workflow).not.toMatch(/\bgit\s+tag\b/u);
		expect(workflow).toContain("ref: ${{ github.event_name == 'workflow_dispatch' && inputs.tag || github.ref_name }}");
		expect(workflow).not.toMatch(/^\s+ref:\s*main\s*$/mu);
		expect(workflow.indexOf('name: Validate draft asset bytes')).toBeLessThan(
			workflow.indexOf('name: Publish immutable release'),
		);
		expect(workflow.indexOf('bun run release:check')).toBeLessThan(
			workflow.indexOf('name: Detect exact-tag release state'),
		);

		const steps = workflowSteps(workflow);
		const releaseState = steps.find((step) =>
			/^\s*-\s+name:\s*Detect exact-tag release state\s*$/mu.test(step),
		);
		expect(releaseState, 'release-state detection must reject recovery after publication').toBeDefined();
		const recoveryAfterPublication =
			releaseState?.indexOf('if [[ "$RELEASE_MODE" == "recover-first-publication" ]]') ?? -1;
		const existingReleaseOutput = releaseState?.indexOf('echo "exists=true"') ?? -1;
		expect(recoveryAfterPublication).toBeGreaterThanOrEqual(0);
		expect(existingReleaseOutput).toBeGreaterThan(recoveryAfterPublication);
		for (const command of ['gh release create', 'gh release upload', 'gh release edit']) {
			const step = steps.find((candidate) => candidate.includes(command));
			expect(step, `${command} must have one explicit first-publication gate`).toBeDefined();
			expect(step).toMatch(
				/^\s+if:\s*steps\.release-state\.outputs\.exists\s*==\s*'false'\s*$/mu,
			);
		}
		const verification = steps.find((step) => step.includes('bun tools/release-archive.ts verify'));
		expect(verification).toBeDefined();
		expect(verification).not.toContain("steps.release-state.outputs.exists == 'false'");
		expect(verification).toContain('.immutable == true');
		expect(verification).toContain('.draft == false');
		expect(verification).toContain('.assets | length) == 1');
		expect(verification).toContain('actual_size');
		expect(verification).toContain('expected_size');
		expect(verification).toContain('actual_digest');
		expect(verification).toContain('expected_digest');
		expect(verification).toContain('test "$actual_size" = "$expected_size"');
		expect(verification).toContain('test "$actual_digest" = "$expected_digest"');
	});
});
