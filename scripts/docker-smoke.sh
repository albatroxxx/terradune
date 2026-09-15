#!/usr/bin/env bash
set -euo pipefail

image=${1:-terradune:test}
name="terradune-smoke-$$"
workspace=$(mktemp -d)
cleanup() {
  docker rm -f "$name" >/dev/null 2>&1 || true
  rm -rf "$workspace"
}
trap cleanup EXIT INT TERM
cp testdata/docker/main.tf "$workspace/main.tf"

test "$(docker run --rm --entrypoint id "$image" -u)" != 0
docker run --rm "$image" -version
docker run --rm --user "$(id -u):$(id -g)" -v "$workspace:/workspace" \
  --entrypoint terraform "$image" init -input=false -no-color
test -d "$workspace/.terradune"
test ! -d "$workspace/.terraform"
docker run --rm --user "$(id -u):$(id -g)" -v "$workspace:/workspace" "$image" -print /workspace

docker run -d --name "$name" --user "$(id -u):$(id -g)" \
  --cap-drop ALL --security-opt no-new-privileges --read-only --tmpfs /tmp:mode=1777 \
  -p 127.0.0.1:18383:8383 -v "$workspace:/workspace" "$image"
ready=false
for attempt in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:18383/state | jq -e '.workspaces[0] | .rebuilding == false and (.error // "") == "" and (.nodes | length) == 2' >/dev/null; then
    ready=true
    break
  fi
  sleep 1
done
if [ "$ready" != true ]; then
  docker logs "$name"
  exit 1
fi
curl -fsS http://127.0.0.1:18383/healthz
curl -fsS http://127.0.0.1:18383/state | jq -e '.workspaces[0].edges | length == 1'
curl -fsS 'http://127.0.0.1:18383/resource?workspace=workspace&address=terraform_data.network' | jq -e '.address == "terraform_data.network"'
test "$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: rebinding.invalid' http://127.0.0.1:18383/state)" = 403
docker stop -t 15 "$name" >/dev/null
test "$(docker inspect --format '{{.State.ExitCode}}' "$name")" = 0
printf 'Docker initialization, planning, HTTP, non-root execution, and shutdown passed.\n'
