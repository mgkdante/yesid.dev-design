import { adoptFromSource, type AdoptCheckpoint } from '../../../../tools/adopt.js';

const [source, dest, tag, tagObject, peeledCommit, crashPoint] = process.argv.slice(2);
if (!source || !dest || !tag || !tagObject || !peeledCommit || !crashPoint) process.exit(2);

adoptFromSource({
	source,
	dest,
	packages: ['tokens'],
	provenance: {
		mode: 'worktree',
		tag: { name: tag, object: tagObject, peeledCommit },
		asset: null,
	},
	runtime: {
		checkpoint(point: AdoptCheckpoint) {
			if (point === crashPoint) process.exit(97);
		},
	},
});
