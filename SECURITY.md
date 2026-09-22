# Security Policy

## Supported Versions

Security fixes target the latest stable 1.x release. Development snapshots and pre-v1 revisions are not supported release channels. Upgrade to the latest patch when reporting a problem.

## Report Privately

Use [GitHub private vulnerability reporting](https://github.com/albatroxxx/terradune/security/advisories/new). Do not include real state, plans, credentials, account identifiers, or unredacted logs in public issues. Provide a synthetic reproduction, affected version, installation method, and expected versus observed behavior. This volunteer project does not promise a response-time SLA.

## Trust Boundary

- Terradune is a local, single-user tool with no authentication or TLS. Keep the server bound to loopback. DNS rebinding checks and browser response headers are defense in depth, not authorization.
- Run only trusted Terraform projects. Planning can load provider executables, contact backends/cloud APIs, and execute external data sources. `-refresh=false` does not make planning offline. Terradune does not invoke apply.
- Terraform sensitivity masks are applied to inventory metadata and detail values. Unmarked secrets, resource addresses, file paths, and Terraform/provider diagnostics are not automatically anonymized. Do not expose the API or share raw screenshots without inspection.
- Prefer short-lived provider credentials. The workspace must be writable for initialization and state locking.
- Embedded UI assets avoid CDN requests. Terraform itself still makes network requests required by the configuration.

CI runs static analysis and dependency vulnerability checks. A passing scan is a point-in-time signal, not a guarantee that no vulnerabilities exist. Weekly CI and dependency updates keep the checks active after release.
