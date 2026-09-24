# Release Runbook

## Stable Contract

Terradune is installed with `go install` from a stable tag. Go 1.27.1 or
newer and a separate Terraform or OpenTofu CLI are required. The CLI flags
and documented local workflow are the v1 compatibility surface. The internal
JSON/SSE API is not a versioned public API.

Never move an existing stable tag. Published Go module versions are immutable
in the public proxy and checksum database. Fix a release with a new version.

## Prepare

1. Update `VERSION`, `CHANGELOG.md`, `docs/releases/vX.Y.Z.md`, README,
   and the site's installation examples and version metadata together.
2. Run `go test -race ./...`, `go vet ./...`,
   `python3 scripts/check-site.py`, `git diff --check`, and the browser suite.
   Inspect desktop/mobile layouts using synthetic infrastructure.
3. Open a PR and require green CI: Linux/macOS/Windows build, Go installation,
   formatting, vet and race tests; real Terraform/OpenTofu integration tests;
   Chromium/Firefox/WebKit accessibility tests; site validation; security scans.
4. Merge the green PR to main. Pages defers deployment until the advertised
   stable release exists.

## Publish

Dispatch the **Release** workflow from main with `tag=vX.Y.Z`. It repeats
CI, checks the version and main ancestry, and verifies `go install` from
the exact source commit before creating the stable tag and GitHub release.
It then installs the tagged module through Go's normal proxy/checksum path
and verifies that `terradune -version` reports the released version.

A successful Release workflow triggers Pages. The site can also be deployed
manually; its release-existence gate still applies.

## Verify After Publication

```sh
gh release view v1.0.4
go install github.com/albatroxxx/terradune@v1.0.4
terradune -version
```

Verify `@latest` as well. Allow time for the public Go proxy to discover the
tag. Keep checksum verification enabled. Record the release source commit
and CI links in the PR.

Check the live home, installation guide, releases page, images, and sitemap.
Search Console indexing remains independent of deployment.

## Failure Handling

If validation fails before publication, fix the source through a PR and repeat
the checks. If the release exists but the final installation check fails,
investigate propagation or package errors; rerun only the verification step,
not release creation. Never silently replace a published tag.

Security scans run weekly as well as on changes. See [SECURITY.md](../SECURITY.md).
