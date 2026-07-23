/// <reference path="./svelte2tsx-mjs.d.ts" />

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Extractor, ExtractorConfig, ExtractorLogLevel } from '@microsoft/api-extractor';
import { emitDts } from 'svelte2tsx/index.mjs';
import ts from 'typescript';
import {
	RELEASED_PACKAGES,
	parseChangeFragment,
	type ParsedChangeFragment,
	type ReleaseBump,
	type ReleasedPackageName,
} from './release-core.js';

export {
	RELEASED_PACKAGES,
	parseChangeFragment,
	type ParsedChangeFragment,
	type ReleaseBump,
	type ReleasedPackageName,
};

export interface ApiApprovalInput {
	baseReports: Readonly<Partial<Record<ReleasedPackageName, string>>>;
	currentReports: Readonly<Partial<Record<ReleasedPackageName, string>>>;
	baseFragments: Readonly<Record<string, string>>;
	currentFragments: Readonly<Record<string, string>>;
}

export interface ApiApprovalResult {
	changedPackages: ReleasedPackageName[];
	newFragments: string[];
}

export interface PublicSymbol {
	packageName: ReleasedPackageName;
	subpath: string;
	name: string;
	releaseTag: string | undefined;
}

export type ConditionalExport = Readonly<Record<string, string>>;
export type PackageExport = string | ConditionalExport;

export interface DeclarationNamespace {
	name: string;
	target: string;
}

export interface DirectAssetTarget {
	subpath: string;
	target: string;
	conditions: string[];
}

interface ReleasedPackage {
	name: ReleasedPackageName;
	directory: 'tokens' | 'motion' | 'gates' | 'seo-kit' | 'ui' | 'analytics';
}

interface PackageManifest {
	name: string;
	exports?: Readonly<Record<string, PackageExport>>;
}

const RELEASED_PACKAGE_CONFIG: readonly ReleasedPackage[] = [
	{ name: '@yesid/tokens', directory: 'tokens' },
	{ name: '@yesid/motion', directory: 'motion' },
	{ name: '@yesid/gates', directory: 'gates' },
	{ name: '@yesid/seo-kit', directory: 'seo-kit' },
	{ name: '@yesid/ui', directory: 'ui' },
	{ name: '@yesid/analytics', directory: 'analytics' },
];

export const API_REPORT_PATHS: Readonly<Record<ReleasedPackageName, string>> = {
	'@yesid/tokens': 'api-reports/tokens.api.md',
	'@yesid/motion': 'api-reports/motion.api.md',
	'@yesid/gates': 'api-reports/gates.api.md',
	'@yesid/seo-kit': 'api-reports/seo-kit.api.md',
	'@yesid/ui': 'api-reports/ui.api.md',
	'@yesid/analytics': 'api-reports/analytics.api.md',
};

const DIRECT_ASSET = /\.(?:css|json)$/u;

function readJson<T>(path: string): T {
	return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function normalizeLineEndings(source: string): string {
	return source.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

function sha256(path: string): string {
	return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function exportTargets(value: PackageExport): string[] {
	return typeof value === 'string' ? [value] : Object.values(value);
}

function uniqueSourceTargets(exports: Readonly<Record<string, PackageExport>>): string[] {
	const targets: string[] = [];
	for (const value of Object.values(exports)) {
		for (const target of exportTargets(value)) {
			if (!DIRECT_ASSET.test(target) && !targets.includes(target)) targets.push(target);
		}
	}
	return targets;
}

function declarationPath(packageOutput: string, target: string): string {
	return join(packageOutput, target.replace(/^\.\//u, '').replace(/\.ts$/u, '.d.ts'));
}

function surfaceName(target: string): string {
	const parts = target
		.replace(/^\.\/src\//u, '')
		.replace(/(?:\/index)?\.ts$/u, '')
		.split(/[^A-Za-z0-9]+/u)
		.filter(Boolean);
	const name = parts.map((part) => `${part[0]?.toUpperCase()}${part.slice(1)}`).join('');
	if (!name) return 'Root';
	return /^\d/u.test(name) ? `Surface${name}` : name;
}

export function planDeclarationNamespaces(targets: readonly string[]): DeclarationNamespace[] {
	const planned = targets.map((target) => ({ name: surfaceName(target), target }));
	const byName = new Map<string, string[]>();
	for (const { name, target } of planned) {
		const collisions = byName.get(name) ?? [];
		collisions.push(target);
		byName.set(name, collisions);
	}
	for (const [name, collisions] of byName) {
		if (collisions.length > 1) {
			throw new Error(`Declaration namespace collision ${name}: ${collisions.join(', ')}`);
		}
	}
	return planned;
}

export function collectDirectAssetTargets(
	exports: Readonly<Record<string, PackageExport>>,
): DirectAssetTarget[] {
	const assets: DirectAssetTarget[] = [];
	for (const [subpath, value] of Object.entries(exports)) {
		const conditions = typeof value === 'string' ? [['default', value] as const] : Object.entries(value);
		for (const [condition, target] of conditions) {
			if (!DIRECT_ASSET.test(target)) continue;
			const existing = assets.find(
				(candidate) => candidate.subpath === subpath && candidate.target === target,
			);
			if (existing) existing.conditions.push(condition);
			else assets.push({ subpath, target, conditions: [condition] });
		}
	}
	return assets;
}

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
	return diagnostics
		.map((diagnostic) => {
			const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
			if (!diagnostic.file || diagnostic.start === undefined) return message;
			const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
			return `${diagnostic.file.fileName}:${position.line + 1}:${position.character + 1} ${message}`;
		})
		.join('\n');
}

function emitTypeScriptDeclarations(
	sourcePackage: string,
	packageOutput: string,
	targets: readonly string[],
): void {
	const configPath = join(sourcePackage, 'tsconfig.json');
	const config = ts.readConfigFile(configPath, ts.sys.readFile);
	if (config.error) throw new Error(formatDiagnostics([config.error]));
	const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, sourcePackage);
	const rootNames = targets.map((target) => resolve(sourcePackage, target));
	const program = ts.createProgram(rootNames, {
		...parsed.options,
		declaration: true,
		declarationMap: false,
		declarationDir: packageOutput,
		emitDeclarationOnly: true,
		noEmit: false,
		rootDir: sourcePackage,
	});
	const emit = program.emit();
	const diagnostics = [...ts.getPreEmitDiagnostics(program), ...emit.diagnostics].filter(
		(diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
	);
	if (diagnostics.length > 0) throw new Error(formatDiagnostics(diagnostics));
}

async function emitPackageDeclarations(
	repositoryRoot: string,
	config: ReleasedPackage,
	packageOutput: string,
	targets: readonly string[],
): Promise<void> {
	const sourcePackage = join(repositoryRoot, 'packages', config.directory);
	if (config.name === '@yesid/ui') {
		await emitDts({
			declarationDir: packageOutput,
			libRoot: sourcePackage,
			svelteShimsPath: join(
				repositoryRoot,
				'node_modules',
				'svelte2tsx',
				'svelte-shims-v4.d.ts',
			),
			tsconfig: 'tsconfig.json',
		});
		return;
	}
	emitTypeScriptDeclarations(sourcePackage, packageOutput, targets);
}

function exportedSymbols(
	packageName: ReleasedPackageName,
	subpath: string,
	entrypoint: string,
	tsconfigPath: string,
): PublicSymbol[] {
	const config = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
	if (config.error) throw new Error(formatDiagnostics([config.error]));
	const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(tsconfigPath));
	const program = ts.createProgram([entrypoint], parsed.options);
	const source = program.getSourceFile(entrypoint);
	const moduleSymbol = source && program.getTypeChecker().getSymbolAtLocation(source);
	if (!source || !moduleSymbol) throw new Error(`Cannot inspect declarations for ${packageName} ${subpath}`);
	const checker = program.getTypeChecker();
	return checker.getExportsOfModule(moduleSymbol).map((symbol) => {
		const aliased = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
		const tags = [...symbol.getJsDocTags(checker), ...aliased.getJsDocTags(checker)];
		return {
			packageName,
			subpath,
			name: symbol.getName(),
			releaseTag: tags.find((tag) => tag.name === 'internal')?.name,
		};
	});
}

function extractorReport(
	repositoryRoot: string,
	packageOutput: string,
	entrypoint: string,
	reportName: string,
): string {
	const reportRoot = join(packageOutput, '.api-extractor', reportName);
	const approved = join(reportRoot, 'approved');
	const generated = join(reportRoot, 'generated');
	mkdirSync(approved, { recursive: true });
	mkdirSync(generated, { recursive: true });
	const packageJsonPath = join(packageOutput, 'package.json');
	const configPath = join(packageOutput, 'api-extractor.json');
	const extractorConfig = ExtractorConfig.prepare({
		configObject: {
			projectFolder: packageOutput,
			mainEntryPointFilePath: entrypoint,
			compiler: { tsconfigFilePath: join(packageOutput, 'tsconfig.json'), skipLibCheck: true },
			apiReport: {
				enabled: true,
				includeForgottenExports: true,
				reportFileName: 'surface',
				reportFolder: approved,
				reportTempFolder: generated,
				reportVariants: ['complete'],
			},
			docModel: { enabled: false },
			dtsRollup: { enabled: false },
			tsdocMetadata: { enabled: false },
			newlineKind: 'lf',
		},
		configObjectFullPath: configPath,
		packageJsonFullPath: packageJsonPath,
	});
	const errors: string[] = [];
	const result = Extractor.invoke(extractorConfig, {
		localBuild: true,
		showVerboseMessages: false,
		typescriptCompilerFolder: join(repositoryRoot, 'node_modules', 'typescript'),
		messageCallback(message) {
			if (message.logLevel === ExtractorLogLevel.Error) errors.push(message.text);
			message.handled = true;
		},
	});
	if (!result.succeeded) {
		throw new Error(`API Extractor failed for ${entrypoint}\n${errors.join('\n')}`);
	}
	return normalizeLineEndings(readFileSync(join(approved, 'surface.api.md'), 'utf8')).trim();
}

function formatExportMap(exports: Readonly<Record<string, PackageExport>>): string {
	const lines = ['## Conditioned exports', ''];
	for (const [subpath, value] of Object.entries(exports)) {
		lines.push(`### \`${subpath}\``);
		if (typeof value === 'string') {
			lines.push('', `- \`default\` → \`${value}\``, '');
			continue;
		}
		lines.push('');
		for (const [condition, target] of Object.entries(value)) {
			lines.push(`- \`${condition}\` → \`${target}\``);
		}
		lines.push('');
	}
	return lines.join('\n');
}

function publicSubpathsForTarget(
	exports: Readonly<Record<string, PackageExport>>,
	target: string,
): string[] {
	return Object.entries(exports)
		.filter(([, value]) => exportTargets(value).includes(target))
		.map(([subpath]) => subpath);
}

async function createPackageReport(
	repositoryRoot: string,
	workspaceRoot: string,
	config: ReleasedPackage,
): Promise<string> {
	const sourcePackage = join(repositoryRoot, 'packages', config.directory);
	const manifest = readJson<PackageManifest>(join(sourcePackage, 'package.json'));
	if (manifest.name !== config.name || !manifest.exports) {
		throw new Error(`${sourcePackage}/package.json does not define ${config.name} exports`);
	}
	const exports = manifest.exports;
	const packageOutput = join(workspaceRoot, 'packages', config.directory);
	mkdirSync(packageOutput, { recursive: true });
	cpSync(join(sourcePackage, 'package.json'), join(packageOutput, 'package.json'));
	writeFileSync(
		join(packageOutput, 'tsconfig.json'),
		`${JSON.stringify(
			{
				compilerOptions: {
					lib: ['ES2022', 'DOM', 'DOM.Iterable'],
					module: 'ESNext',
					moduleResolution: 'bundler',
					resolveJsonModule: true,
					skipLibCheck: true,
					strict: true,
					target: 'ES2022',
				},
				include: ['**/*.d.ts'],
			},
			null,
			2,
		)}\n`,
	);

	const targets = uniqueSourceTargets(exports);
	await emitPackageDeclarations(repositoryRoot, config, packageOutput, targets);

	const declarationSections: string[] = ['## Declaration namespaces', ''];
	const syntheticExports: string[] = [];
	for (const { name: namespace, target } of planDeclarationNamespaces(targets)) {
		const entrypoint = declarationPath(packageOutput, target);
		if (!existsSync(entrypoint)) {
			throw new Error(`${config.name} export target ${target} did not emit ${entrypoint}`);
		}
		const subpaths = publicSubpathsForTarget(exports, target);
		for (const subpath of subpaths) {
			validatePublicSymbols(
				exportedSymbols(config.name, subpath, entrypoint, join(packageOutput, 'tsconfig.json')),
			);
		}
		const declarationRelative = `./${target
			.replace(/^\.\//u, '')
			.replace(/\.ts$/u, '.js')}`;
		syntheticExports.push(`export * as ${namespace} from ${JSON.stringify(declarationRelative)};`);
		declarationSections.push(
			`- \`${namespace}\` → \`${target}\` (${subpaths.map((subpath) => `\`${subpath}\``).join(', ')})`,
		);
	}
	declarationSections.push('');
	const syntheticEntrypoint = join(packageOutput, 'api-surface.d.ts');
	writeFileSync(syntheticEntrypoint, `${syntheticExports.join('\n')}\n`);
	declarationSections.push(
		extractorReport(repositoryRoot, packageOutput, syntheticEntrypoint, 'package'),
		'',
	);

	const assetSection = ['## Direct public assets', ''];
	for (const { subpath, target, conditions } of collectDirectAssetTargets(exports)) {
		assetSection.push(
			`- \`${subpath}\` — direct asset \`${target}\` (${conditions.map((condition) => `\`${condition}\``).join(', ')}), sha256 \`${sha256(resolve(sourcePackage, target))}\``,
		);
	}
	assetSection.push('');

	return normalizeLineEndings(
		[
			'<!-- GENERATED: bun run api:report; DO NOT EDIT -->',
			`# \`${config.name}\` API surface`,
			'',
			formatExportMap(exports),
			assetSection.join('\n'),
			declarationSections.join('\n'),
		]
			.join('\n')
			.trimEnd() + '\n',
	);
}

function createApiWorkspace(repositoryRoot: string): string {
	const nodeModules = join(repositoryRoot, 'node_modules');
	if (!existsSync(nodeModules)) throw new Error('node_modules is required; run bun install first');
	const workspaceRoot = mkdtempSync(join(tmpdir(), 'yesid-api-authority-'));
	symlinkSync(nodeModules, join(workspaceRoot, 'node_modules'), 'junction');
	return workspaceRoot;
}

export async function createApiReport(
	repositoryRootInput: string,
	packageName: ReleasedPackageName,
): Promise<string> {
	const repositoryRoot = resolve(repositoryRootInput);
	const config = RELEASED_PACKAGE_CONFIG.find((candidate) => candidate.name === packageName);
	if (!config) throw new Error(`Unknown released package ${packageName}`);
	const workspaceRoot = createApiWorkspace(repositoryRoot);
	try {
		return await createPackageReport(repositoryRoot, workspaceRoot, config);
	} finally {
		rmSync(workspaceRoot, { recursive: true, force: true });
	}
}

export async function createApiReports(
	repositoryRootInput: string,
): Promise<Record<ReleasedPackageName, string>> {
	const repositoryRoot = resolve(repositoryRootInput);
	const workspaceRoot = createApiWorkspace(repositoryRoot);
	try {
		const reports = {} as Record<ReleasedPackageName, string>;
		for (const config of RELEASED_PACKAGE_CONFIG) {
			reports[config.name] = await createPackageReport(repositoryRoot, workspaceRoot, config);
		}
		return reports;
	} finally {
		rmSync(workspaceRoot, { recursive: true, force: true });
	}
}

export function writeApiReports(
	repositoryRootInput: string,
	reports: Readonly<Record<ReleasedPackageName, string>>,
): void {
	const repositoryRoot = resolve(repositoryRootInput);
	for (const packageName of RELEASED_PACKAGES) {
		const path = join(repositoryRoot, API_REPORT_PATHS[packageName]);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, reports[packageName], 'utf8');
	}
}

export function checkApiReports(
	repositoryRootInput: string,
	reports: Readonly<Record<ReleasedPackageName, string>>,
): void {
	const repositoryRoot = resolve(repositoryRootInput);
	const stale = RELEASED_PACKAGES.filter((packageName) => {
		const path = join(repositoryRoot, API_REPORT_PATHS[packageName]);
		return !existsSync(path) || readFileSync(path, 'utf8') !== reports[packageName];
	}).map((packageName) => API_REPORT_PATHS[packageName]);
	if (stale.length > 0) {
		throw new Error(`API reports are stale: ${stale.join(', ')}. Run bun run api:report.`);
	}
}

function git(
	repositoryRoot: string,
	args: readonly string[],
	allowFailure = false,
): string | undefined {
	const result = spawnSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' });
	if (result.status === 0) return result.stdout;
	if (allowFailure) return undefined;
	throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`);
}

function readCurrentReports(repositoryRoot: string): Partial<Record<ReleasedPackageName, string>> {
	return Object.fromEntries(
		RELEASED_PACKAGES.flatMap((packageName) => {
			const path = join(repositoryRoot, API_REPORT_PATHS[packageName]);
			return existsSync(path) ? [[packageName, readFileSync(path, 'utf8')]] : [];
		}),
	) as Partial<Record<ReleasedPackageName, string>>;
}

function readBaseReports(
	repositoryRoot: string,
	base: string,
): Partial<Record<ReleasedPackageName, string>> {
	return Object.fromEntries(
		RELEASED_PACKAGES.flatMap((packageName) => {
			const source = git(repositoryRoot, ['show', `${base}:${API_REPORT_PATHS[packageName]}`], true);
			return source === undefined ? [] : [[packageName, source]];
		}),
	) as Partial<Record<ReleasedPackageName, string>>;
}

function readCurrentFragments(repositoryRoot: string): Record<string, string> {
	const directory = join(repositoryRoot, '.changes');
	if (!existsSync(directory)) return {};
	return Object.fromEntries(
		readdirSync(directory, { withFileTypes: true })
			.filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
			.map((entry) => {
				const path = `.changes/${entry.name}`;
				return [path, readFileSync(join(directory, entry.name), 'utf8')];
			}),
	);
}

function readBaseFragments(repositoryRoot: string, base: string): Record<string, string> {
	const paths =
		git(repositoryRoot, ['ls-tree', '-r', '--name-only', base, '--', '.changes'], true)
			?.split(/\r?\n/u)
			.filter((path) => /^\.changes\/[^/]+\.md$/u.test(path)) ?? [];
	return Object.fromEntries(
		paths.map((path) => [path, git(repositoryRoot, ['show', `${base}:${path}`]) ?? '']),
	);
}

function parseBase(args: readonly string[]): string {
	const normalized = args.filter((argument) => argument !== '--');
	const index = normalized.indexOf('--base');
	const base = index === -1 ? undefined : normalized[index + 1];
	if (!base || !/^[0-9a-f]{40}$/u.test(base)) {
		throw new Error('approve requires --base followed by an exact 40-character lowercase Git SHA');
	}
	return base;
}

export async function main(args = process.argv.slice(2)): Promise<void> {
	const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
	const [command, ...rest] = args;
	if (command === 'report') {
		writeApiReports(repositoryRoot, await createApiReports(repositoryRoot));
		console.log('API reports updated');
		return;
	}
	if (command === 'check') {
		checkApiReports(repositoryRoot, await createApiReports(repositoryRoot));
		console.log('API reports current');
		return;
	}
	if (command === 'approve') {
		const base = parseBase(rest);
		git(repositoryRoot, ['cat-file', '-e', `${base}^{commit}`]);
		const result = authorizeApiChanges({
			baseReports: readBaseReports(repositoryRoot, base),
			currentReports: readCurrentReports(repositoryRoot),
			baseFragments: readBaseFragments(repositoryRoot, base),
			currentFragments: readCurrentFragments(repositoryRoot),
		});
		console.log(
			result.changedPackages.length === 0
				? 'API report approval: no post-baseline changes'
				: `API report approval: ${result.changedPackages.join(', ')} authorized by ${result.newFragments.join(', ')}`,
		);
		return;
	}
	throw new Error('usage: bun tools/api-authority.ts <report|check|approve --base SHA>');
}

if (import.meta.main) {
	main().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}

export function authorizeApiChanges(input: ApiApprovalInput): ApiApprovalResult {
	const firstBaseline = RELEASED_PACKAGES.every(
		(packageName) => input.baseReports[packageName] === undefined,
	);
	const changedPackages = firstBaseline
		? []
		: RELEASED_PACKAGES.filter(
				(packageName) => input.currentReports[packageName] !== input.baseReports[packageName],
			);

	const newFragments = Object.keys(input.currentFragments)
		.filter((path) => input.baseFragments[path] === undefined)
		.sort();
	const parsedFragments = Object.entries(input.currentFragments).map(([path, source]) =>
		parseChangeFragment(source, path),
	);
	const authorizedPackages = new Set(
		parsedFragments
			.filter((candidate) => newFragments.includes(candidate.path))
			.flatMap((candidate) => [...candidate.packages.keys()]),
	);
	const missing = changedPackages.filter((packageName) => !authorizedPackages.has(packageName));
	if (missing.length > 0) {
		throw new Error(`API report changes require a new release fragment for: ${missing.join(', ')}`);
	}

	return { changedPackages, newFragments };
}

function usesNonPublicSymbolName(name: string): boolean {
	if (name.startsWith('_')) return true;
	if (name.split(/[_-]/u).some((part) => /^(?:tests?|internal)$/iu.test(part))) return true;
	return (
		/^(?:tests?|internal)(?:$|[A-Z])/u.test(name) ||
		/(?:^|[a-z0-9])(?:Tests?|Internal)(?:$|[A-Z])/u.test(name)
	);
}

export function validatePublicSymbols(symbols: readonly PublicSymbol[]): void {
	for (const symbol of symbols) {
		const context = `${symbol.packageName}${symbol.subpath === '.' ? '' : `/${symbol.subpath.slice(2)}`}`;
		if (symbol.releaseTag?.toLowerCase() === 'internal') {
			throw new Error(`${context} export ${symbol.name} is marked @internal`);
		}
		if (usesNonPublicSymbolName(symbol.name)) {
			throw new Error(`${context} export ${symbol.name} uses a test/internal public name`);
		}
	}
}
