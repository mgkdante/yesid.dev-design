import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// The action tests were extracted byte-faithful from yesid.dev's apps/web, where
// `$lib` is SvelteKit's alias for src/lib. Mapping `$lib/motion/*` onto this
// package's src/ keeps the vi.mock specifiers in those tests byte-identical.
export default defineConfig({
	resolve: {
		alias: [{ find: /^\$lib\/motion\/(.*)$/, replacement: resolve(here, 'src') + '/$1' }],
	},
	test: {
		environment: 'happy-dom',
		globals: true,
		pool: 'threads',
		setupFiles: ['./src/__tests__/setup.ts'],
	},
});
