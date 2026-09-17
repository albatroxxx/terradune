# Browser Regression Tests

Development-only Playwright and axe checks against the real embedded Go UI.
The fixture server loads the synthetic platform plan; it never invokes
Terraform, OpenTofu, AWS, or apply. Nothing in this directory is required to
build or run the production binary.

Requirements: the Go version in `go.mod`, Node.js 22, and the pnpm version in
`package.json`.

```sh
cd e2e
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium firefox webkit
pnpm test
```

The runner starts and stops a build-tagged test server on `127.0.0.1:18393`.
Tests run serially within each browser because the SSE refresh fixture is
shared. CI isolates each browser in its own job. There are no automatic retries
or disabled axe rules. Screenshots and accessibility findings are retained;
failures also include traces and videos as seven-day CI artifacts.

Coverage includes Resource Map/Plan/Graph, keyboard tab navigation, filters,
resource dialogs, pin/legend/expanded-view behavior, live-update focus,
320px/390px layouts, and WCAG 2.0/2.1 A/AA automated checks. WebKit is engine
coverage, not a claim that real Safari/iOS or every assistive technology has
been tested. Manual screen-reader and 200%/400% browser-zoom testing remain
recommended.

On restricted desktop sandboxes, browser processes may not be permitted to
start. Run the suite on a supported developer machine or inspect the CI
artifacts; do not treat an infrastructure launch failure as a passing test.

For a manual browser check from the repository root:

```sh
go run -tags=e2e ./internal/e2eserver
```

The `/__test/refresh` POST endpoint exists only in that test command, not in
the production server. It broadcasts the fixture again to test live updates.
