import type { ClientInit } from '@sveltejs/kit';
import { initializeUi } from '$lib/ui-initialization.js';

export const init: ClientInit = () => {
	initializeUi();
};
