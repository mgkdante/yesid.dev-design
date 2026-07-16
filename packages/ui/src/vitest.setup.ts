import { expect } from 'vitest';

expect.extend({
	toBeInTheDocument(received: Node | null) {
		const pass = received?.ownerDocument?.documentElement.contains(received) ?? false;
		return {
			pass,
			message: () =>
				pass
					? 'expected the element not to be in the document'
					: 'expected the element to be in the document',
		};
	},
});
