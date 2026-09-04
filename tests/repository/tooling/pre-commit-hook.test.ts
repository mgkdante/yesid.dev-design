import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const HOOK = fileURLToPath(new URL('../../../.githooks/pre-commit', import.meta.url));
const APP_CSS = `/* gallery-owned header */
/* ===== TOKENS:START ===== */
/* GENERATED FROM packages/tokens/tokens.json - DO NOT EDIT */
@theme {
  --brand: red;
}
/* ===== TOKENS:END ===== */
/* gallery-owned footer */
`;
const scratch: string[] = [];

function write(path: string, content: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content, 'utf8');
}

function git(root: string, ...args: string[]): string {
	const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
	if (result.status !== 0) throw new Error(result.stderr || result.stdout);
	return result.stdout.trim();
}

function repository(): string {
	const root = mkdtempSync(join(tmpdir(), 'yesid-pre-commit-hook-'));
	scratch.push(root);
	git(root, 'init', '-q', '-b', 'main');
	git(root, 'config', 'user.name', 'Pre-commit Hook Test');
	git(root, 'config', 'user.email', 'pre-commit-hook@example.com');
	write(join(root, 'apps/gallery/src/app.css'), APP_CSS);
	write(join(root, 'packages/tokens/tokens.css'), '/* generated tokens */\n');
	write(join(root, 'packages/motion/src/tokens.ts'), '// generated motion tokens\n');
	write(join(root, 'DESIGN.md'), '# Generated design reference\n');
	write(join(root, 'packages/tokens/tokens.json'), '{"brand":"red"}\n');
	git(root, 'add', '.');
	git(root, 'commit', '-qm', 'fixture baseline');
	return root;
}

function runHook(root: string): { status: number | null; stdout: string; stderr: string } {
	const result = spawnSync('bash', [HOOK], { cwd: root, encoding: 'utf8' });
	return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function expectAccepted(root: string): void {
	const result = runHook(root);
	expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
}

function expectRejected(root: string): void {
	const result = runHook(root);
	expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(1);
	expect(result.stderr).toContain('generated token output staged without a token source change');
}

afterEach(() => {
	for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('generated token pre-commit guard', () => {
	it('allows a staged edit outside the app.css token sentinel region', () => {
		const root = repository();
		write(
			join(root, 'apps/gallery/src/app.css'),
			APP_CSS.replace('/* gallery-owned footer */', '/* revised gallery-owned footer */'),
		);
		git(root, 'add', '--', 'apps/gallery/src/app.css');

		expectAccepted(root);
	});

	it('ignores an unstaged sentinel edit when only a hand-maintained app.css edit is staged', () => {
		const root = repository();
		const appCss = join(root, 'apps/gallery/src/app.css');
		write(appCss, APP_CSS.replace('gallery-owned footer', 'staged gallery-owned footer'));
		git(root, 'add', '--', 'apps/gallery/src/app.css');
		write(
			appCss,
			readFileSync(appCss, 'utf8').replace('--brand: red', '--brand: unstaged-blue'),
		);

		expectAccepted(root);
	});

	it('rejects a staged sentinel edit even when the working tree restores it', () => {
		const root = repository();
		const appCss = join(root, 'apps/gallery/src/app.css');
		write(appCss, APP_CSS.replace('--brand: red', '--brand: staged-blue'));
		git(root, 'add', '--', 'apps/gallery/src/app.css');
		write(appCss, APP_CSS);

		expectRejected(root);
	});

	it('rejects renaming app.css away without a staged token source change', () => {
		const root = repository();
		git(root, 'mv', 'apps/gallery/src/app.css', 'apps/gallery/src/renamed.css');

		expectRejected(root);
	});

	it('rejects deleting app.css without a staged token source change', () => {
		const root = repository();
		git(root, 'rm', '-q', '--', 'apps/gallery/src/app.css');

		expectRejected(root);
	});

	it.each([
		'packages/tokens/tokens.css',
		'packages/motion/src/tokens.ts',
		'DESIGN.md',
	])('rejects a staged change to fully generated output %s without a source change', (path) => {
		const root = repository();
		write(join(root, path), `${readFileSync(join(root, path), 'utf8')}changed\n`);
		git(root, 'add', '--', path);

		expectRejected(root);
	});

	it('allows a sentinel change when a token source change is also staged', () => {
		const root = repository();
		write(
			join(root, 'apps/gallery/src/app.css'),
			APP_CSS.replace('--brand: red', '--brand: green'),
		);
		write(join(root, 'packages/tokens/tokens.json'), '{"brand":"green"}\n');
		git(
			root,
			'add',
			'--',
			'apps/gallery/src/app.css',
			'packages/tokens/tokens.json',
		);

		expectAccepted(root);
	});

	it('allows a fully generated output change when a token source change is also staged', () => {
		const root = repository();
		write(join(root, 'packages/tokens/tokens.css'), '/* regenerated tokens */\n');
		write(join(root, 'packages/tokens/tokens.json'), '{"brand":"green"}\n');
		git(
			root,
			'add',
			'--',
			'packages/tokens/tokens.css',
			'packages/tokens/tokens.json',
		);

		expectAccepted(root);
	});
});
