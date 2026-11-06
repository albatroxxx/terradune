<!-- Thanks for contributing to Terradune. Keep each pull request to one change. -->

## What does this PR do?

<!-- A short summary of the change and why it is needed. -->

Closes #

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / internal change
- [ ] Documentation or website
- [ ] Build / CI / tooling

## Checklist

- [ ] `gofmt -l .` prints nothing outside `examples/`, `go vet ./...` and `go test -race ./...` pass
- [ ] `python3 scripts/check-coverage.py` keeps every package at or above its 85% floor
- [ ] staticcheck, gosec and govulncheck pass at the commits pinned in `.github/workflows/ci.yml`
- [ ] New or changed behaviour is covered by tests in this PR; a bug fix carries the regression test that fails on `main`
- [ ] Changes under `internal/server/` ran the browser suite (`cd e2e && pnpm test`): every view, keyboard, axe and CSP checks
- [ ] Changes under `site/` ran `python3 scripts/check-site.py` and the website suite
- [ ] Every value interpolated into markup goes through `esc()`; no `style="…"` attributes or inline handlers
- [ ] Docs and release notes updated where behaviour, flags or install steps changed

## What I tried to break

<!-- Every change is attacked before it ships. List the probes you ran against the new or
     changed behaviour and what happened: a plan whose resource names look like HTML, a
     malformed plan or graph, an edit during a running plan, a workspace that disappears, a
     second browser tab, a slow or vanishing client, an unexpected Host header. A probe that
     broke something becomes a regression test in this PR. "Nothing applies" is an answer for
     a docs-only change. -->

## Security impact

<!-- Terradune reads plans that contain secrets and serves them on loopback with no
     authentication. Note any effect on what the server exposes, how plan values are masked
     or escaped, which network address is bound, what Terraform is asked to run, or the
     supply chain of the release and CI, or write "none". docs/THREAT-MODEL.md lists the
     boundaries. -->
