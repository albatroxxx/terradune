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
is a free, evidence-backed **self-certification**. The
[Terradune assessment](https://www.bestpractices.dev/en/projects/15009/passing)
earned the **Passing** badge on 2026-09-29. Its 100% completion is not a security
score, independent audit, or claim of 100% test coverage. The README badge uses
the project's live status endpoint, not a static passing image.

Evidence available for an assessment includes:

- [README](../README.md), [website documentation](https://albatroxxx.github.io/terradune/docs/),
  [Apache-2.0 license](../LICENSE), and the public issue/PR history.
- [Contributor checks](CONTRIBUTING.md), tests beside the Go packages, and
  [browser tests](../e2e/README.md).
- [CI](../.github/workflows/ci.yml), including race tests and static analysis,
  and [release validation](../.github/workflows/release.yml).
- [Release notes](releases/), [release policy](RELEASING.md), and
  [private vulnerability reporting](../SECURITY.md).

The assessment combines repository evidence, an audit of all seven stable
release tags against the commits recorded by the public Go proxy, and explicit
maintainer attestations of secure-development knowledge and no private
vulnerability reports received during the assessment period. Reassess the
report-response criterion when a report arrives; the badge does not create a
response-time SLA.

The optional `test_most` recommendation is supported by the
[test coverage report and behavior map](TESTING.md): expanded CLI, ingestion,
and streaming-response tests raised measured Go statement coverage from 67.4%
to 91.1%. CI enforces an 85% floor for each production Go package. The separate
real-CLI and browser suites cover additional behavior, inputs, and failure
paths. This is evidence of broad coverage, not a claim that every branch or
input combination is tested. See the report for reproduction commands,
measurement scope, and remaining gaps. Passing permits unmet suggestions;
required criteria still need evidence or an allowed not-applicable justification.

Keep the public assessment current as release practices, reporting history,
security findings, and tests change. Automated scans cannot establish personal
maintainer knowledge or private-report response times.
