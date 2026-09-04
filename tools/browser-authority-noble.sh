#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")/.." rev-parse --show-toplevel)"
IMAGE='mcr.microsoft.com/playwright:v1.61.1-noble@sha256:5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48'
BUN_VERSION='1.3.11'
PLAYWRIGHT_VERSION='1.61.1'

trusted_git() {
	GIT_ATTR_NOSYSTEM=1 git \
		--no-replace-objects \
		-c core.fsmonitor=false \
		-c core.hooksPath= \
		-c core.attributesFile=/dev/null \
		-C "$ROOT" \
		"$@"
}

refuse_local_git_override() {
	local relative=$1
	local path
	path=$(trusted_git rev-parse --git-path "$relative")
	if [[ "$path" != /* ]]; then path="$ROOT/$path"; fi
	if [[ -L "$path" || ( -e "$path" && ! -f "$path" ) || -s "$path" ]]; then
		printf 'browser authority refuses local Git override %s at %s\n' "$relative" "$path" >&2
		exit 2
	fi
}

if (( $# > 1 )); then
	printf 'usage: %s [commit-or-tag]\n' "${0##*/}" >&2
	exit 2
fi
ref=${1:-HEAD}
refuse_local_git_override info/attributes
refuse_local_git_override info/grafts
commit=$(trusted_git rev-parse --verify --end-of-options "${ref}^{commit}")

committed_json_value() {
	local path="$1"
	shift
	trusted_git show "$commit:$path" | node -e '
		const chunks = [];
		process.stdin.on("data", (chunk) => chunks.push(chunk));
		process.stdin.on("end", () => {
			const value = process.argv.slice(1).reduce(
				(current, key) => current?.[key],
				JSON.parse(Buffer.concat(chunks).toString("utf8")),
			);
			if (typeof value !== "string") process.exit(2);
			process.stdout.write(value);
		});
	' "$@"
}

require_pin() {
	if [[ "$2" != "$3" ]]; then
		printf 'browser authority pin mismatch: %s must be %s (found %s)\n' "$1" "$3" "$2" >&2
		exit 2
	fi
}

require_pin 'packageManager' "$(committed_json_value package.json packageManager)" "bun@$BUN_VERSION"
require_pin '.bun-version' "$(trusted_git show "$commit:.bun-version")" "$BUN_VERSION"
require_pin '@playwright/test' \
	"$(committed_json_value apps/gallery/package.json devDependencies '@playwright/test')" \
	"$PLAYWRIGHT_VERSION"

if ! workflow_image=$(trusted_git show "$commit:.github/workflows/ci.yml" | node -e '
	const { parse } = require(process.argv[1]);
	const chunks = [];
	process.stdin.on("data", (chunk) => chunks.push(chunk));
	process.stdin.on("end", () => {
		const workflow = parse(Buffer.concat(chunks).toString("utf8"));
		const image = workflow?.jobs?.["browser-authority-work"]?.container?.image;
		if (typeof image !== "string") process.exit(2);
		process.stdout.write(image);
	});
' "$ROOT/node_modules/yaml"); then
	printf 'browser authority could not read jobs.browser-authority-work.container.image\n' >&2
	exit 2
fi
require_pin 'CI browser authority image' "$workflow_image" "$IMAGE"

printf 'browser authority: source=%s platform=linux/amd64 image=%s\n' "$commit" "$IMAGE" >&2

trusted_git archive --format=tar "$commit" | docker run \
	--platform linux/amd64 \
	--rm \
	--init \
	--shm-size=1g \
	--interactive \
	--env CI=1 \
	--workdir /work \
	"$IMAGE" \
	bash -euo pipefail -c '
		tar --extract --file=-
		apt-get update
		apt-get install --yes --no-install-recommends ca-certificates curl unzip
		rm -rf /var/lib/apt/lists/*
		curl --fail --location --silent --show-error \
			https://github.com/oven-sh/bun/releases/download/bun-v1.3.11/bun-linux-x64.zip \
			--output /tmp/bun-linux-x64.zip
		echo "8611ba935af886f05a6f38740a15160326c15e5d5d07adef966130b4493607ed  /tmp/bun-linux-x64.zip" | sha256sum --check --strict
		unzip -q /tmp/bun-linux-x64.zip -d /tmp/bun
		install -m 0755 /tmp/bun/bun-linux-x64/bun /usr/local/bin/bun
		test "$(bun --version)" = "1.3.11"
		bun install --frozen-lockfile
		browser_list=$(bun run test:browser:list)
		printf "%s\n" "$browser_list"
		if ! grep -Fqx "Total: 16 tests in 4 files" <<< "$browser_list"; then
			printf "browser authority expected exactly 16 tests in 4 files\n" >&2
			exit 2
		fi
		bun run test:browser
	'
