import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { projectRunes } from '@yesid/config/svelte/project-runes.js';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		runes: projectRunes(import.meta.dirname),
	},
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({ fallback: undefined }),
	},
};

export default config;
