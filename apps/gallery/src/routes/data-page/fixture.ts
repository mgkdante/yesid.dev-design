export const copy = {
	breadcrumb: 'Breadcrumb',
	rail: { label: 'View', open: 'Open view controls', close: 'Close view controls' },
	search: 'Find a stop',
	grain: 'Grain',
	filters: 'Filters',
	summary: 'Summary',
	noMatch: 'No departures match these filters',
	consent: {
		title: 'Analytics',
		description: 'May we count anonymous visits to improve the Gallery?',
		accept: 'Allow',
		decline: 'No thanks',
		settings: 'Analytics settings',
		privacy: 'Privacy',
	},
} as const;

export const trail = [
	{ name: 'Home', href: '/' },
	{ name: 'Lines', href: '/listing-frame' },
	{ name: 'Line 24', href: '/data-page' },
];

export const statuses = [
	{ key: 'on-time', label: 'On time' },
	{ key: 'late', label: 'Late' },
	{ key: 'cancelled', label: 'Cancelled' },
] as const;
export type Status = (typeof statuses)[number]['key'];

export interface StopRow {
	id: string;
	stop: string;
	status: Status;
	wait: number;
	headway: number;
}

export const stopRows: StopRow[] = [
	{ id: 's1', stop: 'Bonaventure', status: 'on-time', wait: 6, headway: 8 },
	{ id: 's2', stop: 'Peel / Sainte-Catherine', status: 'late', wait: 11, headway: 10 },
	{ id: 's3', stop: 'Guy-Concordia', status: 'on-time', wait: 7, headway: 9 },
];

export const stopTable = {
	caption: 'Waits by stop',
	headers: { stop: 'Stop', wait: 'Wait (min)', headway: 'Headway (min)' },
};

export const hourTable = {
	caption: 'Departures by hour',
	minWidth: '40rem',
	hours: ['06', '07', '08', '09', '10', '11', '12', '13'],
};
