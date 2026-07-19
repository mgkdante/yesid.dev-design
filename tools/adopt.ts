#!/usr/bin/env bun

import { spawnSync } from 'node:child_process';
import {
	copyFileSync,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, parse as parsePath, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	MANIFEST_SCHEMA,
	PACKAGE_EXCLUDE,
	PACKAGE_NAMES,
	REPOSITORY_ID,
	WORKTREE_EXCLUDE,
	assertCommit,
	assertTag,
	exclusionPolicyDigest,
	parseManifest,
	parsePackages,
	pathInside,
	toolDigest,
	treeHash,
	type AdoptManifest,
	type PackageName,
} from './adopt/contract.js';
import {
	ADOPT_EXIT,
	AdoptError,
	installAdoption,
	type AdoptResult,
	type AdoptRuntime,
} from './adopt/transaction.js';

export {
	MANIFEST_SCHEMA,
	PACKAGE_NAMES,
	treeHash,
	type AdoptManifest,
	type PackageName,
} from './adopt/contract.js';
export {
	ADOPT_EXIT,
	AdoptError,
	type AdoptCheckpoint,
	type AdoptExitCode,
	type AdoptResult,
	type AdoptRuntime,
	type AdoptTransactionPaths,
} from './adopt/transaction.js';

export const DESIGN_REPO_URL = 'https://github.com/mgkdante/yesid.dev-design';

export interface AdoptFromSourceOptions {
	source: string;
	dest: string;
	tag: string;
	packages: PackageName[];
	commit: string;
	runtime?: AdoptRuntime;
}

export type ParsedArgs =
	| { mode: 'help' }
	| { mode: 'check'; dest: string }
	| {
			mode: 'adopt';
			tag: string;
			packages: PackageName[];
			dest: string;
			source?: string;
	  };

export function parseArgs(argv: string[]): ParsedArgs {
	const values = new Map<string, string>();
	let check = false;
	let help = false;
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		if (!arg) throw new Error('empty argument');
		if (arg === '--check') {
			if (check) throw new Error('duplicate argument --check');
			check = true;
			continue;
		}
		if (arg === '--help' || arg === '-h') {
			help = true;
			continue;
		}
		if (!['--tag', '--packages', '--dest', '--source'].includes(arg)) {
			throw new Error(`unknown argument "${arg}"`);
		}
		if (values.has(arg)) throw new Error(`duplicate argument ${arg}`);
		const value = argv[index + 1];
		if (!value || value.startsWith('--')) throw new Error(`missing value for ${arg}`);
		values.set(arg, value);
		index++;
	}

	if (help) return { mode: 'help' };
	const dest = values.get('--dest');
	if (check) {
		if (!dest) throw new Error('--check requires --dest');
		for (const incompatible of ['--tag', '--packages', '--source']) {
			if (values.has(incompatible)) throw new Error(`--check cannot be combined with ${incompatible}`);
		}
		return { mode: 'check', dest };
	}

	const tag = values.get('--tag');
	const packageList = values.get('--packages');
	if (!tag || !packageList || !dest) {
		throw new Error('adoption requires --tag, --packages, and --dest');
	}
	assertTag(tag);
	const parsed: ParsedArgs = {
		mode: 'adopt',
		tag,
		packages: parsePackages(packageList),
		dest,
	};
	const source = values.get('--source');
	if (source) parsed.source = source;
	return parsed;
}

function assertSafeDestination(dest: string, source?: string): void {
	const resolvedDest = resolve(dest);
	const forbidden = new Set([parsePath(resolvedDest).root, resolve(process.cwd()), resolve(homedir())]);
	if (forbidden.has(resolvedDest)) {
		throw new Error(`refusing unsafe destination ${resolvedDest}`);
	}
	if (source) {
		const resolvedSource = resolve(source);
		if (pathInside(resolvedDest, resolvedSource) || pathInside(resolvedSource, resolvedDest)) {
			throw new Error('destination and source must not contain one another');
		}
	}
}

function assertReplaceableDestination(dest: string): void {
	if (!existsSync(dest)) return;
	if (!lstatSync(dest).isDirectory()) {
		throw new Error(`refusing to replace a non-adoption destination at ${dest}`);
	}
	if (readdirSync(dest).length === 0) return;
	try {
		readManifest(dest);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(
			`refusing to replace a non-adoption destination at ${dest}; ` +
				`expected an empty directory or a valid yesid.dev-design manifest (${detail})`,
		);
	}
}

function normalizedRelative(root: string, path: string): string {
	return relative(root, path).split(sep).join('/');
}

function walkSourceFiles(root: string, current = root, out: string[] = []): string[] {
	for (const entry of readdirSync(current).sort()) {
		const path = join(current, entry);
		const rel = normalizedRelative(root, path);
		if (WORKTREE_EXCLUDE.test(rel)) continue;
		const stat = lstatSync(path);
		if (stat.isSymbolicLink()) throw new Error(`refusing symbolic link ${path}`);
		if (stat.isDirectory()) walkSourceFiles(root, path, out);
		else if (stat.isFile()) out.push(path);
	}
	return out;
}

function readPackageJson(path: string): Record<string, unknown> {
	try {
		return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
	} catch (error) {
		throw new Error(`cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`);
	}
}

function internalWorkspaceDependencies(packageJson: Record<string, unknown>): PackageName[] {
	const found = new Set<PackageName>();
	for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
		const dependencies = packageJson[field];
		if (!dependencies || typeof dependencies !== 'object') continue;
		for (const [name, version] of Object.entries(dependencies)) {
			if (!name.startsWith('@yesid/') || version !== 'workspace:*') continue;
			const sibling = name.slice('@yesid/'.length);
			if (!PACKAGE_NAMES.includes(sibling as PackageName)) {
				throw new Error(`cannot vendor unresolved workspace dependency ${name}`);
			}
			found.add(sibling as PackageName);
		}
	}
	return [...found];
}

function validatePackageClosure(source: string, packages: PackageName[]): void {
	for (const name of packages) {
		const packageJsonPath = join(source, 'packages', name, 'package.json');
		if (!existsSync(packageJsonPath)) throw new Error(`package ${name} not found at ${packageJsonPath}`);
		for (const sibling of internalWorkspaceDependencies(readPackageJson(packageJsonPath))) {
			if (!packages.includes(sibling)) {
				throw new Error(`${name} requires ${sibling}; include both packages`);
			}
		}
	}
}

function copyPackage(source: string, dest: string): void {
	mkdirSync(dest, { recursive: true });
	for (const path of walkSourceFiles(source)) {
		const rel = normalizedRelative(source, path);
		if (PACKAGE_EXCLUDE.test(rel)) continue;
		const target = join(dest, ...rel.split('/'));
		mkdirSync(dirname(target), { recursive: true });
		copyFileSync(path, target);
	}
}

function copyToolBundle(source: string, dest: string): void {
	const toolRoot = join(source, 'tools');
	const entrypoint = join(toolRoot, 'adopt.ts');
	const moduleRoot = join(toolRoot, 'adopt');
	if (!existsSync(entrypoint) || !existsSync(moduleRoot)) {
		throw new Error(`self-vendored adopt tool is incomplete under ${toolRoot}`);
	}
	const files = [entrypoint, ...walkSourceFiles(moduleRoot)];
	for (const path of files) {
		const rel = normalizedRelative(source, path);
		const target = join(dest, ...rel.split('/'));
		mkdirSync(dirname(target), { recursive: true });
		copyFileSync(path, target);
	}
}

function rewriteInternalWorkspaceDependencies(packageRoot: string): void {
	const packageJsonPath = join(packageRoot, 'package.json');
	const source = readFileSync(packageJsonPath, 'utf-8');
	const rewritten = source.replace(
		/("@yesid\/([^"]+)"\s*:\s*)"workspace:\*"/g,
		(_match, prefix: string, sibling: string) => `${prefix}"file:../${sibling}"`,
	);
	if (rewritten !== source) writeFileSync(packageJsonPath, rewritten, 'utf-8');
}

export function adoptFromSource(options: AdoptFromSourceOptions): AdoptResult {
	const source = resolve(options.source);
	const dest = resolve(options.dest);
	assertTag(options.tag);
	assertCommit(options.commit);
	assertSafeDestination(dest, source);
	assertReplaceableDestination(dest);
	validatePackageClosure(source, options.packages);
	const license = join(source, 'LICENSE');
	if (!existsSync(license)) throw new Error(`LICENSE not found at ${license}`);

	return installAdoption(
		{
			dest,
			build(stage) {
				copyFileSync(license, join(stage, 'LICENSE'));
				copyToolBundle(source, stage);
				for (const name of options.packages) {
					const packageDest = join(stage, name);
					copyPackage(join(source, 'packages', name), packageDest);
					rewriteInternalWorkspaceDependencies(packageDest);
				}
				const manifest: AdoptManifest = {
					schema: MANIFEST_SCHEMA,
					repository: REPOSITORY_ID,
					provenance: {
						mode: 'worktree',
						tag: {
							name: options.tag,
							object: options.commit,
							peeledCommit: options.commit,
						},
						asset: null,
					},
					packages: [...options.packages],
					exclusionPolicyDigest: exclusionPolicyDigest(),
					toolDigest: toolDigest(stage),
					treeHash: treeHash(stage),
				};
				writeFileSync(
					join(stage, 'manifest.json'),
					`${JSON.stringify(manifest, null, '\t')}\n`,
					'utf-8',
				);
				return manifest;
			},
			inspect: checkAdoption,
			recognize(path) {
				try {
					readManifest(path);
					return true;
				} catch {
					return false;
				}
			},
		},
		options.runtime,
	);
}

function runGit(args: string[], cwd?: string): string {
	const result = spawnSync('git', args, { cwd, encoding: 'utf-8' });
	if (result.status !== 0) {
		const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.status ?? 'unknown'}`;
		throw new Error(`git ${args[0]} failed: ${detail}`);
	}
	return result.stdout.trim();
}

function readCommit(source: string): string {
	const commit = runGit(['-C', source, 'rev-parse', 'HEAD']);
	assertCommit(commit);
	return commit;
}

export function adopt(
	options: Extract<ParsedArgs, { mode: 'adopt' }>,
	runtime: AdoptRuntime = {},
): AdoptResult {
	try {
		const dest = resolve(options.dest);
		if (options.source) {
			const source = resolve(options.source);
			return adoptFromSource({
				source,
				dest,
				tag: options.tag,
				packages: options.packages,
				commit: readCommit(source),
				runtime,
			});
		}

		const cloneRoot = mkdtempSync(join(tmpdir(), 'yesid-adopt-source-'));
		const source = join(cloneRoot, 'yesid.dev-design');
		try {
			runGit([
				'clone',
				'--depth',
				'1',
				'--single-branch',
				'--branch',
				options.tag,
				DESIGN_REPO_URL,
				source,
			]);
			return adoptFromSource({
				source,
				dest,
				tag: options.tag,
				packages: options.packages,
				commit: readCommit(source),
				runtime,
			});
		} finally {
			rmSync(cloneRoot, { recursive: true, force: true });
		}
	} catch (error) {
		if (error instanceof AdoptError) throw error;
		const detail = error instanceof Error ? error.message : String(error);
		throw new AdoptError(
			ADOPT_EXIT.PRECONDITION,
			`adoption precondition failed: ${detail}`,
			{ cause: error },
		);
	}
}

function readManifest(dest: string): AdoptManifest {
	const path = join(dest, 'manifest.json');
	if (!existsSync(path)) throw new Error(`no manifest at ${path}`);
	return parseManifest(readPackageJson(path), path);
}

export function checkAdoption(destInput: string): AdoptManifest {
	const dest = resolve(destInput);
	assertSafeDestination(dest);
	const manifest = readManifest(dest);
	const actualToolDigest = toolDigest(dest);
	if (actualToolDigest !== manifest.toolDigest) {
		throw new Error(`adopt tool digest mismatch in ${dest}`);
	}
	if (manifest.exclusionPolicyDigest !== exclusionPolicyDigest()) {
		throw new Error(`adoption exclusion policy differs from this tool`);
	}
	const actual = treeHash(dest);
	if (actual !== manifest.treeHash) {
		throw new Error(
			`vendor tree hash mismatch\n  manifest: ${manifest.treeHash}\n  actual:   ${actual}\n` +
				'Vendored design files changed after adoption. Upstream the change and bump the pinned tag.',
		);
	}
	return manifest;
}

function usage(): string {
	return [
		'Usage:',
		'  bun tools/adopt.ts --tag vX.Y.Z --packages tokens,motion,gates,ui --dest vendor/design',
		'  bun tools/adopt.ts --tag vX.Y.Z --packages tokens,motion,gates,ui --dest vendor/design --source ../yesid.dev-design',
		'  bun tools/adopt.ts --check --dest vendor/design',
	].join('\n');
}

export function main(argv = process.argv.slice(2), runtime: AdoptRuntime = {}): number {
	let args: ParsedArgs;
	try {
		args = parseArgs(argv);
	} catch (error) {
		console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
		console.error(usage());
		return ADOPT_EXIT.USAGE;
	}
	if (args.mode === 'help') {
		console.log(usage());
		return ADOPT_EXIT.OK;
	}
	if (args.mode === 'check') {
		try {
			const manifest = checkAdoption(args.dest);
			console.log(
				`✓ ${args.dest} matches ${manifest.provenance.tag.name} @ ${manifest.provenance.tag.peeledCommit.slice(0, 9)}`,
			);
			return ADOPT_EXIT.OK;
		} catch (error) {
			console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
			return ADOPT_EXIT.CHECK_FAILED;
		}
	}
	try {
		const result = adopt(args, runtime);
		const { manifest } = result;
		if (args.source) {
			console.log('i local --source mode records the current checkout; verify the tag separately before release');
		}
		console.log(
			`✓ adopted @yesid/{${manifest.packages.join(',')}} at ${manifest.provenance.tag.name} (${manifest.provenance.tag.peeledCommit.slice(0, 9)})`,
		);
		console.log(`  treeHash ${manifest.treeHash}`);
		if (result.outcome === 'noop') console.log('= unchanged');
		return ADOPT_EXIT.OK;
	} catch (error) {
		console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
		if (error instanceof AdoptError) return error.code;
		return ADOPT_EXIT.INTERNAL;
	}
}

const isMain = process.argv[1] ? resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (isMain) process.exitCode = main();
