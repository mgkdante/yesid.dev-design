import type { Handle, ServerInit } from '@sveltejs/kit';
import { preloadFont } from '@yesid/tokens/fonts';
import { initializeUi } from '$lib/ui-initialization.js';

export const init: ServerInit = () => {
	initializeUi();
};

export const handle: Handle = ({ event, resolve }) =>
	resolve(event, { preload: ({ type, path }) => type !== 'font' || preloadFont(path) });
