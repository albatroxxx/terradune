# Release Runbook

## Stable Contract

The supported installation channels are versioned GHCR Docker images and `go install` from a stable tag. The Go CLI flags and documented local workflow are the v1 compatibility surface. The internal JSON/SSE API is not a versioned public integration API. Generic resource rendering is not complete Terraform lifecycle support.

Use semantic versions: compatible fixes in patches, additive capabilities in minors, breaking documented behavior in majors. Never move an existing stable Git tag or deliberately overwrite an already published patch image. Moving `1`, `1.0`, and `latest` tags are convenience aliases; consumers needing immutable content must use the digest in release notes.

## Prepare

1. Update `VERSION`, the changelog, release notes under `docs/releases/vX.Y.Z.md`, Compose, README, and site installation/version metadata together. Keep documentation honest about the tested Terraform version and limitations.
2. Review base-image and toolchain updates. Terraform is rebuilt from a pinned upstream commit with the patched Go toolchain; retain its license and document the source. Do not suppress a security finding merely to unblock publication.
3. Run `go test -race ./...`, `go vet ./...`, `python3 scripts/check-site.py`, `git diff --check`, and the frontend suite. Inspect desktop/mobile browser layouts and screenshot only synthetic infrastructure.
4. Open a PR. Require all CI jobs: three native platforms, both Docker architectures, static-site validation, Go security checks, and Semgrep. Docker tests initialize built-in Terraform resources without cloud credentials or apply. Trivy gates fixable HIGH/CRITICAL findings in the actual image.
5. Merge the approved, green source to main. Enable GitHub Pages with GitHub Actions as its source. No paid hosting is required.

## Publish

Run the **Release** workflow from main, with input `tag=vX.Y.Z`. The first release uses manual dispatch so its stable tag does not exist before checks pass. The workflow repeats CI, validates `VERSION` and main ancestry, builds and pushes AMD64/ARM64 images, then verifies anonymous registry access before creating the GitHub release/tag.

On first publication, GitHub Packages defaults to private. In the package settings, change **only the Terradune container package** to public. The anonymous pull step waits up to five minutes; if it times out, change visibility and rerun the failed job. Public package visibility cannot be reverted to private through GitHub's normal settings. No source workspace or credentials are included in the allowlisted Docker build context.

The release includes a multi-platform digest, SBOM, and provenance attestations. A successful Release workflow triggers Pages; the site also supports manual deployment. Pages checks that the advertised stable release exists before deployment. A tag-triggered path remains for future releases, but manual dispatch avoids a prematurely installable tag.

## Verify After Publication

```sh
gh release view v1.0.0
docker buildx imagetools inspect ghcr.io/albatroxxx/terradune:1.0.0
docker pull ghcr.io/albatroxxx/terradune:1.0.0
go install github.com/albatroxxx/terradune@v1.0.0
terradune -version
```

Use a clean Docker config for the anonymous pull. Confirm both platforms and attestation manifests, the released digest, and the actual version string. If the Go proxy has not indexed a new tag, retry after propagation or use `GOPROXY=direct` for verification.

Check the live home, docs, releases, stylesheet, fonts, screenshot, and sitemap URLs. Set the repository homepage to the live site. Record CI links and validation in the PR. Search Console verification and sitemap submission require the site owner's account; deployment alone does not guarantee indexing or ranking.

## Failure And Recovery

Before release creation, a failed gate means no stable release should be announced. Fix the source via a PR and rerun validation. An image may already exist privately if publication failed at visibility; inspect it before retrying. If a GitHub release already exists, do not rerun a publishing job against that version. Fix an issue in a new patch release and move only the documented convenience tags through that release.

For a bad release, publish a clear advisory and a corrective patch; do not silently rewrite the tag or digest. Users can pin the previous verified digest. Keep weekly security scans and Dependabot active. See [SECURITY.md](../SECURITY.md) for private disclosure.
