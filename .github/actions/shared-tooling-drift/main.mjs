import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
	commitSha,
	digest,
	parseManifest,
	repository,
	requiredString,
} from './contract.mjs';
import {
	manifestRelativePath,
	textAt,
	verifyConfigurations,
	workspaceRoot,
} from './config.mjs';
import { verifyCallers } from './workflows.mjs';

export function verifySharedToolingDrift({ workspace, manifestPath, actionRepository, actionRef }) {
	const root = workspaceRoot(workspace);
	const relativeManifest = manifestRelativePath(root, requiredString(manifestPath, 'manifest path'));
	const manifest = parseManifest(textAt(root, relativeManifest, 'manifest'));
	if (repository(actionRepository, 'running action repository') !== manifest.source.repository) {
		throw new Error('shared-tooling-drift: running action repository does not match manifest.source.repository');
	}
	if (commitSha(actionRef, 'running action ref') !== manifest.source.sha) {
		throw new Error('shared-tooling-drift: running action ref does not match manifest.source.sha');
	}
	const configurations = verifyConfigurations(root, manifest.configurations);
	const callers = verifyCallers(root, manifest);
	return {
		schema: 1,
		source: { repository: manifest.source.repository, sha: manifest.source.sha },
		manifestDigest: digest(manifest),
		configurationsDigest: digest(configurations),
		callersDigest: digest(callers),
		configurations: configurations.length,
		callers: callers.length,
	};
}

function requiredEnvironment(environment, name) {
	return requiredString(environment[name], name);
}

function writeReceipt(receipt, environment) {
	const compact = JSON.stringify(receipt);
	appendFileSync(requiredEnvironment(environment, 'GITHUB_OUTPUT'), `receipt=${compact}\n`, 'utf8');
	process.stdout.write(`${compact}\n`);
}

export function runAction(environment = process.env) {
	const receipt = verifySharedToolingDrift({
		workspace: requiredEnvironment(environment, 'GITHUB_WORKSPACE'),
		manifestPath: requiredEnvironment(environment, 'INPUT_MANIFEST'),
		actionRepository: requiredEnvironment(environment, 'YESID_ACTION_REPOSITORY'),
		actionRef: requiredEnvironment(environment, 'YESID_ACTION_REF'),
	});
	writeReceipt(receipt, environment);
	return receipt;
}

function annotation(value) {
	return value.replace(/%/gu, '%25').replace(/\r/gu, '%0D').replace(/\n/gu, '%0A');
}

const direct = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (direct) {
	try {
		runAction();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`::error title=Shared tooling drift::${annotation(message)}\n`);
		process.exitCode = 1;
	}
}
