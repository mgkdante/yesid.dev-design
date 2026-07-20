import { relative, sep } from 'node:path';

export function projectRunes(root) {
	if (typeof root !== 'string' || root.length === 0) {
		throw new TypeError('projectRunes requires a consumer root');
	}
	return ({ filename }) => {
		const segments = relative(root, filename).toLowerCase().split(sep);
		return segments.includes('node_modules') ? undefined : true;
	};
}
