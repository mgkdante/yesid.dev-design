#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")/.." rev-parse --show-toplevel)"
IMAGE='mcr.microsoft.com/playwright:v1.61.1-noble@sha256:5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48'
BUN_VERSION='1.3.11'
PLAYWRIGHT_VERSION='1.61.1'

if (( $# > 1 )); then
	printf 'usage: %s [commit-or-tag]\n' "${0##*/}" >&2
	exit 2
fi
ref=${1:-HEAD}
commit=$(git -C "$ROOT" rev-parse --verify --end-of-options "${ref}^{commit}")

committed_json_value() {
	local path="$1"
	shift
	git -C "$ROOT" show "$commit:$path" | node -e '
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
require_pin '.bun-version' "$(git -C "$ROOT" show "$commit:.bun-version")" "$BUN_VERSION"
require_pin '@playwright/test' \
	"$(committed_json_value apps/gallery/package.json devDependencies '@playwright/test')" \
	"$PLAYWRIGHT_VERSION"
if ! git -C "$ROOT" show "$commit:.github/workflows/ci.yml" | grep -Fqx "      image: $IMAGE"; then
	printf 'browser authority pin mismatch: CI workflow must use %s\n' "$IMAGE" >&2
	exit 2
fi

printf 'browser authority: source=%s platform=linux/amd64 image=%s\n' "$commit" "$IMAGE" >&2

git -C "$ROOT" archive --format=tar "$commit" | docker run \
	--platform linux/amd64 \
	--rm \
	--init \
	--ipc=host \
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
		bun run test:browser
	'
