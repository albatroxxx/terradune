# Security Signals

Security badges link to evidence, not an independent audit or a guarantee that
Terradune is vulnerability-free. They describe the repository's current default
branch, not necessarily the version installed on your machine.

## OpenSSF Scorecard

[Scorecard](https://scorecard.dev/viewer/?uri=github.com/albatroxxx/terradune)
measures automated security-practice checks and reports a score out of ten.
The [workflow](../.github/workflows/scorecard.yml) publishes results on changes
to `main` and weekly, using GitHub's short-lived OIDC identity. Public results
and badges can lag behind a completed run while the service refreshes.

Read the individual findings and scan date, not just the aggregate score.
Some checks are heuristic or not applicable to this project. Classic branch
protection may be unavailable to the default workflow token; a missing result
is not proof that protection is disabled. We do not give the scanner an admin
token or weaken repository controls to improve a number.

## CodeQL

The [CodeQL workflow](../.github/workflows/codeql.yml) runs the
`security-extended` queries for Go, JavaScript/TypeScript, Python, and GitHub
Actions. Findings appear in the repository's
[code-scanning dashboard](https://github.com/albatroxxx/terradune/security/code-scanning).
It scans source changes on pull requests and `main`, plus weekly and manual
runs. Documentation and image/CSS-only changes skip this workflow; the existing
CI selector continues to control application, browser, and website tests.

A green workflow badge means analysis completed successfully. It does **not**
mean the report contains no vulnerabilities. Review new alerts and record any
false-positive dismissal with its justification. Never use blanket exclusions
just to obtain a green badge. The existing gosec, govulncheck, staticcheck, and
Semgrep checks remain in CI and release validation.

## Dependency And Secret Checks

Dependabot proposes weekly updates for Go modules, GitHub Actions, and the
browser-test dependencies. GitHub dependency alerts and security-update PRs
complement `govulncheck`; they do not replace its reachable-code analysis.
Secret scanning and push protection complement the local private-key hook.
The [security policy](../SECURITY.md) describes private reporting and the
application's trust boundary.

## OpenSSF Best Practices

The [Best Practices program](https://www.bestpractices.dev/en/criteria/0)
is a free, evidence-backed **self-certification**. Terradune does not claim a
passing badge until its project entry has been completed and the requirements
are met. Automated scan results alone cannot establish all the criteria.

Evidence available for an assessment includes:

- [README](../README.md), [website documentation](https://albatroxxx.github.io/terradune/docs/),
  [Apache-2.0 license](../LICENSE), and the public issue/PR history.
- [Contributor checks](CONTRIBUTING.md), tests beside the Go packages, and
  [browser tests](../e2e/README.md).
- [CI](../.github/workflows/ci.yml), including race tests and static analysis,
  and [release validation](../.github/workflows/release.yml).
- [Release notes](releases/), [release policy](RELEASING.md), and
  [private vulnerability reporting](../SECURITY.md).

Before claiming passing, the maintainer must review every criterion, confirm
secure-development knowledge and private-report response history, audit open
security findings and credential alerts, and justify any not-applicable
answers. Public issue-response history and release identifier uniqueness also
need review; a passing build is not evidence for either. Historical version
uniqueness must not be assumed satisfied from today's release workflow alone.
