#!/usr/bin/env bun

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	copyFileSync,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, parse as parsePath, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DESIGN_REPO_URL = 'https://github.com/mgkdante/yesid.dev-design';
export const PACKAGE_NAMES = ['tokens', 'motion', 'gates', 'ui'] as const;
export type PackageName = (typeof PACKAGE_NAMES)[number];

export const EXCLUDE =
	/(^|\/)(__tests__\/|test-fixtures\/|scripts\/|research\/|vitest\.(?:config|setup)\.ts$|vitest\.d\.ts$|\.gitignore$)|\.test\.ts$/;
const LOCAL_WORKTREE_EXCLUDE = /(^|\/)(node_modules|\.turbo)(\/|$)/;

export interface AdoptManifest {
	repo: 'yesid.dev-design';
	tag: string;
	commit: string;
	packages: PackageName[];
	note: string;
	treeHash: string;
}

interface AdoptFromSourceOptions {
	source: string;
	dest: string;
	tag: string;
	packages: PackageName[];
	commit: string;
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

function assertTag(tag: string): void {
	if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(tag)) {
		throw new Error(`invalid tag "${tag}"; expected vX.Y.Z`);
	}
}

function assertCommit(commit: string): void {
	if (!/^[0-9a-f]{40}$/.test(commit)) {
		throw new Error(`invalid commit "${commit}"; expected a 40-character Git commit`);
	}
}

function parsePackages(raw: string): PackageName[] {
	const requested = raw.split(',').map((name) => name.trim());
	if (requested.length === 0 || requested.some((name) => name.length === 0)) {
		throw new Error('--packages must contain at least one package');
	}
	if (new Set(requested).size !== requested.length) {
		throw new Error('--packages contains a duplicate package');
	}
	for (const name of requested) {
		if (!PACKAGE_NAMES.includes(name as PackageName)) {
			throw new Error(`unknown package "${name}"; choose from ${PACKAGE_NAMES.join(',')}`);
		}
	}
	return PACKAGE_NAMES.filter((name) => requested.includes(name));
}

export function parseArgs(argv: string[]): ParsedArgs {
	const values = new Map<string, string>();
	let check = false;
	let help = false;
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
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

function pathInside(parent: string, child: string): boolean {
	const rel = relative(parent, child);
	return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
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

export function walkFiles(root: string, out: string[] = []): string[] {
	for (const entry of readdirSync(root).sort()) {
		const path = join(root, entry);
		const stat = lstatSync(path);
		if (stat.isSymbolicLink()) throw new Error(`refusing symbolic link ${path}`);
		if (stat.isDirectory()) walkFiles(path, out);
		else if (stat.isFile()) out.push(path);
	}
	return out;
}

function walkSourceFiles(root: string, current = root, out: string[] = []): string[] {
	for (const entry of readdirSync(current).sort()) {
		const path = join(current, entry);
		const rel = normalizedRelative(root, path);
		if (LOCAL_WORKTREE_EXCLUDE.test(rel)) continue;
		const stat = lstatSync(path);
		if (stat.isSymbolicLink()) throw new Error(`refusing symbolic link ${path}`);
		if (stat.isDirectory()) walkSourceFiles(root, path, out);
		else if (stat.isFile()) out.push(path);
	}
	return out;
}

export function treeHash(root: string): string {
	const hash = createHash('sha256');
	for (const path of walkFiles(root)) {
		const rel = normalizedRelative(root, path);
		if (rel === 'manifest.json') continue;
		hash.update(rel);
		hash.update('\0');
		hash.update(readFileSync(path));
		hash.update('\0');
	}
	return hash.digest('hex');
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
		if (EXCLUDE.test(rel)) continue;
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

function installStagedDestination(stage: string, dest: string, tempRoot: string): void {
	const backup = join(tempRoot, 'previous');
	const hadPrevious = existsSync(dest);
	if (hadPrevious) renameSync(dest, backup);
	try {
		renameSync(stage, dest);
	} catch (error) {
		if (hadPrevious && existsSync(backup)) renameSync(backup, dest);
		throw error;
	}
	if (hadPrevious) rmSync(backup, { recursive: true, force: true });
}

export function adoptFromSource(options: AdoptFromSourceOptions): AdoptManifest {
	const source = resolve(options.source);
	const dest = resolve(options.dest);
	assertTag(options.tag);
	assertCommit(options.commit);
	assertSafeDestination(dest, source);
	assertReplaceableDestination(dest);
	validatePackageClosure(source, options.packages);
	const license = join(source, 'LICENSE');
	if (!existsSync(license)) throw new Error(`LICENSE not found at ${license}`);

	mkdirSync(dirname(dest), { recursive: true });
	const tempRoot = mkdtempSync(join(dirname(dest), '.yesid-adopt-'));
	const stage = join(tempRoot, 'design');
	mkdirSync(stage);
	try {
		copyFileSync(license, join(stage, 'LICENSE'));
		for (const name of options.packages) {
			const packageDest = join(stage, name);
			copyPackage(join(source, 'packages', name), packageDest);
			rewriteInternalWorkspaceDependencies(packageDest);
		}
		const manifest: AdoptManifest = {
			repo: 'yesid.dev-design',
			tag: options.tag,
			commit: options.commit,
			packages: [...options.packages],
			note: 'GENERATED by tools/adopt.ts. Never edit vendored design code by hand.',
			treeHash: treeHash(stage),
		};
		writeFileSync(join(stage, 'manifest.json'), `${JSON.stringify(manifest, null, '\t')}\n`, 'utf-8');
		installStagedDestination(stage, dest, tempRoot);
		return manifest;
	} finally {
		rmSync(tempRoot, { recursive: true, force: true });
	}
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

export function adopt(options: Extract<ParsedArgs, { mode: 'adopt' }>): AdoptManifest {
	const dest = resolve(options.dest);
	if (options.source) {
		const source = resolve(options.source);
		return adoptFromSource({
			source,
			dest,
			tag: options.tag,
			packages: options.packages,
			commit: readCommit(source),
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
		});
	} finally {
		rmSync(cloneRoot, { recursive: true, force: true });
	}
}

function readManifest(dest: string): AdoptManifest {
	const path = join(dest, 'manifest.json');
	if (!existsSync(path)) throw new Error(`no manifest at ${path}`);
	const manifest = readPackageJson(path) as Partial<AdoptManifest>;
	if (
		manifest.repo !== 'yesid.dev-design' ||
		typeof manifest.tag !== 'string' ||
		typeof manifest.commit !== 'string' ||
		typeof manifest.treeHash !== 'string' ||
		!Array.isArray(manifest.packages)
	) {
		throw new Error(`invalid manifest at ${path}`);
	}
	assertTag(manifest.tag);
	assertCommit(manifest.commit);
	if (!/^[0-9a-f]{64}$/.test(manifest.treeHash)) throw new Error(`invalid treeHash in ${path}`);
	const packages = parsePackages(manifest.packages.join(','));
	if (packages.join(',') !== manifest.packages.join(',')) {
		throw new Error(`manifest packages are not in canonical order at ${path}`);
	}
	return manifest as AdoptManifest;
}

export function checkAdoption(destInput: string): AdoptManifest {
	const dest = resolve(destInput);
	assertSafeDestination(dest);
	const manifest = readManifest(dest);
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

export function main(argv = process.argv.slice(2)): number {
	try {
		const args = parseArgs(argv);
		if (args.mode === 'help') {
			console.log(usage());
			return 0;
		}
		if (args.mode === 'check') {
			const manifest = checkAdoption(args.dest);
			console.log(`✓ ${args.dest} matches ${manifest.tag} @ ${manifest.commit.slice(0, 9)}`);
			return 0;
		}
		const manifest = adopt(args);
		if (args.source) {
			console.log('i local --source mode records the current checkout; verify the tag separately before release');
		}
		console.log(
			`✓ adopted @yesid/{${manifest.packages.join(',')}} at ${manifest.tag} (${manifest.commit.slice(0, 9)})`,
		);
		console.log(`  treeHash ${manifest.treeHash}`);
		return 0;
	} catch (error) {
		console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
		console.error(usage());
		return 1;
	}
}

const isMain = process.argv[1] ? resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (isMain) process.exitCode = main();
