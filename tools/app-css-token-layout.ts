import { readFileSync } from 'node:fs';
import postcss, { type AtRule, type Comment } from 'postcss';

const TOKEN_STYLESHEET = '@yesid/tokens/tokens.css';
const SENTINEL_START = '===== TOKENS:START =====';
const LAYOUT_ERROR =
	'app.css must keep exactly one active top-level @yesid/tokens/tokens.css import before the generated token sentinel';

function importTarget(params: string): string | undefined {
	const source = params.trim();
	const quoted = source.match(/^(?:'([^']+)'|"([^"]+)")$/u);
	if (quoted) return quoted[1] ?? quoted[2];
	const url = source.match(/^url\(\s*(?:'([^']+)'|"([^"]+)"|([^'"()\s]+))\s*\)$/iu);
	return url?.[1] ?? url?.[2] ?? url?.[3];
}

export function assertAppCssTokenLayout(source: string): void {
	const root = postcss.parse(source, { from: undefined });
	const nodes = root.nodes ?? [];
	const sentinels = nodes.filter(
		(node): node is Comment => node.type === 'comment' && node.text.trim() === SENTINEL_START,
	);
	const imports = nodes.filter(
		(node): node is AtRule =>
			node.type === 'atrule' &&
			node.name.toLowerCase() === 'import' &&
			importTarget(node.params) === TOKEN_STYLESHEET,
	);

	if (
		sentinels.length !== 1 ||
		imports.length !== 1 ||
		nodes.indexOf(imports[0]!) >= nodes.indexOf(sentinels[0]!)
	) {
		throw new Error(LAYOUT_ERROR);
	}
}

if (import.meta.main) {
	try {
		assertAppCssTokenLayout(readFileSync(0, 'utf8'));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`✗ pre-commit: ${message}`);
		process.exitCode = 1;
	}
}
