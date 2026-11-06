# Contributing to Terradune

Thanks for your interest in Terradune. This page covers how to report a
problem and how to work on the code. Terradune is licensed under
[Apache 2.0](LICENSE); by contributing you agree your contributions are
licensed under the same terms. Everyone taking part follows the
[code of conduct](CODE_OF_CONDUCT.md), and [GOVERNANCE.md](GOVERNANCE.md) says
who decides what.

## Reporting bugs and requesting features

Open an issue and pick a form:

- **Bug report**: something Terradune does that it should not, or fails to do.
  The form asks for the version, the CLI, the view, and a reproduction against
  a bundled example or a synthetic workspace.
- **Feature request**: an idea or an improvement.

Please **do not** open a public issue for a security vulnerability. Follow
[SECURITY.md](SECURITY.md) to report it privately.

Terraform plans contain secrets. Read whatever you attach, output and
screenshots alike, before posting it. `examples/tools/fakeapply.py` builds a
synthetic applied state, so a reproduction never needs a real account.

## Development setup

You need the Go version named in `go.mod` (Go downloads it on first use when
yours is older), a [Terraform](https://developer.hashicorp.com/terraform/install)
or [OpenTofu](https://opentofu.org/docs/intro/install/) CLI on your PATH,
Python 3.10+ for the repository scripts, and, for the browser suites, Node.js
22+ with the pnpm version in `e2e/package.json`.

```sh
git clone https://github.com/albatroxxx/terradune.git
cd terradune
terraform -chdir=examples/platform init
go run . examples/platform
```

Open the printed URL. `examples/platform`, `examples/layered` and
`examples/estate` carry **synthetic** applied state and plan offline;
`examples/simple` needs no AWS provider at all. For the embedded interface
alone, without Terraform, `go run -tags=e2e ./internal/e2eserver` serves the
platform fixture on `127.0.0.1:18393`.

[docs/CHECKS.md](docs/CHECKS.md) sets up the fast pre-commit hooks: syntax,
Go formatting, private-key markers and the website check. They are a
convenience, not the gate; CI runs them against every change anyway.

## Before you open a pull request

Run what CI runs, from the repository root, and make sure it passes:

```sh
gofmt -l . | grep -v '^examples/'                       # prints nothing
go vet ./...
go test -race -count=1 -covermode=atomic -coverprofile=coverage.out ./...
python3 scripts/check-coverage.py coverage.out          # 85% per package
python3 -m unittest discover -s scripts -p 'test_*.py'  # the CI tooling
python3 scripts/check-site.py                           # when site/ changed
python3 scripts/fuzz.py --fuzztime 5s                   # when a parser changed
```

The scanners CI pins are run the same way locally; the exact commits are in
[the workflow](.github/workflows/ci.yml):

```sh
go run honnef.co/go/tools/cmd/staticcheck@<commit> ./...
go run github.com/securego/gosec/v2/cmd/gosec@<commit> -quiet ./...
go run golang.org/x/vuln/cmd/govulncheck@<commit> ./...
```

The browser suites drive the real embedded interface in Chromium, Firefox and
WebKit, with axe-core's WCAG 2.1 A/AA rules; see [e2e/README.md](e2e/README.md).
Run them for any change under `internal/server/`:

```sh
cd e2e && pnpm install --frozen-lockfile && pnpm test
```

[docs/CI.md](docs/CI.md) says which jobs each kind of change selects.
`CI result` is the one required check; it fails closed.

## Tests are part of the change

- **New behaviour comes with tests** in the same pull request: Go tests beside
  the package, a case in `internal/server/testdata/checks.js` for the
  interface's logic, and a Playwright test when the change is visible in the
  browser.
- **A bug fix comes with a regression test** that fails before the fix and
  passes after. Say so in the pull request if that is genuinely impractical.
- **A parser gets a fuzz target.** Terraform's plan JSON, its DOT graph, the
  listen address and the HTTP boundary each have one (`func Fuzz…` beside the
  tests); `scripts/fuzz.py` discovers and runs them, briefly in CI and for as
  long as you like locally.
- **Try to break what you built** before you open the pull request, and say
  what you tried in its "What I tried to break" section: a plan with a
  resource name that looks like HTML, an edit during a running plan, a
  workspace that disappears, a second browser tab, a slow client, the wrong
  Host header. A probe that breaks something becomes a regression test.
- **Coverage has a floor** of 85% of statements in every production package;
  CI fails under it. Raise it when tests land; never lower it.
- **Test against applied state**, not only against a plan of an empty
  workspace. Before apply, every id is "known after apply" and only the
  all-create path runs; real infrastructure is the other case. Generate state
  with `examples/tools/fakeapply.py`; never hand-write it.

## Conventions

- **Go** follows [Effective Go](https://go.dev/doc/effective_go) and the
  [Go Code Review Comments](https://go.dev/wiki/CodeReviewComments). `gofmt`,
  `go vet`, staticcheck and gosec gate the build.
- **The interface is plain HTML, CSS and JavaScript** embedded in the binary.
  There is no build step and no CDN; a contributor edits
  `internal/server/index.html` and the files under `internal/server/assets/`
  and runs the Go tests.
- **Every value interpolated into markup goes through `esc()`.** Resource
  addresses, attribute values and provider diagnostics are untrusted input.
  The server's Content-Security-Policy allows only the page's own inline
  script and style blocks by hash, so a `style="…"` attribute or an `on…=`
  handler in markup is dropped by the browser; a Go test refuses them.
- **Controls are named by what they show.** A button's accessible name is its
  visible text (WCAG 2.5.3); extra context for assistive technology goes in a
  visually hidden span after it, never in an `aria-label` that replaces it.
  axe-core enforces this in the browser suite.
- **Draw only what the plan states.** When Terraform cannot say which
  instance a dependency points at, nothing is drawn: a line reads as a fact.
  Status is written on every card, never carried by colour alone.
- **Scripts** under `scripts/` are dependency-free Python 3.10+ with unit
  tests; CI runs them before anything else.

## Documentation

Write as you would explain it to a colleague: short sentences, the thing
named, the reason given. Say what Terradune does not do as plainly as what
it does; the compatibility boundary is part of the product. A screenshot
shows the release it documents and only synthetic infrastructure. Release
notes live under `docs/releases/` and are published as written; a mistake in
a past note is corrected by a later one, not rewritten.

Changes under `site/` run `python3 scripts/check-site.py` and the website
Playwright suite; the site deploys only when the version it advertises is a
published release.

## Design changes

Anything that changes what Terradune draws, how it reads a plan, or what its
server exposes starts as an issue, so the reasoning is on the record before
the code. The [makeover plan](docs/MAKEOVER.md) and
[V1 follow-through](docs/V1-FOLLOW-THROUGH.md) hold the direction and the
acceptance criteria; the [threat model](docs/THREAT-MODEL.md) holds the
security assumptions a change must keep.

## Pull requests

- Branch from `main` and keep each pull request to one change.
- Fill in the template: what changed and why, what you tried to break, and
  the security impact, even when it is "none".
- `CI result` must be green before a maintainer merges. Do not bypass it.
