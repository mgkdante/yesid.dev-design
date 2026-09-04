// Comment blanking + line numbering — byte-equivalent to transit's
// brand-doctrine.test.ts helpers (the two-track scan contract: violations are
// detected on comment-STRIPPED source; allowlist markers are honored on the
// ORIGINAL source at the same line index).

/**
 * Blank out Svelte/JS/CSS comment CONTENT in place so doctrine prose (which
 * legitimately NAMES the banned tokens to explain why they're avoided) never
 * trips the scan. Newlines are PRESERVED — every comment char becomes a space —
 * so line numbers stay 1:1 with the original (the allowlist window is checked
 * against the original at the same index).
 */
export function blankComments(src: string): string {
	// The largest current consumer source is 164,489 bytes. A 1,048,576-code-unit
	// ceiling leaves ample growth room while bounding allocation and scan work.
	const maxSourceCodeUnits = 1_048_576;
	if (src.length > maxSourceCodeUnits) {
		throw new Error(
			`blankComments: source length ${src.length} exceeds 1 MiB (${maxSourceCodeUnits} code units)`,
		);
	}

	const output = src.split('');
	const isNewline = (char: string | undefined) =>
		char === '\n' || char === '\r' || char === '\u2028' || char === '\u2029';
	let cursor = 0;
	const blankSpan = (length: number) => {
		const end = cursor + length;
		while (cursor < end) {
			if (!isNewline(output[cursor])) output[cursor] = ' ';
			cursor += 1;
		}
	};

	let state: 'source' | 'html' | 'block' | 'line' = 'source';
	while (cursor < src.length) {
		if (state === 'html') {
			if (src.startsWith('-->', cursor)) {
				blankSpan(3);
				state = 'source';
			} else {
				blankSpan(1);
			}
			continue;
		}

		if (state === 'block') {
			if (src.startsWith('*/', cursor)) {
				blankSpan(2);
				state = 'source';
			} else {
				blankSpan(1);
			}
			continue;
		}

		if (state === 'line') {
			if (isNewline(src[cursor])) {
				state = 'source';
				cursor += 1;
			} else {
				blankSpan(1);
			}
			continue;
		}

		if (src.startsWith('<!--', cursor)) {
			state = 'html';
			blankSpan(4);
		} else if (src.startsWith('/*', cursor)) {
			state = 'block';
			blankSpan(2);
		} else if (src.startsWith('//', cursor) && (cursor === 0 || src[cursor - 1] !== ':')) {
			state = 'line';
			blankSpan(2);
		} else {
			cursor += 1;
		}
	}

	return output.join('');
}

/** Split into [lineNo, text] keeping original numbers (for allowlist windows). */
export function numbered(src: string): Array<[number, string]> {
	return src.split('\n').map((line, i) => [i + 1, line]);
}
