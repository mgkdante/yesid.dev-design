#!/usr/bin/env bash
set -euo pipefail

HARNESS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
target_input=${BROWSER_AUTHORITY_TARGET_ROOT:-$HARNESS_ROOT}
TARGET_ROOT="$(cd "$target_input" && pwd -P)"
resolved_target="$(git -C "$TARGET_ROOT" rev-parse --show-toplevel)"
resolved_target="$(cd "$resolved_target" && pwd -P)"
if [[ "$resolved_target" != "$TARGET_ROOT" ]]; then
	printf 'browser authority target must be a repository root: %s\n' "$TARGET_ROOT" >&2
	exit 2
fi
IMAGE='mcr.microsoft.com/playwright:v1.61.1-noble@sha256:5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48'
BUN_VERSION='1.3.11'
PLAYWRIGHT_VERSION='1.61.1'
VOLUME_OWNER_LABEL='dev.yesid.browser-authority.owner'
CLEANUP_INSPECT_TIMEOUT_SECONDS=${BROWSER_AUTHORITY_CLEANUP_INSPECT_TIMEOUT_SECONDS:-5}
CONTAINER_REMOVE_TIMEOUT_SECONDS=${BROWSER_AUTHORITY_CONTAINER_REMOVE_TIMEOUT_SECONDS:-10}
VOLUME_REMOVE_TIMEOUT_SECONDS=${BROWSER_AUTHORITY_VOLUME_REMOVE_TIMEOUT_SECONDS:-120}

for timeout in \
	"$CLEANUP_INSPECT_TIMEOUT_SECONDS" \
	"$CONTAINER_REMOVE_TIMEOUT_SECONDS" \
	"$VOLUME_REMOVE_TIMEOUT_SECONDS"; do
	if [[ ! "$timeout" =~ ^[1-9][0-9]*$ ]]; then
		printf 'browser authority cleanup timeouts must be positive integer seconds\n' >&2
		exit 2
	fi
done

trusted_git() {
	GIT_ATTR_NOSYSTEM=1 git \
		--no-replace-objects \
		-c core.fsmonitor=false \
		-c core.hooksPath= \
		-c core.attributesFile=/dev/null \
		-c tar.umask=0002 \
		-C "$TARGET_ROOT" \
		"$@"
}

refuse_local_git_override() {
	local relative=$1
	local path
	path=$(trusted_git rev-parse --git-path "$relative")
	if [[ "$path" != /* ]]; then path="$TARGET_ROOT/$path"; fi
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
(
	cd "$HARNESS_ROOT"
	bun --cwd="$HARNESS_ROOT" --config=/dev/null --no-env-file \
		"$HARNESS_ROOT/tools/browser-authority-dependency-policy.ts" \
		"$TARGET_ROOT" "$commit" "$IMAGE"
)

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
volume_state=unknown
owner=
scratch=
archive=
active_pid=
active_container=

stop_active_container() {
	local pid=$active_pid
	local container=$active_container
	if [[ -n "$pid" ]]; then kill -TERM "$pid" 2>/dev/null || true; fi
	if [[ -n "$container" ]]; then
		if ! run_cleanup_bounded "$CONTAINER_REMOVE_TIMEOUT_SECONDS" \
			docker rm --force "$container" >/dev/null 2>&1; then
			printf 'could not remove active browser authority container %s within %ss\n' \
				"$container" "$CONTAINER_REMOVE_TIMEOUT_SECONDS" >&2
		fi
	fi
	if [[ -n "$pid" ]]; then kill -KILL "$pid" 2>/dev/null || true; fi
	active_pid=
	active_container=
}

handle_signal() {
	local status=$1
	trap '' HUP INT TERM
	stop_active_container
	exit "$status"
}

run_cleanup_bounded() {
	local seconds=$1
	local marker
	local pid
	local status
	local watchdog
	shift
	marker="$scratch/docker-timeout-${BASHPID}-${RANDOM}${RANDOM}"
	"$@" &
	pid=$!
	(
		timer_pid=
		stop_timer() {
			if [[ -n "$timer_pid" ]]; then kill -TERM "$timer_pid" 2>/dev/null || true; fi
			if [[ -n "$timer_pid" ]]; then wait "$timer_pid" 2>/dev/null || true; fi
			exit 0
		}
		trap stop_timer HUP INT TERM
		sleep "$seconds" &
		timer_pid=$!
		wait "$timer_pid" || exit 0
		timer_pid=
		if kill -0 "$pid" 2>/dev/null; then
			: > "$marker"
			kill -TERM "$pid" 2>/dev/null || true
			sleep 0.1
			kill -KILL "$pid" 2>/dev/null || true
		fi
	) &
	watchdog=$!
	if wait "$pid" 2>/dev/null; then status=0; else status=$?; fi
	kill "$watchdog" 2>/dev/null || true
	wait "$watchdog" 2>/dev/null || true
	if [[ -e "$marker" ]]; then
		rm -f -- "$marker"
		return 124
	fi
	return "$status"
}

cleanup() {
	local status=$?
	local cleanup_status
	local verification_status
	trap - EXIT
	trap '' HUP INT TERM
	if [[ -n "$volume" && "$volume_state" != foreign ]]; then
		if verify_volume_owner cleanup; then
			if run_cleanup_bounded "$VOLUME_REMOVE_TIMEOUT_SECONDS" \
				docker volume rm --force "$volume" >/dev/null; then
				:
			else
				cleanup_status=$?
				if (( cleanup_status == 124 )); then
					printf 'timed out after %ss removing browser authority volume %s\n' \
						"$VOLUME_REMOVE_TIMEOUT_SECONDS" "$volume" >&2
				else
					printf 'failed to remove browser authority volume %s\n' "$volume" >&2
				fi
				if (( status == 0 )); then status=$cleanup_status; fi
			fi
		else
			verification_status=$?
			if (( verification_status == 124 )); then
				printf 'timed out after %ss verifying browser authority volume %s ownership; leaving it intact\n' \
					"$CLEANUP_INSPECT_TIMEOUT_SECONDS" "$volume" >&2
			else
				printf 'refusing to remove browser authority volume %s: ownership could not be verified\n' \
					"$volume" >&2
			fi
			if (( status == 0 )); then status=$verification_status; fi
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

verify_volume_owner() {
	local mode=${1:-active}
	local output="$scratch/volume-owner"
	local observed
	: > "$output"
	if [[ "$mode" == cleanup ]]; then
		if run_cleanup_bounded "$CLEANUP_INSPECT_TIMEOUT_SECONDS" \
			docker volume inspect \
			--format "{{ index .Labels \"$VOLUME_OWNER_LABEL\" }}" \
			"$volume" > "$output"; then :; else return $?; fi
	else
		if ! run_active docker volume inspect \
			--format "{{ index .Labels \"$VOLUME_OWNER_LABEL\" }}" \
			"$volume" > "$output"; then
			return 2
		fi
	fi
	observed=$(tr -d '\r\n' < "$output")
	if [[ "$observed" != "$owner" ]]; then return 1; fi
}

trap cleanup EXIT
trap 'handle_signal 129' HUP
trap 'handle_signal 130' INT
trap 'handle_signal 143' TERM

scratch=$(mktemp -d "${TMPDIR:-/tmp}/yesid-browser-authority.XXXXXXXX")
archive="$scratch/source.tar"
trusted_git archive --format=tar --output="$archive" "$commit"
owner=$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')
if [[ ! "$owner" =~ ^[0-9a-f]{64}$ ]]; then
	printf 'browser authority generated an invalid volume owner\n' >&2
	exit 2
fi
volume="yesid-browser-authority-${commit:0:12}-$owner"
if [[ ! "$volume" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]]; then
	printf 'browser authority generated an invalid Docker volume name\n' >&2
	exit 2
fi
run_active docker volume create --label "$VOLUME_OWNER_LABEL=$owner" "$volume" >/dev/null
if verify_volume_owner; then
	volume_state=owned
else
	verification_status=$?
	if (( verification_status == 1 )); then volume_state=foreign; fi
	printf 'browser authority volume ownership mismatch for %s\n' "$volume" >&2
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
	--env HOME=/tmp/bootstrap-home \
	--env XDG_CACHE_HOME=/tmp/bootstrap-cache \
	--env XDG_CONFIG_HOME=/tmp/bootstrap-config \
	--workdir /authority \
	"$IMAGE" \
	bash -euo pipefail -c '
		mkdir -p /authority/repo /authority/toolchain "$HOME" "$XDG_CACHE_HOME" "$XDG_CONFIG_HOME" /tmp/bun-cache
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
		/authority/toolchain/bun --cwd=/authority/repo --config=/dev/null --no-env-file \
			install --frozen-lockfile --ignore-scripts \
			--registry=https://registry.npmjs.org \
			--cache-dir=/tmp/bun-cache
		getent passwd pwuser >/dev/null
		getent group pwuser >/dev/null
		chown -h -R -P root:root /authority/repo /authority/toolchain
		chmod -R u=rwX,go=rX /authority/repo /authority/toolchain
		generated_paths=(
			/authority/repo/apps/gallery/.svelte-kit
			/authority/repo/apps/gallery/build
			/authority/repo/apps/gallery/test-results
			/authority/repo/apps/gallery/playwright-report
			/authority/repo/apps/gallery/node_modules/.vite
			/authority/repo/apps/gallery/node_modules/.vite-temp
		)
		rm -rf -- "${generated_paths[@]}"
		install -d -m 0700 -o pwuser -g pwuser -- "${generated_paths[@]}"
		chown root:pwuser /authority/repo/apps/gallery
		chmod 1770 /authority/repo/apps/gallery
	'

run_container "$test_container" /dev/null \
	--platform linux/amd64 \
	--pull=never \
	--rm \
	--init \
	--read-only \
	--network=none \
	--cap-drop=ALL \
	--security-opt=no-new-privileges \
	--user pwuser \
	--tmpfs /tmp:rw,nosuid,nodev,exec,size=1g,mode=1777 \
	--shm-size=1g \
	--mount "$mount" \
	"${proxy_env[@]}" \
	--env CI=1 \
	--env HOME=/tmp/home \
	--env XDG_CACHE_HOME=/tmp/cache \
	--env XDG_CONFIG_HOME=/tmp/config \
	--env TMPDIR=/tmp \
	--workdir /authority/repo/apps/gallery \
	"$IMAGE" \
	bash -euo pipefail -c '
		mkdir -p "$HOME" "$XDG_CACHE_HOME" "$XDG_CONFIG_HOME"
		readonly -a browser_specs=(
			tests/browser/accessibility.spec.ts
			tests/browser/gallery.authority.spec.ts
			tests/browser/gallery.visual.spec.ts
			tests/browser/runtime.spec.ts
		)
		run_playwright() {
			/authority/toolchain/bun --cwd=/authority/repo/apps/gallery --config=/dev/null --no-env-file \
				./node_modules/@playwright/test/cli.js test \
				--config playwright.config.ts \
				--forbid-only \
				--workers=1 \
				--retries=0 \
				--update-snapshots=none \
				--reporter=line \
				--project=chromium-noble-desktop \
				--project=chromium-noble-mobile \
				"$@" "${browser_specs[@]}"
		}
		test "$(id -un)" = pwuser
		test "$(stat -c %a .)" = 1770
		test -w .
		test ! -w /authority/toolchain/bun
		test ! -w ./node_modules/@sveltejs/kit/svelte-kit.js
		test ! -w ./node_modules/@playwright/test/cli.js
		test ! -w ./node_modules/vite/bin/vite.js
		test -w .svelte-kit
		test -w build
		test -w test-results
		test "$(/authority/toolchain/bun --cwd=/authority/repo/apps/gallery --config=/dev/null --no-env-file --version)" = "1.3.11"
		/authority/toolchain/bun --cwd=/authority/repo/apps/gallery --config=/dev/null --no-env-file ./node_modules/@sveltejs/kit/svelte-kit.js sync
		browser_list=$(run_playwright --list)
		printf "%s\n" "$browser_list"
		mapfile -t browser_totals < <(grep -E "^Total: " <<< "$browser_list")
		if (( ${#browser_totals[@]} != 1 )) || [[ "${browser_totals[0]}" != "Total: 16 tests in 4 files" ]]; then
			printf "browser authority expected exactly 16 tests in 4 files\n" >&2
			exit 2
		fi
		/authority/toolchain/bun --cwd=/authority/repo/apps/gallery --config=/dev/null --no-env-file ./node_modules/vite/bin/vite.js build
		run_playwright
	'
