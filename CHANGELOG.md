# Changelog

## Unreleased

### Added

- Signed binary archives for Linux, macOS, and Windows on AMD64 and ARM64,
  appended to each release by GoReleaser with `checksums.txt` and a keyless
  cosign signature. CI validates the release config and cross-builds on every
  pull request.
- OpenTofu is accepted when Terraform is not installed. Terraform still wins
  when both are present, and the interface names whichever produced the plan.

## 1.0.0

First stable release of the documented local plan-review workflow.

### Added

- Linux AMD64/ARM64 non-root Docker images with Terraform, Compose, liveness checks, separate provider data, SBOM, and provenance.
- Resource Map, Plan, and Graph views with filters, detail inspection, routed relationships, and expanded view.
- Terradune identity, GitHub Pages installation site, security policy, and release runbook.
- Container integration tests, cross-platform race tests, and image vulnerability scanning.

### Fixed

- Sensitive display metadata now honors Terraform masks in addition to detail values.
- Per-workspace planning is serialized; rapid edits coalesce and global concurrency is bounded.
- Slow SSE clients receive the newest queued snapshot.
- Cancellation shuts down Terraform and HTTP/SSE activity; one-shot plan failures return nonzero.
- Go-installed releases report their module version; listen addresses and ports are validated.

### Compatibility

Docker includes a patched-toolchain build of Terraform 1.16.2. Native installation requires Go 1.27.1+ and a separate Terraform CLI. Generic managed-resource rendering is not complete Terraform lifecycle parity. See [coverage](README.md#coverage).
