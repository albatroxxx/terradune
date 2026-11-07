# Terradune Threat Model

Terradune is a local, single-user review tool. It runs `terraform plan`,
`show` and `graph` on workspaces you point it at, keeps the result in memory,
and serves it to a browser on the same machine over plain HTTP with no
authentication. This document says what that trusts, what it defends against,
and what it does not. It is kept current with the code; a change that moves a
boundary updates it in the same pull request.

## 1. What Terradune is, and is not

- **Is**: a reader of Terraform's own output. It never runs `apply`, never
  writes to a backend, and keeps no configuration, cache or state of its own
  beyond one temporary directory per plan, deleted afterwards.
- **Is not**: a service. There is no account, no upload, no remote endpoint.
  The only network listener binds `127.0.0.1` unless you say otherwise.
- **Reads**: the plan, which contains everything Terraform knows about your
  infrastructure, including values that are secrets whether or not Terraform
  marked them so.

## 2. Trust boundaries

```
 ┌──────────────── your machine ────────────────────────────────────────┐
 │  browser tab ──TB1── terradune ──TB2── terraform / tofu ──TB3── providers,
 │  (any origin        (loopback          (plugins, external          backends,
 │   you have open)     HTTP + SSE)        data sources)               cloud APIs
 │                          │
 │                          └── TB4 ── temporary plan directory, process memory
 └───────────────────────────────────────────────────────────────────────┘
      TB5: how the binary reaches you (go install, module proxy, checksum DB)
      TB6: the website and this repository's CI
```

| Boundary | What crosses it | What Terradune trusts |
|---|---|---|
| **TB1** browser and server | HTTP GET/HEAD requests; the state JSON; a server-sent-events stream; the embedded page and assets | The person at the keyboard. Not any other page open in the same browser. |
| **TB2** Terradune and the CLI | `terraform plan`, `show -json`, `graph`; variables and var-files you pass; the environment | The Terraform project being reviewed, entirely. Planning runs provider plugins and external data sources as your user. |
| **TB3** the CLI and the world | Whatever the configuration's providers and backends do | Out of Terradune's hands; `-refresh=false` (the default) does not make planning offline. |
| **TB4** plan data at rest and in memory | The JSON plan, in a temporary directory and in the server's memory | The filesystem permissions of your user. |
| **TB5** distribution | `go install github.com/albatroxxx/terradune@vX.Y.Z` | Go's module proxy and checksum database, which record every published version immutably. |
| **TB6** website and CI | GitHub Pages; GitHub Actions and the actions they run | GitHub; each action and scanner is pinned to a commit. |

## 3. Assets, ranked

1. **The plan's contents**: attribute values (some are credentials, keys or
   connection strings), resource addresses, IP ranges, account identifiers,
   provider diagnostics. Exposure is the main harm Terradune could cause.
2. **Your credentials and session**: the AWS profile, SSO cache or environment
   that Terraform uses. Terradune never reads them; Terraform does.
3. **Your machine**: anything the user running Terradune can do, which is
   what a provider plugin or `external` data source can do during a plan.
4. **The integrity of the binary** you install, and of this repository.

## 4. Attackers, and what they can reach

| Attacker | How they could reach Terradune | What stops them |
|---|---|---|
| **A web page in the same browser** (malicious site, advert, extension content) | Make the browser request `http://localhost:8383/state` and read the plan; frame the page; rebind a DNS name to `127.0.0.1` and read it as a same-origin page | Browsers refuse cross-origin reads of the JSON; `Cross-Origin-Resource-Policy: same-origin` adds the server's own refusal; `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY` refuse framing; a Host header that is not `localhost` or an IP literal is answered 403, which defeats DNS rebinding; only GET and HEAD are served, so there is nothing to CSRF. |
| **A hostile plan** (a module from a registry, a resource name or tag written to look like HTML or script) | Have the page render it as markup and run in your browser | Every value interpolated into markup goes through the page's escape function; the Content-Security-Policy allows only the page's own inline script and style blocks, by hash, and nothing inline otherwise, so an escaped value that slipped through would still not execute; the browser suite checks every view under that policy, and fuzz targets feed malformed plans and graphs to the parsers. |
| **A hostile Terraform project** (provider plugin, `external` data source, provisioner) | Run code as your user during `terraform plan` | Nothing in Terradune: this is Terraform's design, and it is why the README says to review only projects you would run `terraform plan` on yourself. Terradune adds no capability here and never runs `apply`. |
| **Another user on the same machine** | Connect to the loopback port and read the plan | Nothing in Terradune: loopback is reachable by every local user, and there is no authentication. Do not run Terradune on a shared host with a plan you would not show the other users. |
| **Someone on your network** | Connect to the port | The default bind is `127.0.0.1`. `-host 0.0.0.0` or `TERRADUNE_HOST` publishes the plan to the network with no authentication or TLS; the flag help and the README say so. |
| **A supply-chain attacker** | A compromised action, scanner, dependency or toolchain in CI or in the binary | Actions and scanners are pinned to commits; Dependabot proposes updates in grouped pull requests; gosec, staticcheck, govulncheck, Semgrep and CodeQL run on every change; OpenSSF Scorecard reports weekly; `go install` verifies every module against Go's checksum database, and the Go toolchain is named in `go.mod` so each release builds with a patched standard library. |

## 5. Controls, as implemented

- **Loopback by default.** `main.go` refuses a host that is neither
  `localhost` nor an IP literal, and a port outside 1–65535.
- **A Host allowlist on every request**, GET and HEAD only, and the security
  headers above, set in `internal/server/server.go`. A fuzz target feeds the
  Host check arbitrary strings and asserts that only `localhost` and IP
  literals are ever served.
- **Content-Security-Policy** `default-src 'none'`, with `script-src` and
  `style-src` allowing `'self'` plus the SHA-256 of each inline block in the
  embedded page, computed at start from the file the binary carries; images,
  fonts and connections from `'self'`; `base-uri`, `form-action` and
  `frame-ancestors` `'none'`. A Go test recomputes the hashes and refuses any
  `style="…"` attribute or inline handler in the page, since the policy would
  drop them silently.
- **Escaping at every interpolation.** `esc()` in `internal/server/index.html`
  encodes `& < > "`; the headless page tests and the browser suite render the
  fixtures through it.
- **Sensitivity masks** from Terraform's own `sensitive_values` are applied
  with `terraform-json`'s sanitizer to every value that leaves the server,
  before/after and nested values included, and the tests assert that marked
  values never reach `/state` or `/resource`. Unmarked secrets are not
  detected; see residual risks.
- **No apply, ever.** The ingest layer runs `plan`, `show -json` and `graph`;
  the integration tests run real Terraform and OpenTofu and check that no
  state is written.
- **Temporary plan directories** are created per plan and removed; nothing of
  Terradune's persists between runs.
- **Pinned supply chain and static analysis** as listed in
  [SECURITY-SIGNALS.md](SECURITY-SIGNALS.md) and [CI.md](CI.md).

## 6. Residual risks

- **Unmarked secrets** in attribute values, resource names, tags, outputs and
  provider diagnostics are shown as Terraform produced them. Terradune cannot
  know they are secrets. Treat the page, `-print` output and screenshots as
  containing whatever the plan contains.
- **Any local user can read the plan** while Terradune runs. Loopback is not
  a user boundary.
- **`-host` publishes the plan.** The flag exists for containers and remote
  development; there is no authentication or TLS to add in front of it, so
  anyone who can reach the port can read every value Terraform did not mark.
- **The reviewed project runs code.** A plan is not a passive read. Terradune
  does not sandbox Terraform and cannot.
- **A browser extension** with access to `localhost` pages can read what the
  page shows; the policy constrains the page, not the browser.
- **Scanners are point-in-time.** A clean run says no known issue was found
  that day with those tools.

## 7. Out of scope

Authentication, multi-user access, TLS, remote deployment, plan upload or
storage, and reading infrastructure that no plan describes. A request for any
of these is a request for a different kind of tool, and the honest answer is
to keep Terradune local.

## 8. Reporting and review

Report a weakness privately through
[GitHub's vulnerability reporting](https://github.com/albatroxxx/terradune/security/advisories/new);
[SECURITY.md](../SECURITY.md) says what to include. This model is reviewed
when a boundary moves: a new listener, a new input the server parses, a new
place plan values are rendered, a new way the binary is delivered.
