import type { Handle, ServerInit } from '@sveltejs/kit';
import { injectThemeBoot } from '@yesid/ui/head';
import { preloadFont } from '@yesid/tokens/fonts';
import { initializeUi } from '$lib/ui-initialization.js';

export const init: ServerInit = () => {
	initializeUi();
};

export const handle: Handle = ({ event, resolve }) =>
	resolve(event, {
		transformPageChunk: ({ html }) => injectThemeBoot(html),
		preload: ({ type, path }) => type !== 'font' || preloadFont(path),
	});
