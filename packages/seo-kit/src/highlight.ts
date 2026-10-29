import { createHighlighterCore, type HighlighterCore, type LanguageInput, type ThemedToken } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

const grammars: Record<string, LanguageInput> = {
	bash: () => import('shiki/langs/bash.mjs'),
	css: () => import('shiki/langs/css.mjs'),
	html: () => import('shiki/langs/html.mjs'),
	javascript: () => import('shiki/langs/javascript.mjs'),
	json: () => import('shiki/langs/json.mjs'),
	liquid: () => import('shiki/langs/liquid.mjs'),
	markdown: () => import('shiki/langs/markdown.mjs'),
	python: () => import('shiki/langs/python.mjs'),
	sql: () => import('shiki/langs/sql.mjs'),
	svelte: () => import('shiki/langs/svelte.mjs'),
	typescript: () => import('shiki/langs/typescript.mjs'),
};
const aliases: Record<string, string> = { js: 'javascript', md: 'markdown', sh: 'bash', shell: 'bash', ts: 'typescript' };

// TextMate scopes per syntax class. `plain` wins over a broader parent scope and renders as bare text.
const scopes: Record<string, string[]> = {
	plain: ['variable', 'variable.other', 'variable.parameter', 'source.sql'],
	keyword: ['keyword', 'storage', 'storage.type', 'keyword.control', 'entity.name.tag', 'punctuation.definition.tag'],
	string: ['string', 'string.quoted', 'string.regexp', 'entity.name.type', 'support.type', 'entity.name.class', 'meta.decorator', 'punctuation.decorator'],
	comment: ['comment', 'punctuation.definition.comment'],
	function: ['entity.name.function', 'support.function', 'meta.function-call', 'entity.other.attribute-name'],
	number: ['constant', 'constant.numeric', 'constant.language'],
	punctuation: ['keyword.operator', 'punctuation'],
};
const kinds = Object.keys(scopes);
// Each kind gets a stand-in color that renderLine maps back to its class; no color reaches the markup.
const theme = {
	name: 'yesid-syntax',
	fg: '#000000',
	bg: '#000000',
	settings: kinds.map((kind, i) => ({ scope: scopes[kind], settings: { foreground: `#00000${i}` } })),
};

let highlighter: Promise<HighlighterCore> | undefined;

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function renderLine(line: ThemedToken[]): string {
	let html = '';
	let kind = 'plain';
	for (const token of line) {
		const next = kinds[Number(token.color?.slice(1))] ?? 'plain';
		if (next !== kind) html += (kind === 'plain' ? '' : '</span>') + (next === 'plain' ? '' : `<span class="syn-${next}">`);
		kind = next;
		html += escapeHtml(token.content);
	}
	return kind === 'plain' ? html : `${html}</span>`;
}

/**
 * Server-side syntax highlighting: the token markup for a `<code>` element, in `syn-*` classes that
 * `@yesid/ui/base.css` colors through the `--syntax-*` tokens. Line breaks come back as `\n`. An
 * unknown language, or a grammar Shiki can't run, returns the escaped source. There is no per-line
 * time limit, so highlight content you trust.
 */
export async function highlight(code: string, lang: string): Promise<string> {
	const name = aliases[lang] ?? lang;
	const grammar = grammars[name];
	if (!grammar) return escapeHtml(code);
	try {
		highlighter ??= createHighlighterCore({ themes: [theme], langs: [], engine: createJavaScriptRegexEngine() });
		const core = await highlighter;
		if (!core.getLoadedLanguages().includes(name)) await core.loadLanguage(grammar);
		// Shiki's default 500 ms line budget includes compiling a cold grammar, so a busy machine
		// would leave the first line partly plain.
		const { tokens } = core.codeToTokens(code, { lang: name, theme: theme.name, tokenizeTimeLimit: 0 });
		return tokens.map(renderLine).join('\n');
	} catch {
		return escapeHtml(code);
	}
}
