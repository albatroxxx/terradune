# Security Policy

## Supported Versions

Security fixes target the latest stable 1.x release. Development snapshots and
pre-v1 revisions are not supported release channels. Upgrade to the latest
patch when reporting a problem.

## Report Privately

Use [GitHub private vulnerability reporting](https://github.com/albatroxxx/terradune/security/advisories/new).
Do not include real state, plans, credentials, account identifiers, or
unredacted logs in public issues. Provide a synthetic reproduction, affected
version, installation method, and expected versus observed behavior. This
volunteer project does not promise a response-time SLA; reports are read, and
a fix ships in the next release with credit unless you prefer otherwise.

## Scope

Terradune reads plans that contain secrets and serves them on loopback with no
authentication, so these count as vulnerabilities:

- a value Terraform marked sensitive reaching `/state`, `/resource`, the SSE
  stream or `-print` output unmasked, including nested and before/after values;
- plan content executing in the browser: a resource name, tag, attribute value
  or diagnostic rendered as markup or script despite the escaping and the
  Content-Security-Policy;
- the server answering a request that the Host allowlist, method check or
  loopback default should have refused, or binding anything but loopback
  without being asked;
- Terradune running `apply`, writing to a backend or state, or invoking the
  CLI with arguments the user did not pass;
- a path traversal, crash or hang from a crafted plan, DOT graph, query string
  or Host header;
- anything that weakens the release or CI supply chain: a workflow that
  publishes from an untrusted branch, an unpinned action, a scanner silenced
  without a reason.

Terraform executing provider plugins and external data sources during a plan is
how Terraform works, not a Terradune vulnerability; the
[threat model](docs/THREAT-MODEL.md) describes what Terradune can and cannot
defend against there. Unmarked secrets shown as Terraform produced them are a
documented limitation, not a report.

## Trust Boundary

- Terradune is a local, single-user tool with no authentication or TLS. Keep
  the server bound to loopback. The Host allowlist, the Content-Security-Policy
  and the other response headers are defense in depth against pages open in
  the same browser, not authorization: any user of the same machine can read
  the port.
- Run only trusted Terraform projects. Planning can load provider executables,
  contact backends/cloud APIs, and execute external data sources.
  `-refresh=false` does not make planning offline. Terradune does not invoke
  apply.
- Terraform sensitivity masks are applied to inventory metadata and detail
  values. Unmarked secrets, resource addresses, file paths, and
  Terraform/provider diagnostics are not automatically anonymized. Do not
  expose the API or share raw screenshots without inspection.
- Prefer short-lived provider credentials. The workspace must be writable for
  initialization and state locking.
- Embedded UI assets avoid CDN requests, and the policy forbids any other
  origin. Terraform itself still makes network requests required by the
  configuration.

The full picture, boundary by boundary, is in
[docs/THREAT-MODEL.md](docs/THREAT-MODEL.md).

## How Fixes Ship

Terradune is installed with `go install`, so a fix in the Go standard library
reaches users through the `go` directive in `go.mod`: a release names the
patched toolchain, and `go install …@vX.Y.Z` builds with it. A dependency fix
is a version bump in the same release. Each release note names the advisories
it closes. Published tags are never moved; a bad release gets a corrective
patch, as [docs/RELEASING.md](docs/RELEASING.md) describes.

## Dependency Advisories

`govulncheck` runs in CI on every change and fails the build on any advisory
that this code's call paths reach. OpenSSF Scorecard checks the dependency set
against the OSV database weekly. Nothing is currently ignored. Advisories that
reached only unused code paths would be triaged here, each with the reason a
reviewer can verify, and revisited when the dependency changes.

Closed by release:

- **1.0.7**: GO-2026-6611, GO-2026-6612, GO-2026-6613 and GO-2026-6617
  (`net/http` and its HTTP/2 implementation in Go 1.27.1, reachable from the
  server) by building with Go 1.27.3; GO-2026-6629 (`golang.org/x/text`
  before 0.41.0) by updating the module.

CI runs static analysis and dependency vulnerability checks. A passing scan is
a point-in-time signal, not a guarantee that no vulnerabilities exist. Weekly
CI and dependency updates keep the checks active after release.

## Design References

- Threat model: [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md)
- What each badge measures and what it does not:
  [docs/SECURITY-SIGNALS.md](docs/SECURITY-SIGNALS.md)
- OpenSSF Scorecard report: <https://scorecard.dev/viewer/?uri=github.com/albatroxxx/terradune>
- Published advisories: <https://github.com/albatroxxx/terradune/security/advisories>
