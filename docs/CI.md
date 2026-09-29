# Continuous Integration

CI runs on every pull request targeting `main` and every push to `main`.
The workflow itself is never path-filtered: `CI result` always reports a
conclusion, including when some expensive jobs are intentionally skipped.

## Selection

| Changed area | Checks selected |
| --- | --- |
| `site/**`, site checker, website browser tests/config | Static site, Chromium layout and accessibility |
| `internal/server/**`, including embedded HTML/CSS/JS/images | Go build/install/vet/race tests on three OSes, three app browsers, Go security |
| App browser tests/config and fixture server | Go tests and three app browsers |
| Other Go code, internal fixtures, Terraform examples | Go tests, app browsers, six Terraform/OpenTofu integrations, Go security |
| Root README/changelog/security/license, `docs/**`, issue templates | Selection tests and Semgrep only |
| Go/Node dependencies, version, workflows, CI scripts, unknown paths | Full suite |

Selection/source-check tests, fast pre-commit hooks, Semgrep
(Go/JavaScript/secrets rules), and the final gate run for every change.
The fast hooks do not install Go; formatting remains in the Go matrix.
See [contributor checks](CONTRIBUTING.md) for local setup and hook coverage.
Mixed changes select the union of their checks. Go security
includes gosec, staticcheck, and govulncheck; gosec runs once and produces SARIF
while still failing on findings. Optional SARIF upload is not the security gate.

Pull requests use the merge base of the PR base and head; pushes use the full
before/after range. Renames select both old and new paths, deletions count, and
filenames are NUL-delimited. A missing/unusable diff runs everything. This
avoids API pagination/file-count limits and narrow last-commit comparisons.

Weekly schedules, manual CI dispatches, and releases run the full suite.
The reusable workflow defaults to full validation, and Release explicitly
requests it. No application version bump is needed for CI-only changes.

## Merge Gate

`CI result` checks all selected jobs for **success**, not merely completion.
A failed/cancelled/missing check, an unexpectedly skipped selected job, or a
failed selector fails the gate. Only explicitly unselected jobs may be skipped.

Configure main branch protection to require `CI result` from GitHub Actions
and an up-to-date branch. Do not require individual matrix jobs: those are
legitimately skipped for unrelated edits. Enable the rule after this workflow
has reported successfully, and keep merges subject to maintainer approval.

GitHub Pages deployment remains separately path-filtered and validates the
static site before publishing. It does not wait for the post-merge CI run;
required PR checks are the pre-merge safeguard. Direct pushes must not be used
to bypass that validation. Release publication depends on the full CI workflow.

## Security Signals

[CodeQL](../.github/workflows/codeql.yml) is a separate workflow for source PRs
and `main`, plus weekly and manual scans. Markdown, documentation, images, and
CSS-only changes skip it. It analyzes Go, JavaScript/TypeScript, Python and
GitHub Actions with `security-extended` queries. Successful analysis uploads
findings; it does not itself assert zero vulnerabilities. It is not part of the
required `CI result` gate. Review its alerts and run results when merging code.

[Scorecard](../.github/workflows/scorecard.yml) publishes on every `main` push
and weekly, because repository policy and documentation changes can affect its
findings. It never publishes from untrusted pull requests and is not a merge
gate. Its OIDC publishing identity needs no personal token.

Both badges describe the default branch, not the last stable release. See
[Security Signals](SECURITY-SIGNALS.md) for evidence links and limitations.

## Local Validation

```sh
python3 -m unittest discover -s scripts -p 'test_ci.py' -v
python3 scripts/check-site.py
actionlint
cd e2e
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm exec playwright test --config=site.config.js
```

The website suite retains desktop/mobile screenshots and checks loaded assets,
WCAG A/AA automated rules, keyboard skip navigation, content presence, overflow,
and screenshot-pane alignment at 320, 720, 721, 1440, and 1920 pixels. It does
not replace human visual review or manual screen-reader testing.
