# Changelog

## 1.0.3

- Plan filters use each exact resource type instead of combined service groups.
- Resource Map uses teal filled-circle endpoints for direct dependencies and
  dashed blue hollow-circle endpoints for indirect associations.
- Go is the sole supported installation method; documentation includes Go
  setup and PATH instructions for macOS, Linux, and Windows.
- Release checks verify Go installation on three operating systems and validate
  the source commit and tagged module during publication.

## 1.0.2

### Fixed

- Subnets whose route table associations use `for_each` are classified
  correctly before apply: the resolver now reads the `for_each` expression, so
  an association iterating a subnet resource pairs with that subnet by key
  (#23). A subnet with no known association shows no public/private label at
  all, instead of claiming "private".

## 1.0.1

### Added

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

- Resource Map, Plan, and Graph views with filters, detail inspection, routed relationships, and expanded view.
- Terradune identity, GitHub Pages installation site, security policy, and release runbook.
- Cross-platform race tests and security scanning.

### Fixed

- Sensitive display metadata now honors Terraform masks in addition to detail values.
- Per-workspace planning is serialized; rapid edits coalesce and global concurrency is bounded.
- Slow SSE clients receive the newest queued snapshot.
- Cancellation shuts down Terraform and HTTP/SSE activity; one-shot plan failures return nonzero.
- Go-installed releases report their module version; listen addresses and ports are validated.

### Compatibility

Go installation requires Go 1.27.1+ and a separate Terraform CLI. Generic managed-resource rendering is not complete Terraform lifecycle parity. See [coverage](README.md#coverage).
