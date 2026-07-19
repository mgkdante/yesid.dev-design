import type { ServerInit } from '@sveltejs/kit';
import { initializeUi } from '$lib/ui-initialization.js';

export const init: ServerInit = () => {
	initializeUi();
};
