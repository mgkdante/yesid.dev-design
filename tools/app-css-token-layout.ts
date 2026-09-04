import { readFileSync } from 'node:fs';
import postcss, { type AtRule, type Comment } from 'postcss';

const TOKEN_STYLESHEET = '@yesid/tokens/tokens.css';
const SENTINEL_START = '===== TOKENS:START =====';
const LAYOUT_ERROR =
	'app.css must keep exactly one active top-level @yesid/tokens/tokens.css import before the generated token sentinel';

function decodeCssEscapes(value: string): string {
	let decoded = '';
	for (let index = 0; index < value.length; index += 1) {
		const character = value[index]!;
		if (character !== '\\') {
			decoded += character;
			continue;
		}

		index += 1;
		if (index >= value.length) {
			decoded += '\ufffd';
			break;
		}
		const escaped = value[index]!;
		if (escaped === '\n' || escaped === '\f') continue;
		if (escaped === '\r') {
			if (value[index + 1] === '\n') index += 1;
			continue;
		}
		if (!/[0-9a-f]/iu.test(escaped)) {
			decoded += escaped;
			continue;
		}

		let hexadecimal = escaped;
		while (hexadecimal.length < 6 && /[0-9a-f]/iu.test(value[index + 1] ?? '')) {
			index += 1;
			hexadecimal += value[index]!;
		}
		if (/[\t\n\f\r ]/u.test(value[index + 1] ?? '')) {
			index += 1;
			if (value[index] === '\r' && value[index + 1] === '\n') index += 1;
		}
		const codePoint = Number.parseInt(hexadecimal, 16);
		decoded +=
			codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)
				? '\ufffd'
				: String.fromCodePoint(codePoint);
	}
	return decoded;
}

function cssEscapeEnd(value: string, start: number): number {
	let cursor = start + 1;
	if (cursor >= value.length) return cursor;
	if (/[0-9a-f]/iu.test(value[cursor]!)) {
		let digits = 0;
		while (digits < 6 && /[0-9a-f]/iu.test(value[cursor] ?? '')) {
			cursor += 1;
			digits += 1;
		}
		if (/[\t\n\f\r ]/u.test(value[cursor] ?? '')) {
			if (value[cursor] === '\r' && value[cursor + 1] === '\n') cursor += 1;
			cursor += 1;
		}
		return cursor;
	}
	if (value[cursor] === '\r' && value[cursor + 1] === '\n') return cursor + 2;
	return cursor + 1;
}

function stripCssComments(value: string): string {
	let result = '';
	let quote: '"' | "'" | undefined;
	for (let index = 0; index < value.length; index += 1) {
		const character = value[index]!;
		if (quote) {
			result += character;
			if (character === '\\') {
				const end = cssEscapeEnd(value, index);
				result += value.slice(index + 1, end);
				index = end - 1;
			} else if (character === quote) {
				quote = undefined;
			}
			continue;
		}
		if (character === '"' || character === "'") {
			quote = character;
			result += character;
			continue;
		}
		if (character === '/' && value[index + 1] === '*') {
			const end = value.indexOf('*/', index + 2);
			if (end === -1) return `${result} `;
			result += ' ';
			index = end + 1;
			continue;
		}
		result += character;
	}
	return result;
}

function atRuleParts(node: AtRule): { name: string; params: string } {
	const serialized = node.toString();
	const body = serialized.startsWith('@') ? serialized.slice(1) : serialized;
	let index = 0;
	while (index < body.length) {
		const character = body[index]!;
		if (character === '\\') {
			index = cssEscapeEnd(body, index);
			continue;
		}
		if (!/[-_0-9a-z]/iu.test(character) && character.codePointAt(0)! < 0x80) break;
		index += 1;
	}
	return {
		name: decodeCssEscapes(body.slice(0, index)).toLowerCase(),
		params: stripCssComments(body.slice(index).replace(/;$/u, '')).trim(),
	};
}

function quotedComponent(source: string): { target: string; remainder: string } | undefined {
	const quote = source[0];
	if (quote !== '"' && quote !== "'") return undefined;
	for (let index = 1; index < source.length; index += 1) {
		if (source[index] === '\\') {
			index = cssEscapeEnd(source, index) - 1;
			continue;
		}
		if (source[index] === quote) {
			return {
				target: decodeCssEscapes(source.slice(1, index)),
				remainder: source.slice(index + 1).trim(),
			};
		}
	}
	return undefined;
}

function functionClose(source: string, open: number): number {
	let depth = 0;
	let quote: '"' | "'" | undefined;
	for (let index = open; index < source.length; index += 1) {
		const character = source[index]!;
		if (quote) {
			if (character === '\\') index = cssEscapeEnd(source, index) - 1;
			else if (character === quote) quote = undefined;
			continue;
		}
		if (character === '"' || character === "'") {
			quote = character;
			continue;
		}
		if (character === '\\') {
			index = cssEscapeEnd(source, index) - 1;
			continue;
		}
		if (character === '(') depth += 1;
		else if (character === ')' && --depth === 0) return index;
	}
	return -1;
}

function importTarget(params: string): { target: string; remainder: string } | undefined {
	const source = stripCssComments(params).trim();
	const quoted = quotedComponent(source);
	if (quoted) return quoted;

	const open = source.indexOf('(');
	if (open <= 0 || decodeCssEscapes(source.slice(0, open)).toLowerCase() !== 'url') {
		return undefined;
	}
	const close = functionClose(source, open);
	if (close === -1) return undefined;
	const argument = stripCssComments(source.slice(open + 1, close)).trim();
	const quotedArgument = quotedComponent(argument);
	if (quotedArgument && quotedArgument.remainder) return undefined;
	return {
		target: quotedArgument?.target ?? decodeCssEscapes(argument),
		remainder: source.slice(close + 1).trim(),
	};
}

function importIsActive(nodes: NonNullable<ReturnType<typeof postcss.parse>['nodes']>, index: number): boolean {
	for (const node of nodes.slice(0, index)) {
		if (node.type === 'comment') continue;
		if (node.type !== 'atrule') return false;
		const { name } = atRuleParts(node);
		if (name === 'import' || name === 'charset' || (name === 'layer' && node.nodes === undefined)) {
			continue;
		}
		return false;
	}
	return true;
}

export function assertAppCssTokenLayout(source: string): void {
	const root = postcss.parse(source, { from: undefined });
	const nodes = root.nodes ?? [];
	const sentinels = nodes.filter(
		(node): node is Comment => node.type === 'comment' && node.text.trim() === SENTINEL_START,
	);
	const imports = nodes.flatMap((node) => {
		if (node.type !== 'atrule') return [];
		const atRule = atRuleParts(node);
		if (atRule.name !== 'import') return [];
		const parsed = importTarget(atRule.params);
		return parsed?.target === TOKEN_STYLESHEET ? [{ node, remainder: parsed.remainder }] : [];
	});

	if (
		sentinels.length !== 1 ||
		imports.length !== 1 ||
		imports[0]!.remainder !== '' ||
		nodes.indexOf(imports[0]!.node) >= nodes.indexOf(sentinels[0]!) ||
		!importIsActive(nodes, nodes.indexOf(imports[0]!.node))
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
