# Contributor Checks

See [test coverage](TESTING.md) for local test commands, the behavior/input
coverage map, and CI's per-package 85% Go statement-coverage floor. Add focused
success, failure, and boundary tests alongside behavior changes.

## Pre-Commit Checks

Development prerequisites: Python 3.10+, Go from `go.mod`, and Node.js 22+.
These are contributor tools, not additional installation requirements for users.

From the repository root:

```sh
python3 -m venv .cache/pre-commit-venv
.cache/pre-commit-venv/bin/python -m pip install pre-commit==4.6.2
.cache/pre-commit-venv/bin/pre-commit install
.cache/pre-commit-venv/bin/pre-commit run --all-files
```

On Windows, use `python` to create the environment and replace `bin/python`
and `bin/pre-commit` with `Scripts/python.exe` and `Scripts/pre-commit.exe`.
The local hooks need `python3`, `gofmt`, and `node` on PATH; configure a
`python3` launcher if your Windows installation only provides `python`.

The installed hook checks staged files, including partially staged changes,
using pre-commit's temporary stash/restore behavior. It never stages or
rewrites files itself. A missing required tool fails with an actionable error.
The first run downloads the pinned hook environment; later runs reuse it.

| Hook | Purpose |
| --- | --- |
| Merge conflicts | Reject accidentally committed conflict markers |
| YAML / JSON / Python | Reject invalid syntax, including duplicate YAML keys |
| Private keys | Catch recognized private-key markers; not a complete secret scanner |
| Go formatting | Read-only `gofmt` validation; format and re-stage explicitly |
| JavaScript syntax | `node --check` for each first-party JS file; excludes vendored ELK |
| Static site | Validate links, metadata, image alternatives, and sitemap when site/version changes |

Browser tests, `go test`, `go vet`, Terraform/OpenTofu integration, and security
scans stay in CI. Hooks never initialize/apply infrastructure or need AWS
credentials. Inline JavaScript in the embedded HTML remains covered by Go
frontend tests and the app-browser suite, not the standalone JS syntax hook.

CI runs the fast hooks against all tracked files on every run, so forgetting
to install hooks cannot bypass them. It skips only the hook's Go formatter:
the Go matrix already enforces formatting when Go/application code changes.
Site/docs-only changes still avoid Go and app-browser jobs.

To remove the local Git hook:

```sh
.cache/pre-commit-venv/bin/pre-commit uninstall
```

Use `pre-commit autoupdate --freeze` to propose hook revision updates through a
PR. Keep the pre-commit package version synchronized between this guide, the
config minimum, and the CI installation step. Do not bypass the required
`CI result` check on `main`.
