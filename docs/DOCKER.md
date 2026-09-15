# Docker Guide

## Quick Start

Use the commands in the [README](../README.md#docker) from the Terraform working directory. Docker Desktop works on macOS and Windows; the images are Linux AMD64 and ARM64, not Windows containers. On Windows, use WSL2 for these POSIX-shell examples, or install Terradune with Go.

Terradune needs a writable workspace for Terraform initialization and state locking. Only run trusted configurations: Terraform providers and external data sources execute code with the container's credentials and mount access. No apply is performed by Terradune.

## Provider Data

The image sets `TF_DATA_DIR=.terradune`. Run `terraform init` through the same image before starting Terradune. Reusing a macOS `.terraform` directory does not provide Linux provider binaries. Native Go execution honors your `TF_DATA_DIR`, defaulting to `.terraform`.

Relative data directories resolve per workspace. An absolute `TF_DATA_DIR` selects one explicit working directory and is not reused across recursively discovered workspaces. Backend selection and Terraform CLI workspace selection live in that data directory too: repeat your normal backend initialization options, then select the intended CLI workspace inside the container when it is not `default`.

```sh
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/workspace" \
  --entrypoint terraform ghcr.io/albatroxxx/terradune:1.0.0 workspace select staging
```

Do not run native and container Terraform against the same state concurrently. Keep state locking enabled. Add `.terradune/` to your infrastructure repository's `.gitignore`; never commit state, plans, credentials, or secret variable files.

## AWS Authentication

For profiles, set `AWS_PROFILE` and optionally `AWS_REGION` on the host, and add these flags to **both init and Terradune** commands:

```sh
-e AWS_PROFILE -e AWS_REGION \
-v "$HOME/.aws:/home/terradune/.aws:ro"
```

For SSO, log in on the host first. The read-only cache cannot be refreshed in the container. The image does not include AWS CLI or custom `credential_process` helpers; use native Go execution when your existing credential tooling cannot run in Linux. File permissions must allow the selected UID to read the mounted credentials, without making them world-readable.

Alternatively, forward existing short-lived environment credentials without putting their values in shell history:

```sh
-e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_SESSION_TOKEN -e AWS_REGION
```

Web-identity tokens, custom CA certificates, SSH-based modules, and credentials outside the workspace require explicit read-only mounts and the matching environment settings. Do not mount the Docker socket or an entire home directory. Never bake credentials into an image.

## Compose

From the Terradune checkout, point the included Compose file at your workspace:

```sh
export TERRAFORM_DIR=/absolute/path/to/infra
export LOCAL_UID=$(id -u) LOCAL_GID=$(id -g)
docker compose run --rm --entrypoint terraform terradune init -input=false
docker compose up
```

Stop with Ctrl+C, then `docker compose down`. Add profile mounts/environment to a local Compose override if needed; the committed example intentionally contains no credentials. The default image user is UID/GID 10001; matching your host UID avoids root-owned files on Linux. A host root UID explicitly overrides the non-root default and is not recommended.

## Ports And Flags

The image listens on `0.0.0.0:8383` **inside** the container. Publish `127.0.0.1:8383:8383`, never an unrestricted host port. There is no authentication or TLS. Docker's [port publishing guidance](https://docs.docker.com/engine/network/port-publishing/) explains the distinction.

Use `-p 127.0.0.1:8484:8383` if port 8383 is occupied. Arguments after the image replace its default command; include `/workspace` after any flags:

```sh
docker run --rm --user "$(id -u):$(id -g)" \
  -p 127.0.0.1:8383:8383 -v "$PWD:/workspace" \
  ghcr.io/albatroxxx/terradune:1.0.0 -var-file /workspace/prod.tfvars /workspace
```

`/healthz` checks HTTP liveness, not successful planning. Inspect the UI's workspace error state or use `-print` for a one-shot command that exits nonzero when planning fails. SIGINT/SIGTERM cancels active Terraform commands and closes SSE clients before exiting.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No workspaces found | Run container init; verify `.terradune/` exists in the mounted directory |
| Provider executable format error | Initialize Linux providers inside the image, not in the host data directory |
| Permission denied | Match host UID/GID and verify writable workspace/readable credential mounts |
| Backend initialization required | Repeat backend flags and workspace selection in the container's data directory |
| AWS credentials missing | Pass credentials to init as well as the server; check SSO expiry |
| State lock timeout | Stop the competing Terraform process; do not force-unlock an active lock |
| Health check fails with custom port | Keep container port 8383 or override the image health check consistently |

## Update And Removal

Pull the version you want and start it the same way; there is no state to carry
across versions, and the container is disposable because every documented run
uses `--rm`.

```sh
# latest follows the newest release; name a version to pin one.
docker pull ghcr.io/albatroxxx/terradune:latest
```

With Compose, change the `image:` line, then `docker compose pull` followed by
`docker compose up`. `docker compose down` removes the container and its network.

Removing Terradune is removing its images, and then the provider data the
container wrote:

```sh
docker images ghcr.io/albatroxxx/terradune --format '{{.Repository}}:{{.Tag}}'
docker rmi ghcr.io/albatroxxx/terradune:1.0.0
docker image prune   # only the layers nothing else references
```

`.terradune/` holds Linux provider binaries for one workspace and can be large.
It is safe to delete and is rebuilt by the next `terraform init` through the
image. `.terraform/` is not Terradune's — it belongs to whatever Terraform CLI
you run natively, and deleting it forces you to initialize that again.

```sh
rm -rf .terradune
```

An image pinned by digest is not covered by a tag pull. Re-pull the tag, or pull
the newer digest from the release notes, when you have pinned one.

## Image Provenance

The Dockerfile pins Go 1.27.1 and the Terraform 1.16.2 base by digest. Terraform is rebuilt from the unmodified upstream `v1.16.2` commit `82e042fb6372443813f6759056308d6adc642fa1` with Go 1.27.1 because the upstream image's bundled Go standard library failed the release vulnerability gate. Alpine security updates are applied during the build. This is a Terradune-distributed build, not HashiCorp's signed release binary; Terraform experiments remain disabled.

The source build follows [upstream build options](https://github.com/hashicorp/terraform/blob/v1.16.2/BUILDING.md). Terraform's [BUSL-1.1 license](https://github.com/hashicorp/terraform/blob/v1.16.2/LICENSE) is retained at `/usr/share/licenses/terraform/LICENSE`; Terradune's license is at `/usr/share/licenses/terradune/LICENSE`. Other components retain their upstream licenses. Terraform and AWS are trademarks of their respective owners; Terradune is independent.

Release notes contain an immutable multi-platform digest. Prefer `ghcr.io/albatroxxx/terradune@sha256:...` for reproducible deployment; `1`, `1.0`, and `latest` are moving convenience tags. SBOM and provenance attestations accompany the published manifest. Build provenance identifies the source and dependencies, but is not a claim of a byte-for-byte reproducible build.

```sh
docker build --build-arg VERSION=dev -t terradune:dev .
bash scripts/docker-smoke.sh terradune:dev
```
