# Changelog

## 1.0.1

The first release with native binary archives, and the release the
latest-oriented installation instructions resolve to.

### Added

- Signed binary archives for Linux, macOS, and Windows on AMD64 and ARM64,
  attached to the release with `checksums.txt` and a keyless cosign Sigstore
  bundle. CI builds all six archives on every pull request, verifies their
  checksums and contents, executes the host-native binary on three operating
  systems, and rehearses the signing round trip on trusted main.
- OpenTofu is accepted when Terraform is not installed. Terraform still wins
  when both are present, and the interface names whichever produced the plan.
  Real Terraform 1.16.2 and OpenTofu 1.12.6 integration tests run on Linux,
  macOS, and Windows.
- A browser and accessibility suite drives the real embedded interface in
  Chromium, Firefox, and WebKit: keyboard navigation, dialogs, automated
  WCAG A/AA checks, and responsive layouts down to 320px.
- A bug report form asking for the version, install method, CLI, view, and a
  synthetic reproduction; update and removal instructions for every install
  method.

### Fixed

- Live plan updates no longer drop keyboard focus: the focused control is
  re-resolved after each redraw, and a details dialog returns focus to its
  rebuilt opener. Dimmed map cards and drawer counts keep WCAG AA contrast.
- The interface titles itself "Terradune" in the browser tab and header.
- Installation examples no longer hardcode versions that may not exist; they
  resolve the latest release and show how to pin.

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
