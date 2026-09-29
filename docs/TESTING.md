# Test Coverage

Terradune combines Go unit/process tests, real Terraform/OpenTofu integration,
browser regressions, accessibility checks, and tests for CI tooling. Coverage
numbers describe first-party Go statements, not JavaScript coverage, branch
coverage, every AWS resource schema, or a guarantee of correctness.

## Repeatable Measurement

From the repository root, with Go from `go.mod`, Node.js 22+, and Python 3.10+:

```sh
go test -race -count=1 -covermode=atomic -coverprofile=coverage.out ./...
go tool cover -func=coverage.out
python3 scripts/check-coverage.py coverage.out
python3 -m unittest discover -s scripts -p 'test_*.py' -v
```

The Go CI matrix enforces **85% statement coverage in every production
package**, on Linux, macOS, and Windows. A new package is also subject to that
floor. Missing current packages, malformed profiles, duplicate blocks, and
empty measurements fail closed. Each run publishes its report in the job
summary and retains the raw profile for seven days. The existing path selector
still skips Go jobs for website/documentation-only changes.

The 2026-09-29 broad-coverage expansion measured **91.1% overall**, up from
67.4%, in three consecutive race-enabled local runs:

| Package | Before | After |
| --- | ---: | ---: |
| CLI and scheduler | 26.2% | 92.4% |
| Graph and resource details | 85.0% | 88.6% |
| Ingestion and discovery | 31.2% | 95.3% |
| HTTP and live updates | 70.7% | 95.8% |
| File watching | 87.0% | 87.0% |

The baseline was commit `e6b4059d42a3d8f1958d2ff5324c64575c7366a0`.
These measurements exclude the separately invoked real-CLI integration suite
and browser suites, which add behavioral checks rather than inflate this
percentage. The portable fake CLI is under `testdata` and is not shipped or
included in the production coverage denominator.

## Behavior And Input Coverage

| Surface | Automated evidence |
| --- | --- |
| CLI startup and flags | Version/help output, repeated variables, print-only success and mixed workspace failures, invalid hosts/ports/paths, occupied ports, server startup, published success/error states, cancellation and shutdown in `main_test.go` and `run_test.go` |
| Workspace discovery and scheduling | Default/custom/absolute data directories, nested ownership, path-prefix collisions, excluded metadata directories, shared edits, bounded concurrency and coalescing in ingestion, scheduler, and watcher tests |
| Process boundary | Plan/show/graph protocol, argument preservation including spaces and shell metacharacters, refresh mode, locking, missing variables/CLI/init, command errors, invalid JSON, best-effort graph, in-flight cancellation, and temporary-plan cleanup in `internal/ingest/load_test.go` |
| Terraform lifecycle and relationships | Create/update/delete/no-op/read and both replacement orders; before/after/unknown/sensitive values; module/for-each references; attachment changes; synthetic VPC, dense, mixed-workload, and layered fixtures in ingestion and graph tests |
| HTTP inputs and trust boundary | Host/method validation, security headers, unknown workspaces/resources, sensitive-data redaction, serialization failures, and slow response writes in server tests |
| Live updates | Initial snapshot, graph/rebuilding/error transitions, preserved last-good graph, heartbeat, every SSE chunk's write failure, non-streaming writers, cancellation cleanup, and queued latest-state replacement in server tests |
| User interface | Search/workspace/action/changes-only filters, resource-type navigation, before/after dialogs, single/double-click dependency focus, sections, graph edges, keyboard controls, live-update focus, responsive layouts, and axe checks in `e2e/tests` and server frontend tests |
| Real executables | Terraform and OpenTofu init/plan/show/graph, input precedence, errors, cancellation and no applied state, across three operating systems in `internal/ingest/integration_test.go` |
| Website and tooling | Chromium layout/accessibility/media checks, metadata/link validation, CI selection/merge-gate tests, source checks, and coverage-gate regression tests |

The process fixture rejects unexpected commands and records exact invocations.
Tests never run against user workspaces or AWS accounts. The real-CLI suite
initializes only temporary configurations using Terraform's built-in provider;
it does not apply infrastructure. SSE heartbeat tests use Go's virtual-time
`testing/synctest` rather than waiting 25 wall-clock seconds.

See [browser instructions](../e2e/README.md) and [CI policy](CI.md) for the
separately run integration checks. To exercise a locally installed real CLI:

```sh
TERRADUNE_TEST_CLI="$(command -v terraform)" go test -race -count=1 -run TestCLIIntegration ./internal/ingest
TERRADUNE_TEST_CLI="$(command -v tofu)" go test -race -count=1 -run TestCLIIntegration ./internal/ingest
```

## Remaining Limits

Broad coverage is not exhaustive coverage. Rare OS/filesystem failures,
process-exit paths, every Terraform/provider input combination, and every
browser/assistive-technology combination are not covered. Go statement
coverage does not measure how many branches or input fields were tested;
the behavior map above supplies additional evidence without inventing a
branch-coverage percentage. Manual screen-reader and high-zoom checks,
additional real-world plan fixtures, and fuzzing remain useful follow-ups.

When adding behavior, extend the corresponding success, failure, and boundary
tests. Do not remove statements from coverage, add unasserted calls, weaken
thresholds, or bypass security checks just to improve a badge.
