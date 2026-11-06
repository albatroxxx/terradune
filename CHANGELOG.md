# Changelog

## 1.0.7

### Security

- Releases build with Go 1.27.3. Go 1.27.1 carried four standard-library
  vulnerabilities in `net/http` and its HTTP/2 implementation that the server
  reaches (GO-2026-6611, GO-2026-6612, GO-2026-6613, GO-2026-6617); the `go`
  directive names the patched toolchain, so `go install` builds every copy
  with it. `golang.org/x/text` moves to 0.41.0, closing GO-2026-6629.
- The server sends a Content-Security-Policy that allows only its own origin
  and the page's own inline script and style blocks, by hash, plus
  `Cross-Origin-Opener-Policy`. Inline style attributes in the page became
  classes so the policy can forbid them outright. Plan values were already
  escaped; this is the layer behind that.
- Fuzz targets cover the DOT and plan parsers, the listen address, the Host
  allowlist and the resource lookup, and run briefly in CI.

### Fixed

- Map cards and graph nodes take their accessible names from their visible
  text, as WCAG 2.5.3 asks, instead of an `aria-label` that replaced it; the
  pin hint and the workspace are read after the name. axe-core 4.14 flags
  the previous names.

### Development

- Every GitHub Action and scanner in CI is pinned to a commit; Dependabot
  proposes grouped updates. terraform-exec 0.26.0, terraform-json 0.29.0,
  Playwright 1.64.1 and axe-core 4.14.0.
- A root `CONTRIBUTING.md`, `GOVERNANCE.md`, `CODE_OF_CONDUCT.md`, a pull
  request template, a feature request form, a threat model and a security
  policy with scope and advisory triage.

## 1.0.6

### Fixed

- Slow resource-details clients no longer hold the shared state lock while a response is written, including error responses, so other requests and plan updates can continue.
- JSON Terraform variable files (`.tfvars.json` and `.auto.tfvars.json`) now trigger live refreshes under the scanned root.
- Change batches containing both shared and workspace-specific paths replan every scanned workspace; empty batches no longer schedule unnecessary plans.

### Development

- Added regression tests for stalled HTTP responses, JSON variable file events, and mixed edit batches.
- Change-aware CI, website layout/accessibility tests, and fast pre-commit checks protect future updates.

## 1.0.5

- Plan resource-type navigation and counts now follow action, search, workspace, and changes-only filters; unavailable type selections reset automatically.
- Resource details show explicit Before and After values for changed attributes, including attached routes and associations, unknown values, creations, replacements, and deletions.
- VPC inventories use compact resource cards; subnet previews are limited to three entries with access to the full inventory.
- Single-click preserves the complete map; double-click focuses dependencies without losing VPC/subnet sections. Connection lines are masked behind cards.
- Compact navigation and collapsible filters reclaim workspace height while retaining keyboard access and reduced-motion support.

## 1.0.4

### Fixed

- Changes-only Resource Map retains unchanged topology around changed routes,
  associations, rules, and attachments. Parent resources show attached-change
  counts without falsely changing their Terraform action.
- Connection changes expose added, updated, replaced, and deleted resources,
  including unresolved endpoints, previous values, and unknown repeated blocks.
- Route metadata and filtering handle IPv6, prefix lists, default route tables,
  and modern security-group ingress/egress resources.

### Improved

- Dense subnets show up to five compact resource references instead of stacked
  cards, with access to the full subnet-filtered VPC inventory.
- VPC inventory groups compute and containers, databases and caches, storage,
  networking, security, and other resources. Placement follows subnet/cluster
  relationships, without attributing unrelated dependencies to a VPC.
- Natural resource ordering, size/runtime metadata, multi-subnet associations,
  accessible details, and preserved selection, scroll, and focus on refresh.

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
