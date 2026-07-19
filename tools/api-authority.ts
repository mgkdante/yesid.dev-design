export const RELEASED_PACKAGES = [
	'@yesid/tokens',
	'@yesid/motion',
	'@yesid/gates',
	'@yesid/ui',
] as const;

export type ReleasedPackageName = (typeof RELEASED_PACKAGES)[number];
export type ReleaseBump = 'patch' | 'minor' | 'major';

export interface ParsedChangeFragment {
	path: string;
	packages: ReadonlyMap<ReleasedPackageName, ReleaseBump>;
	description: string;
}

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

function isReleasedPackage(value: string): value is ReleasedPackageName {
	return RELEASED_PACKAGES.some((packageName) => packageName === value);
}

function isReleaseBump(value: string): value is ReleaseBump {
	return value === 'patch' || value === 'minor' || value === 'major';
}

export function parseChangeFragment(source: string, path: string): ParsedChangeFragment {
	const normalized = source.replaceAll('\r\n', '\n');
	if (!normalized.startsWith('---\n')) {
		throw new Error(`${path} must start with release fragment front matter`);
	}

	const end = normalized.indexOf('\n---\n', 4);
	if (end === -1) throw new Error(`${path} must close release fragment front matter`);

	const packages = new Map<ReleasedPackageName, ReleaseBump>();
	const declarations = normalized.slice(4, end).split('\n');
	for (const declaration of declarations) {
		const match = declaration.match(/^"([^"]+)":\s*([^\s]+)$/u);
		if (!match?.[1] || !match[2]) {
			throw new Error(`${path} has malformed release declaration: ${declaration || '<empty>'}`);
		}
		const packageName = match[1];
		const bump = match[2];
		if (!isReleasedPackage(packageName)) {
			throw new Error(`${path} names unknown released package ${packageName}`);
		}
		if (!isReleaseBump(bump)) {
			throw new Error(`${path} has invalid bump ${bump} for ${packageName}`);
		}
		if (packages.has(packageName)) {
			throw new Error(`${path} declares ${packageName} more than once`);
		}
		packages.set(packageName, bump);
	}
	if (packages.size === 0) throw new Error(`${path} must name at least one released package`);

	const description = normalized.slice(end + '\n---\n'.length).trim();
	if (!description) throw new Error(`${path} must contain a non-empty change description`);
	return { path, packages, description };
}

export function authorizeApiChanges(input: ApiApprovalInput): ApiApprovalResult {
	const changedPackages = RELEASED_PACKAGES.filter((packageName) => {
		const base = input.baseReports[packageName];
		return base !== undefined && input.currentReports[packageName] !== base;
	});

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

export function validatePublicSymbols(symbols: readonly PublicSymbol[]): void {
	for (const symbol of symbols) {
		const context = `${symbol.packageName}${symbol.subpath === '.' ? '' : `/${symbol.subpath.slice(2)}`}`;
		if (symbol.releaseTag?.toLowerCase() === 'internal') {
			throw new Error(`${context} export ${symbol.name} is marked @internal`);
		}
		if (symbol.name.startsWith('_') || /(?:for|onlyfor)tests?$/iu.test(symbol.name)) {
			throw new Error(`${context} export ${symbol.name} uses a test/internal public name`);
		}
	}
}
