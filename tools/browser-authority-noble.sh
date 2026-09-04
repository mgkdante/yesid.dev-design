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

proxy_env=(
	--env HTTP_PROXY=
	--env HTTPS_PROXY=
	--env FTP_PROXY=
	--env ALL_PROXY=
	--env NO_PROXY=
	--env http_proxy=
	--env https_proxy=
	--env ftp_proxy=
	--env all_proxy=
	--env no_proxy=
)

volume=
scratch=
archive=
volume_output=
active_pid=
active_container=

load_created_volume() {
	local candidate
	if [[ -n "$volume" || -z "$volume_output" || ! -s "$volume_output" ]]; then return; fi
	IFS= read -r candidate < "$volume_output"
	if [[ "$candidate" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]]; then volume=$candidate; fi
}

stop_active_container() {
	local pid=$active_pid
	local container=$active_container
	if [[ -n "$pid" ]]; then kill -TERM "$pid" 2>/dev/null || true; fi
	if [[ -n "$container" ]]; then docker rm --force "$container" >/dev/null 2>&1 || true; fi
	if [[ -n "$pid" ]]; then wait "$pid" 2>/dev/null || true; fi
	active_pid=
	active_container=
}

handle_signal() {
	local status=$1
	trap - HUP INT TERM
	stop_active_container
	exit "$status"
}

cleanup() {
	local status=$?
	local cleanup_status
	trap - EXIT
	load_created_volume
	if [[ -n "$volume" ]]; then
		if docker volume rm --force "$volume" >/dev/null; then
			:
		else
			cleanup_status=$?
			printf 'failed to remove browser authority volume %s\n' "$volume" >&2
			if (( status == 0 )); then status=$cleanup_status; fi
		fi
	fi
	if [[ -n "$scratch" && -d "$scratch" ]]; then
		if ! rm -rf -- "$scratch"; then
			printf 'failed to remove browser authority scratch directory %s\n' "$scratch" >&2
			if (( status == 0 )); then status=1; fi
		fi
	fi
	exit "$status"
}
trap cleanup EXIT
trap 'handle_signal 129' HUP
trap 'handle_signal 130' INT
trap 'handle_signal 143' TERM

run_active() {
	local status
	"$@" &
	active_pid=$!
	if wait "$active_pid"; then status=0; else status=$?; fi
	active_pid=
	return "$status"
}

run_container() {
	local name=$1
	local input=$2
	local status
	shift 2
	active_container=$name
	docker run --name "$name" "$@" < "$input" &
	active_pid=$!
	if wait "$active_pid"; then status=0; else status=$?; fi
	active_pid=
	active_container=
	return "$status"
}

scratch=$(mktemp -d "${TMPDIR:-/tmp}/yesid-browser-authority.XXXXXXXX")
archive="$scratch/source.tar"
volume_output="$scratch/volume"
trusted_git archive --format=tar --output="$archive" "$commit"
run_active docker volume create > "$volume_output"
load_created_volume
if [[ -z "$volume" ]]; then
	printf 'browser authority could not resolve the created Docker volume\n' >&2
	exit 2
fi
mount="type=volume,source=$volume,target=/authority,volume-nocopy"
bootstrap_container="yesid-browser-bootstrap-$volume"
test_container="yesid-browser-test-$volume"

run_container "$bootstrap_container" "$archive" \
	--platform linux/amd64 \
	--rm \
	--init \
	--interactive \
	--mount "$mount" \
	"${proxy_env[@]}" \
	--env CI=1 \
	--workdir /authority \
	"$IMAGE" \
	bash -euo pipefail -c '
		mkdir -p /authority/repo /authority/toolchain
		tar --extract --file=- --directory=/authority/repo
		apt-get update
		apt-get install --yes --no-install-recommends ca-certificates curl unzip
		rm -rf /var/lib/apt/lists/*
		curl --fail --location --silent --show-error \
			https://github.com/oven-sh/bun/releases/download/bun-v1.3.11/bun-linux-x64.zip \
			--output /tmp/bun-linux-x64.zip
		echo "8611ba935af886f05a6f38740a15160326c15e5d5d07adef966130b4493607ed  /tmp/bun-linux-x64.zip" | sha256sum --check --strict
		unzip -q /tmp/bun-linux-x64.zip -d /tmp/bun
		install -m 0755 /tmp/bun/bun-linux-x64/bun /authority/toolchain/bun
		test "$(/authority/toolchain/bun --version)" = "1.3.11"
		cd /authority/repo
		/authority/toolchain/bun install --frozen-lockfile --ignore-scripts
	'

run_container "$test_container" /dev/null \
	--platform linux/amd64 \
	--pull=never \
	--rm \
	--init \
	--network=none \
	--cap-drop=ALL \
	--security-opt=no-new-privileges \
	--shm-size=1g \
	--mount "$mount" \
	"${proxy_env[@]}" \
	--env CI=1 \
	--env HOME=/tmp/home \
	--env XDG_CACHE_HOME=/tmp/cache \
	--workdir /authority/repo \
	"$IMAGE" \
	bash -euo pipefail -c '
		export PATH="/authority/toolchain:$PATH"
		mkdir -p "$HOME" "$XDG_CACHE_HOME"
		test "$(bun --version)" = "1.3.11"
		bun run --cwd apps/gallery prepare
		browser_list=$(bun run test:browser:list)
		printf "%s\n" "$browser_list"
		if ! grep -Fqx "Total: 16 tests in 4 files" <<< "$browser_list"; then
			printf "browser authority expected exactly 16 tests in 4 files\n" >&2
			exit 2
		fi
		bun run test:browser
	'
