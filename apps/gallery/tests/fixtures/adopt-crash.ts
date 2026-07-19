import { adoptFromSource, type AdoptCheckpoint } from '../../../../tools/adopt.js';

const [source, dest, tag, commit, crashPoint] = process.argv.slice(2);
if (!source || !dest || !tag || !commit || !crashPoint) process.exit(2);

adoptFromSource({
	source,
	dest,
	tag,
	commit,
	packages: ['tokens'],
	runtime: {
		checkpoint(point: AdoptCheckpoint) {
			if (point === crashPoint) process.exit(97);
		},
	},
});
