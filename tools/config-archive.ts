import { gunzipSync } from 'node:zlib';

export interface ConfigArchiveEntry {
	path: string;
	type: 'file' | 'directory';
	content: Buffer;
}

export const CONFIG_ARCHIVE_LIMITS = {
	compressedBytes: 8 * 1024 * 1024,
	expandedBytes: 2 * 1024 * 1024,
	memberBytes: 256 * 1024,
	payloadBytes: 1024 * 1024,
	entries: 64,
} as const;

function isZeroBlock(block: Buffer): boolean {
	return block.every((byte) => byte === 0);
}

function decodeField(header: Buffer, start: number, length: number): string {
	const field = header.subarray(start, start + length);
	const end = field.indexOf(0);
	const bytes = end === -1 ? field : field.subarray(0, end);
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch (cause) {
		throw new Error('config release archive has an invalid UTF-8 header', { cause });
	}
}

function parseOctal(header: Buffer, start: number, length: number, label: string): number {
	const raw = header
		.subarray(start, start + length)
		.toString('ascii')
		.replace(/\0.*$/u, '')
		.trim();
	if (!/^[0-7]+$/u.test(raw)) throw new Error(`config release archive has an invalid ${label}`);
	const value = Number.parseInt(raw, 8);
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new Error(`config release archive has an invalid ${label}`);
	}
	return value;
}

function validatePath(pathInput: string, type: ConfigArchiveEntry['type']): string {
	const trailingSlash = pathInput.endsWith('/');
	if (trailingSlash && (type !== 'directory' || pathInput.endsWith('//'))) {
		throw new Error(`config release archive has an unsafe path ${JSON.stringify(pathInput)}`);
	}
	const path = trailingSlash ? pathInput.slice(0, -1) : pathInput;
	if (
		path.length === 0 ||
		path !== path.normalize('NFC') ||
		path.startsWith('/') ||
		path.startsWith('\\') ||
		/^[A-Za-z]:/u.test(path) ||
		path.includes('\\') ||
		/[\0-\x1f\x7f]/u.test(path)
	) {
		throw new Error(`config release archive has an unsafe path ${JSON.stringify(pathInput)}`);
	}
	const parts = path.split('/');
	if (
		parts[0] !== 'package' ||
		parts.some((part) => {
			const deviceStem = (part.split('.')[0] ?? '').replace(/[ .]+$/u, '');
			return (
				part === '' ||
				part === '.' ||
				part === '..' ||
				/[<>:"|?*]/u.test(part) ||
				/[. ]$/u.test(part) ||
				/^(?:CON|CONIN\$|CONOUT\$|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])$/iu.test(deviceStem)
			);
		})
	) {
		throw new Error(`config release archive has an unsafe path ${JSON.stringify(pathInput)}`);
	}
	return path;
}

export function parseConfigArchive(compressed: Buffer): ConfigArchiveEntry[] {
	if (compressed.length === 0 || compressed.length > CONFIG_ARCHIVE_LIMITS.compressedBytes) {
		throw new Error('config release archive compressed size limit is 8 MiB');
	}
	let archive: Buffer;
	try {
		archive = gunzipSync(compressed, {
			maxOutputLength: CONFIG_ARCHIVE_LIMITS.expandedBytes,
		});
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE') {
			throw new Error('config release archive expanded size limit is 2 MiB', { cause });
		}
		throw new Error('config release archive has malformed gzip bytes', { cause });
	}
	if (
		archive.length === 0 ||
		archive.length > CONFIG_ARCHIVE_LIMITS.expandedBytes ||
		archive.length % 512 !== 0
	) {
		throw new Error('config release archive has an invalid expanded size');
	}

	const entries: ConfigArchiveEntry[] = [];
	const paths = new Set<string>();
	let offset = 0;
	let payloadBytes = 0;
	let terminated = false;
	while (offset + 512 <= archive.length) {
		const header = archive.subarray(offset, offset + 512);
		if (isZeroBlock(header)) {
			const second = archive.subarray(offset + 512, offset + 1024);
			if (second.length !== 512 || !isZeroBlock(second)) {
				throw new Error('config release archive has an incomplete terminator');
			}
			if (!archive.subarray(offset + 1024).every((byte) => byte === 0)) {
				throw new Error('config release archive has trailing data');
			}
			terminated = true;
			break;
		}
		if (entries.length >= CONFIG_ARCHIVE_LIMITS.entries) {
			throw new Error(`config release archive entry limit is ${CONFIG_ARCHIVE_LIMITS.entries}`);
		}
		if (header.subarray(257, 263).toString('binary') !== 'ustar\0') {
			throw new Error('config release archive must be POSIX ustar');
		}
		if (header.subarray(263, 265).toString('ascii') !== '00') {
			throw new Error('config release archive has an invalid POSIX ustar version');
		}
		const storedChecksum = parseOctal(header, 148, 8, 'header checksum');
		const checksumHeader = Buffer.from(header);
		checksumHeader.fill(0x20, 148, 156);
		const actualChecksum = checksumHeader.reduce((sum, byte) => sum + byte, 0);
		if (storedChecksum !== actualChecksum) {
			throw new Error('config release archive header checksum does not match');
		}

		const typeFlag = String.fromCharCode(header[156] ?? 0);
		if (!['\0', '0', '5'].includes(typeFlag)) {
			throw new Error('config release archive links and special entries are forbidden');
		}
		const type = typeFlag === '5' ? 'directory' : 'file';
		const name = decodeField(header, 0, 100);
		const prefix = decodeField(header, 345, 155);
		const rawPath = prefix ? `${prefix}/${name}` : name;
		const path = validatePath(rawPath, type);
		const foldedPath = path.toLowerCase();
		if (paths.has(foldedPath)) {
			throw new Error(`config release archive has a duplicate path ${path}`);
		}
		paths.add(foldedPath);

		const size = parseOctal(header, 124, 12, 'member size');
		if (size > CONFIG_ARCHIVE_LIMITS.memberBytes) {
			throw new Error('config release archive member size limit is 256 KiB');
		}
		if (type === 'directory' && size !== 0) {
			throw new Error('config release archive directory has data');
		}
		payloadBytes += size;
		if (payloadBytes > CONFIG_ARCHIVE_LIMITS.payloadBytes) {
			throw new Error('config release archive payload size limit is 1 MiB');
		}
		const contentStart = offset + 512;
		const contentEnd = contentStart + size;
		const paddedEnd = contentStart + Math.ceil(size / 512) * 512;
		if (contentEnd > archive.length || paddedEnd > archive.length) {
			throw new Error('config release archive has a truncated member');
		}
		if (!archive.subarray(contentEnd, paddedEnd).every((byte) => byte === 0)) {
			throw new Error('config release archive has nonzero member padding');
		}
		entries.push({
			path: trailingPath(path, type),
			type,
			content: Buffer.from(archive.subarray(contentStart, contentEnd)),
		});
		offset = paddedEnd;
	}
	if (!terminated) throw new Error('config release archive is missing its terminator');
	return entries;
}

function trailingPath(path: string, type: ConfigArchiveEntry['type']): string {
	return type === 'directory' ? `${path}/` : path;
}
